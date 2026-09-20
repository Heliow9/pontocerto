import {useEffect,useState} from 'react';
import {api} from '../api';
import {PageHeader,Badge,Empty} from '../components/Ui';
import {DataTable} from '../components/DataTable';
import {apiMessage} from '../utils';

export function SaasProducts(){
  const [rows,setRows]=useState<any[]>([]),[error,setError]=useState('');
  const load=()=>api.get('/saas/products').then(r=>setRows(r.data));
  useEffect(()=>{void load();},[]);
  async function update(p:any,patch:any){setError('');try{await api.put(`/saas/products/${p.id}`,patch);await load();}catch(e){setError(apiMessage(e));}}
  return <><PageHeader title="Produtos" subtitle="Catálogo comercial independente: Ponto Certo, Movyo e produtos futuros."/>
    {error&&<div className="commercial-toast error">{error}</div>}
    {rows.length===0?<Empty>Nenhum produto cadastrado.</Empty>:rows.map(p=><section className="panel" key={p.id}>
      <div className="commercial-panel-head"><div><h2>{p.name}</h2><span className="muted">{p.code} · {p.description}</span>{p.code==='MOVYO'&&!p.default_provider&&!p.default_payment_method&&<div className="muted">Recomendado: Efí + BolePix (HYBRID). A configuração só é salva quando a Efí estiver habilitada e com credenciais válidas.</div>}</div><Badge tone={p.active?'success':'warning'}>{p.active?'ACTIVE':'INACTIVE'}</Badge></div>
      <div className="form-grid">
        <label>Provedor padrão<select value={p.default_provider||''} onChange={e=>{const provider=e.target.value||null;const method=provider?(p.default_payment_method||(provider==='MERCADO_PAGO'?'BOLETO':'HYBRID')):null;void update(p,{defaultProvider:provider,defaultMethod:method});}}><option value="">Usar padrão global</option><option value="EFI">Efí</option><option value="CORA">Cora</option><option value="MERCADO_PAGO">Mercado Pago</option></select></label>
        <label>Método padrão<select disabled={!p.default_provider} value={p.default_payment_method||''} onChange={e=>{const method=e.target.value||null;void update(p,{defaultProvider:method?p.default_provider:null,defaultMethod:method});}}><option value="">Usar padrão global</option><option value="HYBRID">BolePix / Híbrido</option><option value="BOLETO">Boleto</option><option value="PIX">Pix</option></select></label>
        <label>Tolerância (dias)<input type="number" min={0} max={365} value={Number(p.default_grace_days??3)} onChange={e=>void update(p,{defaultGraceDays:Number(e.target.value)})}/></label>
        <label className="checkbox-row"><input type="checkbox" checked={Boolean(p.default_auto_block)} onChange={e=>void update(p,{defaultAutoBlock:e.target.checked})}/> Bloqueio automático após tolerância</label>
      </div>
      <div className="table-wrap"><DataTable><thead><tr><th>Plano</th><th>Código</th><th>Mensalidade</th><th>Status</th></tr></thead><tbody>{(p.plans||[]).map((plan:any)=><tr key={plan.id}><td>{plan.name}</td><td>{plan.code}</td><td>{Number(plan.price_monthly).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td><td><Badge tone={plan.active?'success':'warning'}>{plan.active?'ACTIVE':'INACTIVE'}</Badge></td></tr>)}</tbody></DataTable></div>
    </section>)}</>;
}
