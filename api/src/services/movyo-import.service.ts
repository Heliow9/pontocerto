import {pool} from '../db/pool.js';
import {env} from '../config/env.js';
import {BRASILIA_NOW_SQL} from '../utils/db-time.js';
import {getMovyoCustomer,getMovyoLicense,listMovyoCustomers,syncMovyoSubscription} from './movyo-client.service.js';
import {classifyMovyoImport,mapMovyoCustomer,missingCommercialBillingFields,type MovyoRemoteCustomer} from './movyo-import-core.js';
import {syncSubscriptionOperationalState} from './product-integration.service.js';

const integrationError=(message:string,status=400,code='MOVYO_INTEGRATION_ERROR',details?:unknown)=>Object.assign(new Error(message),{status,code,details});
const json=(value:unknown)=>JSON.stringify(value??null);
const digits=(value:unknown)=>String(value??'').replace(/\D/g,'');
const stableStatuses=new Set(['PONTO_CERTO','CUTOVER_PENDING']);
const toMysqlDateTime=(value:unknown)=>{
  const raw=String(value??'').trim();
  if(!raw)return null;
  const plain=raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?$/);
  if(plain)return `${plain[1]} ${plain[2]}`;
  const d=new Date(raw);
  if(Number.isNaN(d.getTime()))return null;
  const brasilia=new Date(d.getTime()-3*60*60*1000);
  return brasilia.toISOString().slice(0,19).replace('T',' ');
};

function customerFromRow(row:any){
  return{
    legalName:String(row?.legal_name||''),tradeName:row?.trade_name||null,personType:row?.person_type||'PJ',document:row?.document||null,
    email:row?.email||null,phone:row?.phone||null,financialContactName:row?.financial_contact_name||null,
    financialContactDocument:row?.financial_contact_document||null,financialContactEmail:row?.financial_contact_email||null,
    financialContactPhone:row?.financial_contact_phone||null,zipCode:row?.zip_code||null,street:row?.street||null,number:row?.number||null,
    complement:row?.complement||null,district:row?.district||null,city:row?.city||null,state:row?.state||null,status:row?.status||'ACTIVE',
  } as ReturnType<typeof mapMovyoCustomer>['customer'];
}

function remoteSubscriptionStatus(remote:MovyoRemoteCustomer,missing:string[]){
  if(missing.length)return'PENDING_DATA';
  const status=String(remote.statusAssinatura||'').toLowerCase();
  if(status.includes('cancel'))return'CANCELED';
  if(status.includes('bloque'))return'BLOCKED';
  return'ACTIVE';
}

async function mappingRow(externalId:string,db:any=pool,forUpdate=false){
  const [rows]=await db.query(`SELECT * FROM movyo_integration_mappings WHERE movyo_restaurant_id=? LIMIT 1${forUpdate?' FOR UPDATE':''}`,[externalId]);
  return rows[0]||null;
}

async function customerMatches(document:string|null,db:any=pool){
  const normalized=digits(document);
  if(!normalized)return[];
  const [rows]=await db.query('SELECT * FROM commercial_customers WHERE document=? ORDER BY id LIMIT 3',[normalized]);
  return rows;
}

async function getMovyoCatalog(planCode:string|null,db:any=pool){
  const [products]=await db.query("SELECT * FROM commercial_products WHERE code='MOVYO' LIMIT 1");
  const product=products[0];
  if(!product)throw integrationError('Produto Movyo não está cadastrado no Ponto Certo.',409,'MOVYO_PRODUCT_NOT_CONFIGURED');
  if(!planCode)return{product,plan:null};
  const [plans]=await db.query('SELECT * FROM commercial_product_plans WHERE product_id=? AND code=? LIMIT 1',[product.id,planCode]);
  return{product,plan:plans[0]||null};
}

async function upsertDirectoryMapping(remote:MovyoRemoteCustomer){
  const mapped=mapMovyoCustomer(remote),externalId=mapped.externalId;
  if(!externalId)return{externalId,status:'ERROR',error:'Movyo retornou cliente sem identificador.'};
  const existing=await mappingRow(externalId);
  const matches=await customerMatches(mapped.customer.document);
  const detected=classifyMovyoImport(remote,{matchCount:matches.length,alreadyImported:Boolean(existing?.product_subscription_id)});
  const nextStatus=stableStatuses.has(String(existing?.migration_status||''))?String(existing.migration_status):detected==='ALREADY_IMPORTED'?String(existing?.migration_status||'READY_TO_MIGRATE'):detected;
  if(existing){
    await pool.query(`UPDATE movyo_integration_mappings SET migration_status=?,last_remote_snapshot_json=?,last_error=NULL,last_sync_at=${BRASILIA_NOW_SQL},updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[nextStatus,json(remote),existing.id]);
  }else{
    await pool.query(`INSERT INTO movyo_integration_mappings(movyo_restaurant_id,commercial_customer_id,product_subscription_id,migration_status,last_remote_snapshot_json,last_error,last_sync_at,created_at,updated_at) VALUES(?,?,?,?,?,NULL,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,[externalId,matches.length===1?Number(matches[0].id):null,null,nextStatus,json(remote)]);
  }
  return{externalId,status:nextStatus,matchCount:matches.length};
}

export async function syncMovyoDirectory(){
  const response=await listMovyoCustomers();
  const customers=Array.isArray(response?.customers)?response.customers:[];
  const results=[] as any[];
  for(const remote of customers){
    try{results.push(await upsertDirectoryMapping(remote));}
    catch(error:any){
      const externalId=String(remote?.id||'');
      if(externalId){
        const existing=await mappingRow(externalId);
        if(existing)await pool.query(`UPDATE movyo_integration_mappings SET migration_status='ERROR',last_remote_snapshot_json=?,last_error=?,last_sync_at=${BRASILIA_NOW_SQL},updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[json(remote),String(error?.message||error).slice(0,500),existing.id]);
        else await pool.query(`INSERT INTO movyo_integration_mappings(movyo_restaurant_id,migration_status,last_remote_snapshot_json,last_error,last_sync_at,created_at,updated_at) VALUES(?,'ERROR',?,?,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,[externalId,json(remote),String(error?.message||error).slice(0,500)]);
      }
      results.push({externalId,status:'ERROR',error:String(error?.message||error)});
    }
  }
  return{found:customers.length,processed:results.length,results};
}

export async function getMovyoIntegrationStatus(){
  const [rows]=await pool.query<any[]>(`SELECT migration_status,COUNT(*) AS total FROM movyo_integration_mappings GROUP BY migration_status`);
  const counts:Record<string,number>={};for(const row of rows)counts[String(row.migration_status)]=Number(row.total||0);
  const [last]=await pool.query<any[]>(`SELECT MAX(last_sync_at) AS last_sync_at FROM movyo_integration_mappings`);
  return{bridgeEnabled:env.MOVYO_BRIDGE_ENABLED==='1',bridgeConfigured:Boolean(env.MOVYO_BRIDGE_BASE_URL&&env.MOVYO_BRIDGE_SECRET),counts,total:Object.values(counts).reduce((a,b)=>a+b,0),lastSyncAt:last[0]?.last_sync_at||null};
}

export async function listMovyoIntegrationCustomers(filters:{status?:string;q?:string}={}){
  const where=['1=1'],args:any[]=[];
  if(filters.status){where.push('m.migration_status=?');args.push(filters.status);}
  if(filters.q){where.push('(cc.legal_name LIKE ? OR cc.document LIKE ? OR m.last_remote_snapshot_json LIKE ?)');for(let i=0;i<3;i++)args.push(`%${filters.q}%`);}
  const [rows]=await pool.query<any[]>(`SELECT m.*,cc.legal_name AS customer_name,cc.document AS customer_document,cc.financial_contact_email AS customer_financial_email,cc.zip_code AS customer_zip_code,cc.street AS customer_street,cc.number AS customer_number,cc.district AS customer_district,cc.city AS customer_city,cc.state AS customer_state,ps.status AS subscription_status,ps.billing_source,ps.monthly_price,ps.discount_percent,ps.current_period_end,ps.next_due_date,cpp.code AS plan_code,cpp.name AS plan_name FROM movyo_integration_mappings m LEFT JOIN commercial_customers cc ON cc.id=m.commercial_customer_id LEFT JOIN product_subscriptions ps ON ps.id=m.product_subscription_id LEFT JOIN commercial_product_plans cpp ON cpp.id=ps.product_plan_id WHERE ${where.join(' AND ')} ORDER BY COALESCE(cc.legal_name,m.movyo_restaurant_id)`,args);
  return rows.map((row:any)=>({...row,id:Number(row.id),commercial_customer_id:row.commercial_customer_id==null?null:Number(row.commercial_customer_id),product_subscription_id:row.product_subscription_id==null?null:Number(row.product_subscription_id),monthly_price:row.monthly_price==null?null:Number(row.monthly_price),discount_percent:row.discount_percent==null?null:Number(row.discount_percent),remote:(()=>{try{return row.last_remote_snapshot_json?JSON.parse(row.last_remote_snapshot_json):null;}catch{return null;}})()}));
}

export async function importMovyoCustomer(externalIdInput:string|number,options:{commercialCustomerId?:number}={}){
  const externalId=String(externalIdInput),remote:any=await getMovyoCustomer(externalId),mapped=mapMovyoCustomer(remote);
  if(mapped.externalId&&mapped.externalId!==externalId)throw integrationError('Identificador retornado pela Movyo diverge do solicitado.',409,'MOVYO_ID_MISMATCH');
  let selectedCustomer:any=null;
  if(options.commercialCustomerId){
    const [rows]=await pool.query<any[]>('SELECT * FROM commercial_customers WHERE id=? LIMIT 1',[options.commercialCustomerId]);
    selectedCustomer=rows[0]||null;
    if(!selectedCustomer)throw integrationError('Cliente comercial selecionado não foi encontrado.',404,'COMMERCIAL_CUSTOMER_NOT_FOUND');
  }
  const matches=selectedCustomer?[selectedCustomer]:await customerMatches(mapped.customer.document);
  if(!selectedCustomer&&matches.length>1){
    await ensureMapping(externalId,remote,'CONFLICT',null,null,'Mais de um cliente comercial corresponde ao documento Movyo.');
    return{imported:false,status:'CONFLICT',externalId};
  }
  if(matches.length===1)selectedCustomer=matches[0];
  const billingCustomer=selectedCustomer?customerFromRow(selectedCustomer):mapped.customer;
  const missing=missingCommercialBillingFields(billingCustomer);
  const {product,plan}=await getMovyoCatalog(mapped.planCode);
  if(!plan){
    await ensureMapping(externalId,remote,'PENDING_DATA',selectedCustomer?.id||null,null,`Plano Movyo não mapeado: ${mapped.planCode||'(vazio)'}`);
    return{imported:false,status:'PENDING_DATA',externalId,missing:[...missing,'planCode']};
  }
  if(missing.length){
    await ensureMapping(externalId,remote,'PENDING_DATA',selectedCustomer?.id||null,null,`Cadastro incompleto: ${missing.join(', ')}`);
    return{imported:false,status:'PENDING_DATA',externalId,missing};
  }

  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    let mapping=await mappingRow(externalId,conn,true);
    let customerId=selectedCustomer?Number(selectedCustomer.id):null;
    if(!customerId){
      const c=mapped.customer;
      const [r]=await conn.query<any>(`INSERT INTO commercial_customers(legal_name,trade_name,person_type,document,email,phone,financial_contact_name,financial_contact_document,financial_contact_email,financial_contact_phone,zip_code,street,number,complement,district,city,state,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,[c.legalName,c.tradeName,c.personType,c.document,c.email,c.phone,c.financialContactName,c.financialContactDocument,c.financialContactEmail,c.financialContactPhone,c.zipCode,c.street,c.number,c.complement,c.district,c.city,c.state]);
      customerId=Number(r.insertId);
    }
    const [existingSubscriptions]=await conn.query<any[]>(`SELECT * FROM product_subscriptions WHERE product_id=? AND external_source='MOVYO' AND external_account_id=? LIMIT 1 FOR UPDATE`,[product.id,externalId]);
    let subscriptionId:number;
    if(existingSubscriptions[0]){
      subscriptionId=Number(existingSubscriptions[0].id);
    }else{
      const price=mapped.monthlyPriceOverride??Number(plan.price_monthly||0);
      const status=remoteSubscriptionStatus(remote,missing);
      const [r]=await conn.query<any>(`INSERT INTO product_subscriptions(commercial_customer_id,product_id,product_plan_id,external_source,external_account_id,billing_source,status,monthly_price,discount_percent,starts_at,current_period_end,next_due_date,billing_provider,billing_method,grace_days,auto_block,metadata_json,created_at,updated_at) VALUES(?,?,?,'MOVYO',?,'MOVYO_LEGACY',?,?,?,?,?,?,?,?,?,?,?,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,[customerId,product.id,plan.id,externalId,status,price,mapped.discountPercent,toMysqlDateTime(mapped.startsAt),toMysqlDateTime(mapped.currentPeriodEnd),mapped.nextDueDate,product.default_provider||null,product.default_payment_method||null,Number(product.default_grace_days??3),Number(product.default_auto_block??1),json({importedFrom:'MOVYO',legacyStatus:remote.statusAssinatura||null})]);
      subscriptionId=Number(r.insertId);
    }
    if(mapping){
      await conn.query(`UPDATE movyo_integration_mappings SET commercial_customer_id=?,product_subscription_id=?,migration_status='READY_TO_MIGRATE',last_remote_snapshot_json=?,last_error=NULL,last_sync_at=${BRASILIA_NOW_SQL},updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[customerId,subscriptionId,json(remote),mapping.id]);
    }else{
      await conn.query(`INSERT INTO movyo_integration_mappings(movyo_restaurant_id,commercial_customer_id,product_subscription_id,migration_status,last_remote_snapshot_json,last_sync_at,created_at,updated_at) VALUES(?,?,?,'READY_TO_MIGRATE',?,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,[externalId,customerId,subscriptionId,json(remote)]);
    }
    await conn.commit();
    return{imported:true,status:'READY_TO_MIGRATE',externalId,commercialCustomerId:customerId,productSubscriptionId:subscriptionId,preservedPaidThrough:mapped.currentPeriodEnd};
  }catch(error){await conn.rollback();throw error;}finally{conn.release();}
}

async function ensureMapping(externalId:string,remote:unknown,status:string,customerId:number|null,subscriptionId:number|null,error:string|null){
  const existing=await mappingRow(externalId);
  if(existing)await pool.query(`UPDATE movyo_integration_mappings SET commercial_customer_id=COALESCE(?,commercial_customer_id),product_subscription_id=COALESCE(?,product_subscription_id),migration_status=?,last_remote_snapshot_json=?,last_error=?,last_sync_at=${BRASILIA_NOW_SQL},updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[customerId,subscriptionId,status,json(remote),error,existing.id]);
  else await pool.query(`INSERT INTO movyo_integration_mappings(movyo_restaurant_id,commercial_customer_id,product_subscription_id,migration_status,last_remote_snapshot_json,last_error,last_sync_at,created_at,updated_at) VALUES(?,?,?,?,?,?,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,[externalId,customerId,subscriptionId,status,json(remote),error]);
}

export async function resolveMovyoCustomer(externalIdInput:string|number,commercialCustomerId:number){
  const externalId=String(externalIdInput);
  const [rows]=await pool.query<any[]>('SELECT * FROM commercial_customers WHERE id=? LIMIT 1',[commercialCustomerId]);
  if(!rows[0])throw integrationError('Cliente comercial selecionado não foi encontrado.',404,'COMMERCIAL_CUSTOMER_NOT_FOUND');
  const remote:any=await getMovyoCustomer(externalId);
  const missing=missingCommercialBillingFields(customerFromRow(rows[0]));
  const mapped=mapMovyoCustomer(remote),catalog=await getMovyoCatalog(mapped.planCode);
  const status=missing.length||!catalog.plan?'PENDING_DATA':'READY_TO_MIGRATE';
  await ensureMapping(externalId,remote,status,commercialCustomerId,null,missing.length?`Cadastro incompleto: ${missing.join(', ')}`:!catalog.plan?'Plano Movyo não mapeado.':null);
  if(status==='READY_TO_MIGRATE')return importMovyoCustomer(externalId,{commercialCustomerId});
  return{resolved:true,status,externalId,commercialCustomerId,missing};
}

export async function cutoverMovyoCustomer(externalIdInput:string|number){
  const externalId=String(externalIdInput),remote:any=await getMovyoCustomer(externalId);
  if(Number(remote?.legacyBilling?.openCount||0)>0)throw integrationError('Existe cobrança Pix legada da mensalidade Movyo ainda aberta.',409,'MOVYO_LEGACY_CHARGE_OPEN',{openCount:Number(remote.legacyBilling.openCount)});
  const mapping=await mappingRow(externalId);
  if(!mapping)throw integrationError('Cliente Movyo ainda não foi importado.',404,'MOVYO_MAPPING_NOT_FOUND');
  if(mapping.migration_status==='PONTO_CERTO')return{cutover:true,reused:true,externalId,productSubscriptionId:Number(mapping.product_subscription_id)};
  if(mapping.migration_status!=='READY_TO_MIGRATE'&&mapping.migration_status!=='CUTOVER_PENDING')throw integrationError('Cliente Movyo ainda não está pronto para migração.',409,'MOVYO_NOT_READY_FOR_CUTOVER',{status:mapping.migration_status});
  if(!mapping.product_subscription_id)throw integrationError('Assinatura Movyo importada não foi encontrada.',409,'MOVYO_SUBSCRIPTION_NOT_IMPORTED');
  await pool.query(`UPDATE movyo_integration_mappings SET migration_status='CUTOVER_PENDING',last_error=NULL,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[mapping.id]);
  try{
    await syncSubscriptionOperationalState(Number(mapping.product_subscription_id),'CUTOVER');
    const conn=await pool.getConnection();
    try{
      await conn.beginTransaction();
      const locked=await mappingRow(externalId,conn,true);
      if(!locked)throw integrationError('Mapeamento Movyo desapareceu durante o cutover.',409,'MOVYO_MAPPING_NOT_FOUND');
      await conn.query(`UPDATE product_subscriptions SET billing_source='PONTO_CERTO',updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[locked.product_subscription_id]);
      await conn.query(`UPDATE movyo_integration_mappings SET migration_status='PONTO_CERTO',cutover_at=COALESCE(cutover_at,${BRASILIA_NOW_SQL}),last_error=NULL,last_sync_at=${BRASILIA_NOW_SQL},updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[locked.id]);
      await conn.commit();
      return{cutover:true,reused:false,externalId,productSubscriptionId:Number(locked.product_subscription_id)};
    }catch(error){await conn.rollback();throw error;}finally{conn.release();}
  }catch(error:any){
    await pool.query(`UPDATE movyo_integration_mappings SET migration_status='ERROR',last_error=?,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[String(error?.message||error).slice(0,500),mapping.id]).catch(()=>undefined);
    throw error;
  }
}

export async function rollbackMovyoCustomer(externalIdInput:string|number){
  const externalId=String(externalIdInput),mapping=await mappingRow(externalId);
  if(!mapping||mapping.migration_status!=='PONTO_CERTO'||!mapping.product_subscription_id)throw integrationError('Cliente não está em gestão Ponto Certo para rollback.',409,'MOVYO_ROLLBACK_NOT_ALLOWED');
  const [paid]=await pool.query<any[]>(`SELECT id FROM financial_charges WHERE product_subscription_id=? AND status='PAID' AND paid_at>=? LIMIT 1`,[mapping.product_subscription_id,mapping.cutover_at||'1970-01-01 00:00:00']);
  if(paid[0])throw integrationError('Rollback bloqueado porque já existe período pago pelo Ponto Certo após o cutover.',409,'MOVYO_ROLLBACK_HAS_PAID_PERIOD');
  const [subs]=await pool.query<any[]>('SELECT * FROM product_subscriptions WHERE id=? LIMIT 1',[mapping.product_subscription_id]);
  const subscription=subs[0];if(!subscription)throw integrationError('Assinatura Movyo não encontrada.',404,'PRODUCT_SUBSCRIPTION_NOT_FOUND');
  const payload={billingSource:'MOVYO_LEGACY',billingStatus:'ACTIVE',billingAccessBlocked:false,pontoCertoCustomerId:String(mapping.commercial_customer_id||''),pontoCertoSubscriptionId:String(mapping.product_subscription_id),planCode:null,currentPeriodEnd:subscription.current_period_end||null,graceUntil:null,charge:null};
  await syncMovyoSubscription(externalId,payload,`movyo:rollback:${mapping.id}`);
  await pool.query(`UPDATE product_subscriptions SET billing_source='MOVYO_LEGACY',status='ACTIVE',blocked_at=NULL,grace_until=NULL,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[mapping.product_subscription_id]);
  await pool.query(`UPDATE movyo_integration_mappings SET migration_status='LEGACY_MOVYO',rollback_at=${BRASILIA_NOW_SQL},last_error=NULL,last_sync_at=${BRASILIA_NOW_SQL},updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[mapping.id]);
  return{rolledBack:true,externalId,productSubscriptionId:Number(mapping.product_subscription_id)};
}

export async function reconcileMovyoCustomer(externalIdInput:string|number){
  const externalId=String(externalIdInput),mapping=await mappingRow(externalId);
  if(!mapping||!mapping.product_subscription_id)throw integrationError('Assinatura Movyo importada não encontrada.',404,'MOVYO_SUBSCRIPTION_NOT_IMPORTED');
  const license:any=await getMovyoLicense(externalId);
  if(String(license?.billingSource||'').toUpperCase()==='PONTO_CERTO'&&['CUTOVER_PENDING','ERROR'].includes(String(mapping.migration_status))){
    await pool.query(`UPDATE product_subscriptions SET billing_source='PONTO_CERTO',updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[mapping.product_subscription_id]);
    await pool.query(`UPDATE movyo_integration_mappings SET migration_status='PONTO_CERTO',cutover_at=COALESCE(cutover_at,${BRASILIA_NOW_SQL}),last_error=NULL,last_sync_at=${BRASILIA_NOW_SQL},updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[mapping.id]);
    return{reconciled:true,direction:'REMOTE_CONFIRMED_CUTOVER',license};
  }
  if(String(mapping.migration_status)==='PONTO_CERTO'){
    await syncSubscriptionOperationalState(Number(mapping.product_subscription_id),'RECONCILE');
    await pool.query(`UPDATE movyo_integration_mappings SET last_error=NULL,last_sync_at=${BRASILIA_NOW_SQL},updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[mapping.id]);
    return{reconciled:true,direction:'PONTO_CERTO_TO_MOVYO',license};
  }
  return{reconciled:false,direction:'NO_CHANGE',license};
}
