import {useEffect,useMemo,useState} from 'react';
import {api} from '../api';
import {PageHeader,Badge,Empty} from '../components/Ui';
import {DataTable} from '../components/DataTable';
import {Modal} from '../components/Modal';
import {CurrencyInput} from '../components/CurrencyInput';
import {apiMessage} from '../utils';

const money=(value:unknown)=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const dateOnly=(value:unknown)=>value?String(value).slice(0,10):'';

export function SaasProductSubscriptions(){
  const [rows,setRows]=useState<any[]>([]),[products,setProducts]=useState<any[]>([]),[editing,setEditing]=useState<any>(null),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  const load=async()=>{const [s,p]=await Promise.all([api.get('/saas/product-subscriptions'),api.get('/saas/commercial-products')]);setRows(s.data);setProducts(p.data);};
  useEffect(()=>{void load();},[]);

  async function openEdit(row:any){
    setError('');
    try{
      const {data}=await api.get(`/saas/product-subscriptions/${row.id}`);
      setEditing({
        id:Number(data.id),productId:Number(data.product_id),productCode:data.product_code,customerName:data.customer_name,productName:data.product_name,
        productPlanId:data.product_plan_id==null?null:Number(data.product_plan_id),monthlyPrice:Number(data.monthly_price||0),discountPercent:Number(data.discount_percent||0),
        nextDueDate:dateOnly(data.next_due_date),financialContactEmail:data.financial_contact_email||data.customer_email||'',billingProvider:data.billing_provider||null,billingMethod:data.billing_method||null,
        graceDays:Number(data.grace_days??data.default_grace_days??3),autoBlock:Boolean(Number(data.auto_block??1)),firstCycleProrataEnabled:Boolean(Number(data.first_cycle_prorata_enabled||0)),
        billingSource:data.billing_source,status:data.status
      });
    }catch(e){setError(apiMessage(e));}
  }

  async function save(){
    if(!editing)return;setSaving(true);setError('');
    try{
      await api.put(`/saas/product-subscriptions/${editing.id}`,{
        productPlanId:editing.productPlanId||null,monthlyPrice:Number(editing.monthlyPrice),discountPercent:Number(editing.discountPercent),nextDueDate:editing.nextDueDate||null,
        billingProvider:editing.billingProvider||null,billingMethod:editing.billingMethod||null,graceDays:Number(editing.graceDays),autoBlock:Boolean(editing.autoBlock),
        firstCycleProrataEnabled:Boolean(editing.firstCycleProrataEnabled),financialContactEmail:String(editing.financialContactEmail||'').trim()||null
      });
      setEditing(null);await load();
    }catch(e){setError(apiMessage(e));}finally{setSaving(false);}
  }

  async function grant(id:number,days?:5|10|30){const custom=!days;const endsAt=custom?window.prompt('Liberar acesso até (AAAA-MM-DD):',''):null;if(custom&&!endsAt)return;const reason=window.prompt('Motivo da liberação temporária:',days?`Liberação temporária +${days} dias`:'Liberação temporária personalizada');if(!reason)return;setError('');try{await api.post(`/saas/product-subscriptions/${id}/access-exception`,days?{days,reason}:{endsAt:`${endsAt}T23:59:59-03:00`,reason});await load();}catch(e){setError(apiMessage(e));}}
  async function revoke(id:number){setError('');try{await api.post(`/saas/product-subscriptions/${id}/revoke-access-exception`);await load();}catch(e){setError(apiMessage(e));}}

  const product=editing?products.find((x:any)=>Number(x.id)===Number(editing.productId)):null;
  const effective=useMemo(()=>editing?Number(editing.monthlyPrice||0)*(1-Math.min(100,Math.max(0,Number(editing.discountPercent||0)))/100):0,[editing]);

  return <><PageHeader title="Assinaturas por Produto" subtitle="Planos, preços, vencimentos e integração operacional de cada produto contratado."/>
    {error&&<div className="commercial-toast error">{error}</div>}
    <div className="panel table-panel">{rows.length===0?<Empty>Nenhuma assinatura de produto cadastrada.</Empty>:<div className="table-wrap"><DataTable><thead><tr><th>Cliente</th><th>Produto</th><th>Plano</th><th>Valor efetivo</th><th>Próximo vencimento</th><th>Financeiro</th><th>1ª cobrança</th><th>Cobrança</th><th>Status</th><th>Ações</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.customer_name}</td><td><strong>{r.product_name}</strong><div className="muted">{r.product_code}</div></td><td>{r.plan_name||'Personalizado'}</td><td>{money(r.effective_price)}</td><td>{dateOnly(r.next_due_date)||'—'}</td><td>{r.customer_financial_email||r.customer_email||'—'}{Number(r.discount_percent||0)>0&&<div className="muted">Desconto recorrente {Number(r.discount_percent).toLocaleString('pt-BR')}%</div>}</td><td><Badge tone={Number(r.first_cycle_prorata_enabled||0)===1?'success':'neutral'}>{Number(r.first_cycle_prorata_enabled||0)===1?'Pró-rata automático':'Integral'}</Badge></td><td>{r.billing_provider||r.default_provider||'Padrão'} / {r.billing_method||r.default_payment_method||'Padrão'}</td><td><Badge tone={r.status==='ACTIVE'||r.status==='GRACE'?'success':r.status==='PENDING_DATA'?'warning':'danger'}>{r.status}</Badge>{r.grace_until&&<div className="muted">liberado até {dateOnly(r.grace_until)}</div>}</td><td><div className="row gap"><button className="secondary compact" onClick={()=>void openEdit(r)}>Editar assinatura</button><button className="secondary compact" onClick={()=>void grant(r.id,5)}>Liberar +5d</button><button className="secondary compact" onClick={()=>void grant(r.id,10)}>+10d</button><button className="secondary compact" onClick={()=>void grant(r.id,30)}>+30d</button><button className="secondary compact" onClick={()=>void grant(r.id)}>Liberar até…</button>{r.grace_until&&<button className="secondary compact" onClick={()=>void revoke(r.id)}>Revogar liberação</button>}</div></td></tr>)}</tbody></DataTable></div>}</div>

    {editing&&<Modal title={`Editar assinatura · ${editing.customerName}`} onClose={()=>!saving&&setEditing(null)} wide><div className="commercial-settings-intro">Alterações de plano, valor, desconto, vencimento e e-mail financeiro valem para as próximas cobranças. Uma cobrança já emitida não é modificada automaticamente; use “Ajustar / reemitir” no Financeiro para cancelar e gerar outra.</div><div className="form-grid">
      <label>Produto<input value={`${editing.productName} (${editing.productCode})`} disabled/></label>
      <label>Status<input value={editing.status} disabled/></label>
      <label>Plano<select value={editing.productPlanId||''} onChange={e=>{const id=Number(e.target.value)||null;const plan=product?.plans?.find((x:any)=>Number(x.id)===id);setEditing({...editing,productPlanId:id,monthlyPrice:plan?Number(plan.price_monthly):editing.monthlyPrice});}}><option value="">Personalizado / sem plano</option>{product?.plans?.map((p:any)=><option key={p.id} value={p.id}>{p.name}{p.active?'':' · inativo'}</option>)}</select></label>
      <label>Mensalidade (R$)<CurrencyInput min={0} value={editing.monthlyPrice} onChange={monthlyPrice=>setEditing({...editing,monthlyPrice})}/></label>
      <label>Desconto recorrente (%)<input type="number" min={0} max={100} step="0.01" value={editing.discountPercent} onChange={e=>setEditing({...editing,discountPercent:Number(e.target.value)})}/></label>
      <label>Valor efetivo<input value={money(effective)} disabled/></label>
      <label>Próximo vencimento<input type="date" value={editing.nextDueDate} onChange={e=>setEditing({...editing,nextDueDate:e.target.value})}/></label>
      <label>E-mail de cobrança<input type="email" value={editing.financialContactEmail} onChange={e=>setEditing({...editing,financialContactEmail:e.target.value})}/></label>
      <label>Provedor<select value={editing.billingProvider||''} onChange={e=>{const billingProvider=e.target.value||null;setEditing({...editing,billingProvider,billingMethod:billingProvider?(editing.billingMethod||(billingProvider==='MERCADO_PAGO'?'BOLETO':'HYBRID')):null});}}><option value="">Herdar do produto</option><option value="EFI">Efí</option><option value="CORA">Cora</option><option value="MERCADO_PAGO">Mercado Pago</option></select></label>
      <label>Método<select disabled={!editing.billingProvider} value={editing.billingMethod||''} onChange={e=>setEditing({...editing,billingMethod:e.target.value||null})}><option value="">Herdar do produto</option><option value="HYBRID">BolePix / Híbrido</option><option value="BOLETO">Boleto</option><option value="PIX">Pix</option></select></label>
      <label>Tolerância (dias)<input type="number" min={0} max={365} value={editing.graceDays} onChange={e=>setEditing({...editing,graceDays:Number(e.target.value)})}/></label>
      <label className="checkbox-row"><input type="checkbox" checked={editing.autoBlock} onChange={e=>setEditing({...editing,autoBlock:e.target.checked})}/> Bloqueio automático</label>
      <label className="checkbox-row"><input type="checkbox" checked={editing.firstCycleProrataEnabled} onChange={e=>setEditing({...editing,firstCycleProrataEnabled:e.target.checked})}/> Pró-rata automático na primeira cobrança</label>
    </div><div className="form-actions"><button type="button" className="secondary" disabled={saving} onClick={()=>setEditing(null)}>Cancelar</button><button className="primary" disabled={saving||!editing.nextDueDate||Number(editing.monthlyPrice)<0||Number(editing.discountPercent)<0||Number(editing.discountPercent)>100} onClick={()=>void save()}>{saving?'Salvando…':'Salvar assinatura'}</button></div></Modal>}
  </>;
}
