import {pool} from '../db/pool.js';
import {BRASILIA_NOW_SQL} from '../utils/db-time.js';
import {normalizeCommercialCustomer,type CommercialCustomerInput} from './commercial-customer-core.js';

const notFound=()=>Object.assign(new Error('Cliente comercial não encontrado.'),{status:404,code:'COMMERCIAL_CUSTOMER_NOT_FOUND'});
export async function listCommercialCustomers(filters:{q?:string;status?:string;productCode?:string}={}){
  const where=['1=1'],args:any[]=[];
  if(filters.q){where.push('(cc.legal_name LIKE ? OR cc.trade_name LIKE ? OR cc.document LIKE ? OR cc.financial_contact_email LIKE ?)');for(let i=0;i<4;i++)args.push(`%${filters.q}%`);}
  if(filters.status){where.push('cc.status=?');args.push(filters.status);}
  if(filters.productCode){where.push('EXISTS(SELECT 1 FROM product_subscriptions ps2 JOIN commercial_products cp2 ON cp2.id=ps2.product_id WHERE ps2.commercial_customer_id=cc.id AND cp2.code=?)');args.push(filters.productCode);}
  const [rows]=await pool.query<any[]>(`SELECT cc.*,COUNT(DISTINCT ps.id) AS subscriptions_count,COALESCE(SUM(CASE WHEN ps.status IN ('ACTIVE','GRACE','PAST_DUE') THEN ps.monthly_price*(1-ps.discount_percent/100) ELSE 0 END),0) AS mrr FROM commercial_customers cc LEFT JOIN product_subscriptions ps ON ps.commercial_customer_id=cc.id WHERE ${where.join(' AND ')} GROUP BY cc.id ORDER BY cc.legal_name`,args);
  return rows.map(r=>({...r,id:Number(r.id),tenant_id:r.tenant_id==null?null:Number(r.tenant_id),subscriptions_count:Number(r.subscriptions_count||0),mrr:Number(r.mrr||0)}));
}
export async function getCommercialCustomer(id:number){
  const [rows]=await pool.query<any[]>('SELECT * FROM commercial_customers WHERE id=? LIMIT 1',[id]);if(!rows[0])throw notFound();
  const [subscriptions]=await pool.query<any[]>(`SELECT ps.*,cp.code AS product_code,cp.name AS product_name,cpp.code AS plan_code,cpp.name AS plan_name FROM product_subscriptions ps JOIN commercial_products cp ON cp.id=ps.product_id LEFT JOIN commercial_product_plans cpp ON cpp.id=ps.product_plan_id WHERE ps.commercial_customer_id=? ORDER BY cp.name`,[id]);
  return{...rows[0],id:Number(rows[0].id),subscriptions};
}
export async function findCommercialCustomerByDocument(document:string){const digits=document.replace(/\D/g,'');if(!digits)return null;const [rows]=await pool.query<any[]>('SELECT * FROM commercial_customers WHERE document=? ORDER BY id LIMIT 2',[digits]);return rows.length===1?rows[0]:rows;}
export async function createCommercialCustomer(input:CommercialCustomerInput){const d=normalizeCommercialCustomer(input);const [r]=await pool.query<any>(`INSERT INTO commercial_customers(legal_name,trade_name,person_type,document,email,phone,financial_contact_name,financial_contact_document,financial_contact_email,financial_contact_phone,zip_code,street,number,complement,district,city,state,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,[d.legalName,d.tradeName,d.personType,d.document,d.email,d.phone,d.financialContactName,d.financialContactDocument,d.financialContactEmail,d.financialContactPhone,d.zipCode,d.street,d.number,d.complement,d.district,d.city,d.state,d.status]);return getCommercialCustomer(Number(r.insertId));}
export async function updateCommercialCustomer(id:number,input:CommercialCustomerInput){const d=normalizeCommercialCustomer(input);const [r]=await pool.query<any>(`UPDATE commercial_customers SET legal_name=?,trade_name=?,person_type=?,document=?,email=?,phone=?,financial_contact_name=?,financial_contact_document=?,financial_contact_email=?,financial_contact_phone=?,zip_code=?,street=?,number=?,complement=?,district=?,city=?,state=?,status=?,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,[d.legalName,d.tradeName,d.personType,d.document,d.email,d.phone,d.financialContactName,d.financialContactDocument,d.financialContactEmail,d.financialContactPhone,d.zipCode,d.street,d.number,d.complement,d.district,d.city,d.state,d.status,id]);if(!r.affectedRows)throw notFound();return getCommercialCustomer(id);}
