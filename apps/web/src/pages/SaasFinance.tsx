import {useEffect,useMemo,useState} from "react";
import {api} from "../api";
import {Modal} from "../components/Modal";
import {Badge,Empty} from "../components/Ui";
import {CurrencyInput} from "../components/CurrencyInput";
import {MaskedInput} from "../components/MaskedInput";
import {CepLookupInput} from "../components/CepLookupInput";
import {apiMessage,brDate} from "../utils";
import {formatCpfCnpj} from "../utils/masks";
import {download,money} from "./CommercialUi";
import {providerLabels} from "./SaasFinanceProviders";
import {validBrazilDocument} from "../utils/brazilDocument";

type View="dashboard"|"charges"|"receipts"|"delinquent"|"logs";
const statusTone=(s:string)=>s==="PAID"?"success":s==="OVERDUE"||s==="FAILED"?"danger":s==="OPEN"?"warning":"neutral";
const statusLabel:Record<string,string>={DRAFT:"Rascunho",ISSUING:"Emitindo",OPEN:"Em aberto",OVERDUE:"Vencida",PAID:"Paga",CANCELED:"Cancelada",FAILED:"Falha"};
const typeLabel:Record<string,string>={MONTHLY:"Mensalidade",IMPLEMENTATION:"Implantação",AD_HOC:"Avulsa"};
const methodLabel:Record<string,string>={HYBRID:"Boleto + Pix",PIX:"Pix",BOLETO:"Boleto",OTHER:"Outro",MANUAL:"Manual"};
const eventLabel:Record<string,string>={PRODUCT_CHARGE_CREATED:"Cobrança criada",CHARGE_CREATED:"Cobrança criada",CHARGE_ISSUE_STARTED:"Emissão iniciada",CHARGE_ISSUED:"Cobrança emitida",CHARGE_ISSUE_FAILED:"Emissão recusada pelo provedor",CHARGE_ISSUE_UNCERTAIN:"Emissão sem confirmação",CHARGE_ISSUE_NOT_FOUND:"Cobrança não localizada no provedor",CHARGE_PROVIDER_ID_RECOVERED:"Identificador recuperado",CHARGE_RECONCILED:"Cobrança reconciliada",PAYMENT_CONFIRMED:"Pagamento confirmado",PAYMENT_CONFIRMED_MANUAL:"Pagamento confirmado manualmente",CHARGE_CANCELED:"Cobrança cancelada",CHARGE_REISSUED:"Cobrança reemitida",CHARGE_ADJUSTMENT_CREATED:"Ajuste de cobrança criado"};
const base64Key=(value:string)=>{const padding="=".repeat((4-value.length%4)%4),base64=(value+padding).replace(/-/g,"+").replace(/_/g,"/");const raw=atob(base64);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));};
const financeDeviceKey=()=>{const key="pc-finance-push-device";let value=localStorage.getItem(key);if(!value){value=`web_${crypto.randomUUID().replace(/-/g,"")}`;localStorage.setItem(key,value);}return value;};
const today=()=>new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"});
const competence=()=>today().slice(0,7);
const digits=(value:unknown)=>String(value??"").replace(/\D/g,"");
const emailOfProfile=(p:any)=>String(p?.financialContactEmail||p?.billingEmail||"").trim();
const valueOrNull=(value:unknown)=>{const text=String(value??"").trim();return text||null;};
const payerFieldLabels:Record<string,string>={name:"nome/razão social",document:"CPF/CNPJ",email:"e-mail financeiro",zipCode:"CEP",street:"logradouro",number:"número",district:"bairro",city:"cidade",state:"UF"};
const CORA_BOLETO_MINIMUM_AMOUNT=5;
const coraMinimumAmountError=(provider:unknown,method:unknown,amount:unknown)=>{
  const numeric=Number(amount);
  if(provider!=="CORA"||!["HYBRID","BOLETO"].includes(String(method))||!Number.isFinite(numeric)||numeric<=0||Math.round(numeric*100)>=CORA_BOLETO_MINIMUM_AMOUNT*100)return "";
  const label=method==="HYBRID"?"Boleto + Pix (BolePix)":"boleto";
  return `A Cora exige valor mínimo de R$ 5,00 para emissão de ${label}.`;
};
const financeQuery=(filters:Record<string,string>)=>{const search=new URLSearchParams();Object.entries(filters).forEach(([key,value])=>{if(value)search.set(key,value);});return search.toString();};

export function SaasFinance({view}:{view:View}){
  const [dashboard,setDashboard]=useState<any>(null);
  const [rows,setRows]=useState<any[]>([]);
  const [tenants,setTenants]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [createOpen,setCreateOpen]=useState(()=>new URLSearchParams((location.hash.split("?")[1]||"")).get("new")==="1");
  const [profileTenant,setProfileTenant]=useState<number|null>(null);
  const [emailCharge,setEmailCharge]=useState<any|null>(null);
  const [historyCharge,setHistoryCharge]=useState<any|null>(null);
  const [adjustCharge,setAdjustCharge]=useState<any|null>(null);
  const [pushOpen,setPushOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [filters,setFilters]=useState({tenantId:"",status:"",type:"",provider:"",paymentMethod:""});
  const initialTenant=useMemo(()=>new URLSearchParams((location.hash.split("?")[1]||"")).get("tenant")||"",[location.hash]);

  useEffect(()=>{if(initialTenant)setFilters(f=>({...f,tenantId:initialTenant}));},[initialTenant]);

  async function load(){
    setLoading(true);setError("");
    try{
      const tenantPromise=api.get("/saas/tenants");
      if(view==="dashboard"){
        const[d,t]=await Promise.all([api.get("/saas/finance/dashboard"),tenantPromise]);
        setDashboard(d.data);setTenants(t.data);setRows([]);
      }else if(view==="receipts"){
        const params:any={};if(filters.provider)params.provider=filters.provider;if(filters.paymentMethod)params.paymentMethod=filters.paymentMethod;
        const[r,t]=await Promise.all([api.get("/saas/finance/receipts",{params}),tenantPromise]);setRows(r.data);setTenants(t.data);
      }else if(view==="logs"){
        const params:any={};if(filters.provider)params.provider=filters.provider;
        const[r,t]=await Promise.all([api.get("/saas/finance/events",{params}),tenantPromise]);setRows(r.data);setTenants(t.data);
      }else{
        const params:any={};if(filters.tenantId)params.tenantId=filters.tenantId;if(filters.type)params.type=filters.type;if(filters.provider)params.provider=filters.provider;if(filters.paymentMethod)params.paymentMethod=filters.paymentMethod;if(view==="delinquent")params.status="OVERDUE";else if(filters.status)params.status=filters.status;
        const[r,t]=await Promise.all([api.get("/saas/finance/charges",{params}),tenantPromise]);setRows(r.data);setTenants(t.data);
      }
    }catch(e){setError(apiMessage(e));}finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[view,filters.tenantId,filters.status,filters.type,filters.provider,filters.paymentMethod]);

  async function chargeAction(id:number,action:"issue"|"reconcile"|"cancel"){
    if(busy)return;setBusy(true);setError("");
    try{if(action==="cancel"&&!confirm("Cancelar esta cobrança?"))return;await api.post(`/saas/finance/charges/${id}/${action}`,{});await load();}
    catch(e){setError(apiMessage(e));}finally{setBusy(false);}
  }

  const titles:Record<View,[string,string]>={dashboard:["Financeiro SaaS","Recebimentos, inadimplência e receita recorrente do Ponto Certo."],charges:["Cobranças","Mensalidades, implantação e cobranças avulsas com rastreio do provedor."],receipts:["Recebimentos","Baixas confirmadas pelos provedores de pagamento ou administrativamente."],delinquent:["Inadimplentes","Cobranças vencidas, bloqueios e liberações temporárias."],logs:["Logs financeiros","Trilha de auditoria das movimentações financeiras."]};

  return <>
    <div className="commercial-heading"><div><span className="commercial-kicker">Financeiro</span><h1>{titles[view][0]}</h1><p>{titles[view][1]}</p></div><div className="commercial-heading-actions">
      {view==="charges"&&<button className="ghost" onClick={()=>download(`/saas/finance/reports/charges.csv?${financeQuery(filters)}`,"cobrancas-financeiro.csv")}>Exportar CSV</button>}
      {view==="receipts"&&<button className="ghost" onClick={()=>download(`/saas/finance/reports/receipts.csv?${financeQuery(filters)}`,"recebimentos-financeiro.csv")}>Exportar CSV</button>}
      <button className="ghost finance-notification-button" onClick={()=>setPushOpen(true)}>Notificações de pagamento</button>{view!=="logs"&&<button className="primary" onClick={()=>setCreateOpen(true)}>+ Nova cobrança</button>}
    </div></div>
    {error&&<div className="error-card" role="alert">{error}<button onClick={()=>load()}>Tentar novamente</button></div>}
    {loading&&!dashboard&&rows.length===0?<div className="panel">Carregando financeiro…</div>:
      view==="dashboard"?<FinanceDashboard data={dashboard} tenants={tenants} onProfile={setProfileTenant}/>:
      view==="receipts"?<><ProviderFilters filters={filters} setFilters={setFilters} methodMode="confirmed"/><Receipts rows={rows}/></>:
      view==="logs"?<><ProviderFilters filters={filters} setFilters={setFilters} hideMethod/><Logs rows={rows}/></>:
      <Charges rows={rows} tenants={tenants} filters={filters} setFilters={setFilters} onAction={chargeAction} onProfile={setProfileTenant} onEmail={setEmailCharge} onHistory={setHistoryCharge} onAdjust={setAdjustCharge} busy={busy}/>
    }
    {createOpen&&<CreateCharge tenants={tenants} onClose={()=>setCreateOpen(false)} onDone={async()=>{setCreateOpen(false);await load();}} onEditProfile={(tenantId)=>{setCreateOpen(false);setProfileTenant(tenantId);}}/>}
    {profileTenant&&<BillingProfile tenantId={profileTenant} onClose={()=>setProfileTenant(null)} onDone={load}/>} 
    {emailCharge&&<EmailChargeModal charge={emailCharge} onClose={()=>setEmailCharge(null)} onDone={async()=>{setEmailCharge(null);await load();}}/>}
    {historyCharge&&<DeliveryHistoryModal charge={historyCharge} onClose={()=>setHistoryCharge(null)}/>}
    {adjustCharge&&<ChargeAdjustmentModal charge={adjustCharge} onClose={()=>setAdjustCharge(null)} onDone={async()=>{setAdjustCharge(null);await load();}} onRefresh={load}/>} 
    {pushOpen&&<FinancePushModal onClose={()=>setPushOpen(false)}/>}
  </>;
}

function ProviderFilters({filters,setFilters,hideMethod=false,methodMode="requested"}:{filters:any;setFilters:(x:any)=>void;hideMethod?:boolean;methodMode?:"requested"|"confirmed"}){
  return <div className="panel finance-filters"><label>Provedor<select value={filters.provider} onChange={e=>setFilters({...filters,provider:e.target.value})}><option value="">Todos</option><option value="CORA">Cora</option><option value="EFI">Efí Bank</option><option value="MERCADO_PAGO">Mercado Pago</option></select></label>{!hideMethod&&<label>Método<select value={filters.paymentMethod} onChange={e=>setFilters({...filters,paymentMethod:e.target.value})}><option value="">Todos</option>{methodMode==="requested"&&<option value="HYBRID">Boleto + Pix</option>}<option value="PIX">Pix</option><option value="BOLETO">Boleto</option>{methodMode==="confirmed"&&<><option value="OTHER">Outro</option><option value="MANUAL">Manual</option></>}</select></label>}</div>;
}

function FinanceDashboard({data,tenants,onProfile}:{data:any;tenants:any[];onProfile:(id:number)=>void}){
  if(!data)return <div className="panel">Sem dados financeiros.</div>;
  const cards=[["Recebido no mês",money(data.receivedMonth),"green"],["A receber",money(data.receivable),"blue"],["Vencido",money(data.overdue),"red"],["Inadimplentes",data.delinquentTenants,"amber"],["Bloqueados",data.blockedTenants,"red"],["MRR contratual",money(data.mrr),"teal"]];
  return <><section className="commercial-metrics finance-metrics">{cards.map(([l,v,t])=><article className={`commercial-metric metric-${t}`} key={String(l)}><div><p>{l}</p><strong>{v}</strong></div></article>)}</section><div className="commercial-grid-2"><section className="panel table-panel"><div className="commercial-section-head"><div><h2>Recebimentos recentes</h2><p>Últimas confirmações financeiras.</p></div></div><Receipts rows={data.recentReceipts||[]} compact/></section><section className="panel"><div className="commercial-section-head"><div><h2>Recebido por provedor</h2><p>Resumo do mês atual, incluindo tarifas quando informadas.</p></div></div><div className="commercial-summary-list">{(data.byProvider||[]).map((x:any)=><div key={x.provider}><span>{providerLabels[x.provider]||x.provider}<small>Tarifas {money(x.fees)} · líquido {money(x.net)}</small></span><strong>{money(x.received)}</strong></div>)}{!(data.byProvider||[]).length&&<Empty>Nenhum recebimento no mês.</Empty>}</div></section></div><section className="panel"><div className="commercial-section-head"><div><h2>Clientes com atenção</h2><p>Visão unificada de Ponto Certo, Movyo e demais produtos.</p></div></div><div className="finance-attention-list">{(data.attention||[]).map((item:any)=><button key={item.chargeId} onClick={()=>item.tenantId&&onProfile(Number(item.tenantId))}><span><strong>{item.name}</strong><small>{item.productName?`${item.productName} · `:""}vencimento {brDate(item.dueDate)}</small></span><span><b>{money(item.amount)}</b><small>{item.blocking?"Bloqueado":"Em atraso"}</small></span></button>)}{!(data.attention||[]).length&&<Empty>Nenhum cliente inadimplente.</Empty>}</div></section></>;
}

function Charges({rows,tenants,filters,setFilters,onAction,onProfile,onEmail,onHistory,onAdjust,busy}:{rows:any[];tenants:any[];filters:any;setFilters:(x:any)=>void;onAction:(id:number,a:any)=>void;onProfile:(id:number)=>void;onEmail:(c:any)=>void;onHistory:(c:any)=>void;onAdjust:(c:any)=>void;busy:boolean}){
  const [quickView,setQuickView]=useState<"ACTIVE"|"ATTENTION"|"PAID"|"CANCELED"|"ALL">("ACTIVE");
  const [search,setSearch]=useState("");
  const summary=useMemo(()=>rows.reduce((acc,c)=>{
    if(["DRAFT","ISSUING","OPEN"].includes(c.status))acc.open+=1;
    if(["OVERDUE","FAILED"].includes(c.status))acc.attention+=1;
    if(c.status==="PAID")acc.paid+=1;
    if(c.status==="CANCELED")acc.canceled+=1;
    return acc;
  },{open:0,attention:0,paid:0,canceled:0}),[rows]);
  const orderedRows=useMemo(()=>{
    const rank:Record<string,number>={OVERDUE:0,FAILED:1,OPEN:2,ISSUING:3,DRAFT:4,PAID:5,CANCELED:6};
    return [...rows].sort((a,b)=>{
      const byStatus=(rank[a.status]??9)-(rank[b.status]??9);
      if(byStatus!==0)return byStatus;
      const da=String(a.due_date||"");
      const db=String(b.due_date||"");
      if(da!==db)return da.localeCompare(db);
      return Number(b.id||0)-Number(a.id||0);
    });
  },[rows]);
  const visibleRows=useMemo(()=>orderedRows.filter(c=>{
    const matchQuick=quickView==="ALL"?true:quickView==="ACTIVE"?["DRAFT","ISSUING","OPEN"].includes(c.status):quickView==="ATTENTION"?["OVERDUE","FAILED"].includes(c.status):quickView==="PAID"?c.status==="PAID":c.status==="CANCELED";
    if(!matchQuick)return false;
    const haystack=`${c.payer_name||""} ${c.commercial_customer_name||""} ${c.tenant_name||""} ${c.description||""} ${c.provider_charge_id||""} ${c.payer_document||""}`.toLowerCase();
    return !search.trim()||haystack.includes(search.trim().toLowerCase());
  }),[orderedRows,quickView,search]);
  const quickViews=[
    {key:"ACTIVE",label:"A vencer / em aberto",count:summary.open,help:"Rascunhos, emissões em andamento e cobranças abertas."},
    {key:"ATTENTION",label:"Em atenção",count:summary.attention,help:"Vencidas ou com falha de emissão."},
    {key:"PAID",label:"Pagas",count:summary.paid,help:"Cobranças já recebidas."},
    {key:"CANCELED",label:"Canceladas",count:summary.canceled,help:"Histórico encerrado."},
    {key:"ALL",label:"Todas",count:rows.length,help:"Visão geral sem separar por situação."}
  ] as const;
  const hasServerFilters=Boolean(filters.tenantId||filters.type||filters.provider||filters.paymentMethod||filters.status);
  const resetView=()=>{setQuickView("ACTIVE");setSearch("");setFilters({...filters,tenantId:"",type:"",provider:"",paymentMethod:"",status:""});};

  return <>
    <section className="finance-overview-grid">
      <article className="finance-overview-card metric-open"><small>A vencer / em aberto</small><strong>{summary.open}</strong><span>Cobranças operacionais do ciclo atual.</span></article>
      <article className="finance-overview-card metric-attention"><small>Em atenção</small><strong>{summary.attention}</strong><span>Exigem ação, reconciliação ou contato.</span></article>
      <article className="finance-overview-card metric-paid"><small>Pagas</small><strong>{summary.paid}</strong><span>Já liquidadas pelos provedores.</span></article>
      <article className="finance-overview-card metric-canceled"><small>Canceladas</small><strong>{summary.canceled}</strong><span>Encerradas e mantidas para histórico.</span></article>
    </section>

    <div className="panel finance-filters finance-filters-charges"><label>Cliente<select value={filters.tenantId} onChange={e=>setFilters({...filters,tenantId:e.target.value})}><option value="">Todos</option>{tenants.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Tipo<select value={filters.type} onChange={e=>setFilters({...filters,type:e.target.value})}><option value="">Todos</option><option value="MONTHLY">Mensalidade</option><option value="IMPLEMENTATION">Implantação</option><option value="AD_HOC">Avulsa</option></select></label><label>Provedor<select value={filters.provider} onChange={e=>setFilters({...filters,provider:e.target.value})}><option value="">Todos</option><option value="CORA">Cora</option><option value="EFI">Efí Bank</option><option value="MERCADO_PAGO">Mercado Pago</option></select></label><label>Método<select value={filters.paymentMethod} onChange={e=>setFilters({...filters,paymentMethod:e.target.value})}><option value="">Todos</option><option value="HYBRID">Boleto + Pix</option><option value="PIX">Pix</option><option value="BOLETO">Boleto</option></select></label><label>Status<select value={filters.status} onChange={e=>setFilters({...filters,status:e.target.value})}><option value="">Todos</option>{Object.entries(statusLabel).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></div>

    <div className="panel finance-charge-toolbar"><div className="finance-quick-filters">{quickViews.map(item=><button key={item.key} type="button" className={quickView===item.key?"active":""} title={item.help} onClick={()=>setQuickView(item.key)}><span>{item.label}</span><b>{item.count}</b></button>)}</div><div className="finance-toolbar-right"><label className="finance-search-field"><span>Buscar cobrança</span><input placeholder="Pagador, descrição, CPF/CNPJ ou ID do provedor" value={search} onChange={e=>setSearch(e.target.value)}/></label><button className="ghost" type="button" onClick={resetView} disabled={!search&&!hasServerFilters&&quickView==="ACTIVE"}>Limpar visão</button></div></div>

    <div className="finance-results-note">Exibindo <strong>{visibleRows.length}</strong> de <strong>{rows.length}</strong> cobranças. Por padrão, a tela abre focada em <strong>a vencer / em aberto</strong> para evitar mistura com canceladas e históricas.</div>

    <div className="panel table-panel finance-list-panel"><div className="table-wrap"><table className="finance-table finance-responsive-table"><thead><tr><th>Pagador / cobrança</th><th>Tipo</th><th>Provedor / método</th><th>Valor</th><th>Vencimento</th><th>Status</th><th>Ações</th></tr></thead><tbody>{visibleRows.map(c=>{
      const canSend=Boolean(c.provider_charge_id||c.provider_payment_url||c.provider_pdf_url||c.digitable_line||c.pix_copy_paste);
      const rowClass=`finance-charge-row charge-${String(c.status||"").toLowerCase()}`;
      return <tr key={c.id} className={rowClass}><td data-label="Pagador" className="finance-primary"><strong>{c.payer_name||c.commercial_customer_name||c.tenant_name||"Pagador não identificado"}</strong><small>{c.payer_source==="EXTERNAL"?"Pagador avulso":c.product_subscription_id?`${c.commercial_customer_name||"Cliente comercial"}${c.product_name?` · ${c.product_name}`:""}`:c.tenant_name||"Cliente SaaS"} · {c.payer_document?formatCpfCnpj(c.payer_document):"sem documento"}</small><small>{c.description}</small></td><td data-label="Tipo"><strong>{typeLabel[c.type]||c.type}</strong></td><td data-label="Provedor"><strong>{providerLabels[c.provider]||c.provider}</strong><small>{methodLabel[c.requested_payment_method]||c.requested_payment_method||"—"}</small></td><td data-label="Valor"><strong>{money(c.amount)}</strong>{Number(c.discount_amount||0)>0&&<small>Desconto pontual {money(c.discount_amount)}</small>}{c.reissued_from_charge_id&&<small>Reemitida da #{c.reissued_from_charge_id}</small>}</td><td data-label="Vencimento"><strong>{brDate(c.due_date)}</strong></td><td data-label="Status"><Badge tone={statusTone(c.status) as any}>{statusLabel[c.status]||c.status}</Badge>{c.has_active_exception&&<small className="finance-exception">Liberação ativa</small>}{c.last_delivery_status&&<small>E-mail: {c.last_delivery_status}</small>}{c.status==="FAILED"&&c.failure_message&&<small className="finance-error-detail" role="alert">{c.failure_message}</small>}</td><td data-label="Ações" className="finance-actions-cell"><div className="finance-actions">{c.tenant_id&&<button className="ghost" onClick={()=>onProfile(Number(c.tenant_id))}>Cliente</button>}{["DRAFT","FAILED"].includes(c.status)&&["CORA","EFI","MERCADO_PAGO"].includes(c.provider)&&<button disabled={busy} onClick={()=>onAction(c.id,"issue")}>Emitir</button>}{["ISSUING","OPEN","OVERDUE"].includes(c.status)&&["CORA","EFI","MERCADO_PAGO"].includes(c.provider)&&<button disabled={busy} onClick={()=>onAction(c.id,"reconcile")}>Reconciliar</button>}{c.provider_payment_url&&<a className="ghost" href={c.provider_payment_url} target="_blank" rel="noreferrer">Pagamento</a>}{c.provider_pdf_url&&c.provider!=="MERCADO_PAGO"&&<button className="ghost" onClick={()=>download(`/saas/finance/charges/${c.id}/pdf`,`boleto-${c.id}.pdf`)}>Boleto</button>}{canSend&&<button className="ghost" onClick={()=>onEmail(c)}>Reenviar por e-mail</button>}<button className="ghost" onClick={()=>onHistory(c)}>Histórico</button>{["DRAFT","FAILED","OPEN","OVERDUE"].includes(c.status)&&["CORA","EFI","MERCADO_PAGO"].includes(c.provider)&&<button className="ghost" disabled={busy} onClick={()=>onAdjust(c)}>Ajustar / reemitir</button>}{!["PAID","CANCELED"].includes(c.status)&&["CORA","EFI","MERCADO_PAGO"].includes(c.provider)&&<button className="danger" disabled={busy} onClick={()=>onAction(c.id,"cancel")}>Cancelar</button>}</div></td></tr>;
    })}{visibleRows.length===0&&<tr className="finance-empty-row"><td colSpan={7}><Empty>Nenhuma cobrança encontrada para esta visão.</Empty></td></tr>}</tbody></table></div></div></>;
}

function Receipts({rows,compact=false}:{rows:any[];compact?:boolean}){
  return <div className={compact?"table-wrap":"panel table-panel table-wrap"}><table className="finance-table finance-responsive-table"><thead><tr><th>Pagador</th><th>Cobrança</th><th>Provedor</th><th>Método</th><th>Bruto</th>{!compact&&<><th>Tarifa</th><th>Líquido</th></>}<th>Pago em</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td data-label="Pagador" className="finance-primary">{r.payer_name||r.tenant_name||"—"}<small>{r.payer_source==="EXTERNAL"?"Avulso":r.tenant_name||"Cliente SaaS"}</small></td><td data-label="Cobrança">{r.description}</td><td data-label="Provedor">{providerLabels[r.provider]||r.provider||"Manual"}</td><td data-label="Método"><Badge tone="success">{methodLabel[r.payment_method]||r.payment_method||r.origin}</Badge></td><td data-label="Bruto">{money(r.amount)}</td>{!compact&&<><td data-label="Tarifa">{r.provider_fee==null?"—":money(r.provider_fee)}</td><td data-label="Líquido">{r.net_amount==null?"—":money(r.net_amount)}</td></>}<td data-label="Pago em">{brDate(r.paid_at)}</td></tr>)}{rows.length===0&&<tr className="finance-empty-row"><td colSpan={compact?6:8}><Empty>Nenhum recebimento.</Empty></td></tr>}</tbody></table></div>;
}

function Logs({rows}:{rows:any[]}){
  return <div className="panel table-panel"><div className="table-wrap"><table className="finance-table finance-responsive-table"><thead><tr><th>Data</th><th>Pagador</th><th>Evento</th><th>Provedor</th><th>Cobrança</th><th>Usuário</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td data-label="Data">{brDate(r.created_at)}</td><td data-label="Pagador">{r.payer_name||r.tenant_name||"—"}</td><td data-label="Evento"><strong>{eventLabel[r.event_type]||r.event_type}</strong><small>{r.event_type}</small></td><td data-label="Provedor">{providerLabels[r.provider]||r.provider||"—"}</td><td data-label="Cobrança">{r.charge_description||"—"}</td><td data-label="Usuário">{r.actor_name||"Automático"}</td></tr>)}</tbody></table></div></div>;
}

function CreateCharge({tenants,onClose,onDone,onEditProfile}:{tenants:any[];onClose:()=>void;onDone:()=>Promise<void>;onEditProfile:(tenantId:number)=>void}){
  const [settings,setSettings]=useState<any>(null);
  const [productSubscriptions,setProductSubscriptions]=useState<any[]>([]);
  const [profile,setProfile]=useState<any>(null);
  const [profileLoading,setProfileLoading]=useState(false);
  const [form,setForm]=useState<any>({
    tenantId:tenants[0]?.id||"",subscriptionId:"",type:"MONTHLY",competence:competence(),amount:null as number|null,dueDate:today(),description:"",issue:true,provider:"",paymentMethod:"",payerSource:"TENANT",sendEmailAfterIssue:true,
    payer:{personType:"PJ",name:"",document:"",email:"",phone:"",zipCode:"",street:"",number:"",complement:"",district:"",city:"",state:""}
  });
  const [busy,setBusy]=useState(false),[error,setError]=useState("");

  useEffect(()=>{void Promise.all([api.get("/saas/finance/providers"),api.get("/saas/product-subscriptions")]).then(([providers,subscriptions])=>{setSettings(providers.data);const billable=(subscriptions.data||[]).filter((x:any)=>["ACTIVE","GRACE","PAST_DUE","BLOCKED"].includes(String(x.status)));setProductSubscriptions(billable);setForm((f:any)=>({...f,provider:providers.data.defaultProvider||"",paymentMethod:providers.data.defaultMethod||"",subscriptionId:f.subscriptionId||billable[0]?.id||""}));}).catch(e=>setError(apiMessage(e)));},[]);
  const selected=settings?.providers?.find((p:any)=>p.code===form.provider);
  useEffect(()=>{if(form.type==="AD_HOC"&&form.paymentMethod==="HYBRID"&&!selected?.capabilities?.hybridBoletoPix)setForm((f:any)=>({...f,paymentMethod:"PIX"}));},[form.type,form.provider,selected?.capabilities?.hybridBoletoPix]);

  const selectedSubscription=productSubscriptions.find((x:any)=>Number(x.id)===Number(form.subscriptionId));
  const tenantMode=form.type!=="PRODUCT_MONTHLY"&&(form.type!=="AD_HOC"||form.payerSource==="TENANT");
  useEffect(()=>{
    if(!tenantMode||!form.tenantId){setProfile(null);return;}
    let active=true;setProfileLoading(true);
    void api.get(`/saas/finance/tenants/${form.tenantId}/profile`).then(r=>{if(!active)return;setProfile(r.data.profile);setForm((f:any)=>({...f,sendEmailAfterIssue:Boolean(r.data.profile.autoEmailCharges)}));}).catch(e=>{if(active)setError(apiMessage(e));}).finally(()=>{if(active)setProfileLoading(false);});
    return()=>{active=false;};
  },[form.tenantId,tenantMode]);

  const effectiveProvider=form.type==="PRODUCT_MONTHLY"?(selectedSubscription?.billing_provider||selectedSubscription?.default_provider||settings?.defaultProvider):form.type==="AD_HOC"?form.provider:settings?.defaultProvider;
  const effectiveMethod=form.type==="PRODUCT_MONTHLY"?(selectedSubscription?.billing_method||selectedSubscription?.default_payment_method||settings?.defaultMethod):form.type==="AD_HOC"?form.paymentMethod:settings?.defaultMethod;
  const effectiveAmount=form.type==="PRODUCT_MONTHLY"?Number(selectedSubscription?.effective_price||0):form.type==="MONTHLY"?Number(profile?.priceMonthly||0):Number(form.amount||0);
  const minimumAmountError=form.issue?coraMinimumAmountError(effectiveProvider,effectiveMethod,effectiveAmount):"";
  const validationErrors:string[]=[];
  if(form.type==="PRODUCT_MONTHLY"){
    if(!form.subscriptionId||!selectedSubscription)validationErrors.push("selecione a assinatura de produto");
    else{const doc=digits(selectedSubscription.customer_document);if(!validBrazilDocument(doc))validationErrors.push("CPF/CNPJ do cliente comercial inválido");if(form.sendEmailAfterIssue&&!String(selectedSubscription.customer_financial_email||selectedSubscription.customer_email||"").trim())validationErrors.push("e-mail financeiro");}
  }else if(tenantMode){
    if(!form.tenantId)validationErrors.push("selecione o Cliente SaaS");
    if(profile){
      if(!String(profile.billingLegalName||"").trim())validationErrors.push("nome/razão social");
      const doc=digits(profile.billingDocument);if(!validBrazilDocument(doc))validationErrors.push("CPF/CNPJ inválido");
      if(form.sendEmailAfterIssue&&!emailOfProfile(profile))validationErrors.push("e-mail financeiro");
      if(effectiveProvider==="MERCADO_PAGO"&&effectiveMethod==="BOLETO"){
        const fields:[[string,string],...Array<[string,string]>]=[["billingZipCode","CEP"],["billingStreet","logradouro"],["billingNumber","número"],["billingDistrict","bairro"],["billingCity","cidade"],["billingState","UF"]];
        for(const [key,label] of fields)if(!String(profile[key]||"").trim())validationErrors.push(label);
        if(!emailOfProfile(profile))validationErrors.push("e-mail financeiro");
      }
    }
  }else{
    const p=form.payer;
    if(!String(p.name||"").trim())validationErrors.push("nome/razão social");
    const doc=digits(p.document);if(!validBrazilDocument(doc,p.personType))validationErrors.push(p.personType==="PF"?"CPF inválido":"CNPJ inválido");
    if(form.sendEmailAfterIssue&&!String(p.email||"").trim())validationErrors.push("e-mail do pagador");
    if(effectiveProvider==="MERCADO_PAGO"&&effectiveMethod==="BOLETO")for(const [key,label] of [["email","e-mail"],["zipCode","CEP"],["street","logradouro"],["number","número"],["district","bairro"],["city","cidade"],["state","UF"]])if(!String(p[key]||"").trim())validationErrors.push(label);
  }
  const uniqueErrors=[...new Set(validationErrors)];

  async function submit(e:React.FormEvent){
    e.preventDefault();setBusy(true);setError("");
    try{
      if(uniqueErrors.length)throw new Error(`Complete os dados do pagador: ${uniqueErrors.join(", ")}.`);
      if(minimumAmountError)throw new Error(minimumAmountError);
      if(form.type==="PRODUCT_MONTHLY")await api.post("/saas/finance/charges/product-monthly",{subscriptionId:Number(form.subscriptionId),competence:form.competence,issue:form.issue,sendEmailAfterIssue:form.sendEmailAfterIssue});
      else if(form.type==="MONTHLY")await api.post("/saas/finance/charges/monthly",{tenantId:Number(form.tenantId),competence:form.competence,issue:form.issue,sendEmailAfterIssue:form.sendEmailAfterIssue});
      else if(form.type==="IMPLEMENTATION")await api.post("/saas/finance/charges/implementation",{tenantId:Number(form.tenantId),amount:form.amount,dueDate:form.dueDate,description:form.description||undefined,issue:form.issue,sendEmailAfterIssue:form.sendEmailAfterIssue});
      else if(form.payerSource==="TENANT")await api.post("/saas/finance/charges/ad-hoc",{payerSource:"TENANT",tenantId:Number(form.tenantId),amount:form.amount,dueDate:form.dueDate,description:form.description,provider:form.provider,paymentMethod:form.paymentMethod,issue:form.issue,sendEmailAfterIssue:form.sendEmailAfterIssue});
      else await api.post("/saas/finance/charges/ad-hoc",{payerSource:"EXTERNAL",tenantId:null,payer:{...form.payer,email:valueOrNull(form.payer.email),phone:valueOrNull(form.payer.phone),zipCode:valueOrNull(form.payer.zipCode),street:valueOrNull(form.payer.street),number:valueOrNull(form.payer.number),complement:valueOrNull(form.payer.complement),district:valueOrNull(form.payer.district),city:valueOrNull(form.payer.city),state:valueOrNull(form.payer.state)},amount:form.amount,dueDate:form.dueDate,description:form.description,provider:form.provider,paymentMethod:form.paymentMethod,issue:form.issue,sendEmailAfterIssue:form.sendEmailAfterIssue});
      await onDone();
    }catch(e){setError(apiMessage(e));}finally{setBusy(false);}
  }

  const defaultText=effectiveProvider&&effectiveMethod?`${providerLabels[effectiveProvider]||effectiveProvider} · ${methodLabel[effectiveMethod]||effectiveMethod}`:"Padrão ainda não configurado";
  const updatePayer=(patch:any)=>setForm((f:any)=>({...f,payer:{...f.payer,...patch}}));
  return <Modal title="Nova cobrança" onClose={onClose} wide><form className="commercial-form" onSubmit={submit}><div className="commercial-form-grid">
    <label>Tipo<select value={form.type} onChange={e=>setForm({...form,type:e.target.value,payerSource:e.target.value==="AD_HOC"?form.payerSource:"TENANT"})}><option value="MONTHLY">Mensalidade Ponto Certo</option><option value="PRODUCT_MONTHLY">Mensalidade de Produto</option><option value="IMPLEMENTATION">Implantação</option><option value="AD_HOC">Cobrança avulsa</option></select></label>
    {form.type==="AD_HOC"?<div className="finance-payer-source span-2"><span>Pagador</span><div><button type="button" className={form.payerSource==="TENANT"?"active":""} onClick={()=>setForm({...form,payerSource:"TENANT"})}>Cliente SaaS</button><button type="button" className={form.payerSource==="EXTERNAL"?"active":""} onClick={()=>setForm({...form,payerSource:"EXTERNAL"})}>Pagador avulso</button></div></div>:null}
    {form.type==="PRODUCT_MONTHLY"&&<label className="span-2">Assinatura de produto<select required value={form.subscriptionId} onChange={e=>setForm({...form,subscriptionId:e.target.value})}><option value="">Selecione</option>{productSubscriptions.map((x:any)=><option key={x.id} value={x.id}>{x.customer_name} · {x.product_name} · {x.plan_name||"Personalizado"}</option>)}</select></label>}
    {tenantMode&&<label className={form.type==="AD_HOC"?"span-2":""}>Cliente SaaS<select required value={form.tenantId} onChange={e=>setForm({...form,tenantId:e.target.value})}><option value="">Selecione</option>{tenants.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
    {["MONTHLY","PRODUCT_MONTHLY"].includes(form.type)?<label>Competência<input type="month" required value={form.competence} onChange={e=>setForm({...form,competence:e.target.value})}/></label>:<><label>Valor<CurrencyInput required min={effectiveProvider==="CORA"&&["HYBRID","BOLETO"].includes(String(effectiveMethod))?5:2.5} value={form.amount} onChange={amount=>setForm({...form,amount})}/></label><label>Vencimento<input type="date" required value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})}/></label><label className="span-2">Descrição<input required={form.type==="AD_HOC"} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder={form.type==="IMPLEMENTATION"?"Implantação Ponto Certo":"Ex.: treinamento adicional"}/></label></>}
    {form.type==="AD_HOC"?<><label>Provedor<select required value={form.provider} onChange={e=>setForm({...form,provider:e.target.value})}>{settings?.providers?.map((p:any)=><option key={p.code} value={p.code} disabled={!p.configured||!p.enabledByEnvironment}>{p.label}{!p.configured||!p.enabledByEnvironment?" · indisponível":""}</option>)}</select></label><label>Método<select required value={form.paymentMethod} onChange={e=>setForm({...form,paymentMethod:e.target.value})}><option value="HYBRID" disabled={!selected?.capabilities?.hybridBoletoPix}>Boleto + Pix</option><option value="PIX">Pix</option><option value="BOLETO">Boleto</option></select></label></>:<label className="span-2">{form.type==="PRODUCT_MONTHLY"?"Cobrança da assinatura":"Padrão global"}<input value={defaultText} disabled/></label>}

    {form.type==="AD_HOC"&&form.payerSource==="EXTERNAL"&&<>
      <div className="section-label span-2">Dados do pagador avulso</div>
      <label>Tipo de pessoa<select value={form.payer.personType} onChange={e=>updatePayer({personType:e.target.value,document:""})}><option value="PJ">Pessoa Jurídica</option><option value="PF">Pessoa Física</option></select></label>
      <label>Nome / Razão Social<input required value={form.payer.name} onChange={e=>updatePayer({name:e.target.value})}/></label>
      <label>{form.payer.personType==="PF"?"CPF":"CNPJ"}<MaskedInput mask={form.payer.personType==="PF"?"cpf":"cnpj"} required value={form.payer.document} onChange={document=>updatePayer({document})}/></label>
      <label>E-mail<input type="email" required={form.sendEmailAfterIssue||effectiveProvider==="MERCADO_PAGO"&&effectiveMethod==="BOLETO"} value={form.payer.email} onChange={e=>updatePayer({email:e.target.value})}/></label>
      <label>Telefone / WhatsApp<MaskedInput mask="phone" value={form.payer.phone} onChange={phone=>updatePayer({phone})}/></label>
      <div className="section-label span-2">Endereço do pagador</div>
      <label>CEP<CepLookupInput value={form.payer.zipCode} onChange={zipCode=>updatePayer({zipCode})} onAddressFound={address=>updatePayer({zipCode:address.zipCode,street:address.street,complement:address.complement,district:address.district,city:address.city,state:address.state,number:""})}/></label>
      <label>Logradouro<input value={form.payer.street} onChange={e=>updatePayer({street:e.target.value})}/></label>
      <label>Número<input value={form.payer.number} onChange={e=>updatePayer({number:e.target.value})}/></label>
      <label>Complemento<input value={form.payer.complement} onChange={e=>updatePayer({complement:e.target.value})}/></label>
      <label>Bairro<input value={form.payer.district} onChange={e=>updatePayer({district:e.target.value})}/></label>
      <label>Cidade<input value={form.payer.city} onChange={e=>updatePayer({city:e.target.value})}/></label>
      <label>UF<input maxLength={2} value={form.payer.state} onChange={e=>updatePayer({state:e.target.value.replace(/[^a-zA-Z]/g,"").toUpperCase()})}/></label>
    </>}

    {form.type==="PRODUCT_MONTHLY"&&selectedSubscription&&<div className="finance-payer-preview span-2"><div><strong>{selectedSubscription.customer_name} · {selectedSubscription.product_name}</strong><span>{selectedSubscription.plan_name||"Personalizado"} · {money(selectedSubscription.effective_price)}</span><span>Vencimento {String(selectedSubscription.next_due_date||"").slice(0,10)||"—"} · {selectedSubscription.customer_financial_email||selectedSubscription.customer_email||"E-mail financeiro não informado"}</span></div><div><Badge tone={selectedSubscription.legacy_migrated?"neutral":"success"}>{selectedSubscription.legacy_migrated?"Migrado legado · cobrança integral":"Assinatura ativa"}</Badge><small>{defaultText}</small></div></div>}
    {tenantMode&&form.tenantId&&<div className="finance-payer-preview span-2">{profileLoading?<span>Carregando cadastro financeiro…</span>:profile?<><div><strong>{profile.billingLegalName||profile.tenantName}</strong><span>{profile.billingDocument||"Documento não informado"}</span><span>{emailOfProfile(profile)||"E-mail financeiro não informado"}</span></div><div><Badge tone={profile.completeness?.complete?"success":"warning"}>{profile.completeness?.complete?"Cadastro financeiro completo":"Cadastro financeiro incompleto"}</Badge>{!profile.completeness?.complete&&<small>Pendências: {(profile.completeness?.missing||[]).map((x:string)=>payerFieldLabels[x]||x).join(", ")}</small>}<button type="button" className="ghost" onClick={()=>onEditProfile(Number(form.tenantId))}>Editar cadastro financeiro</button></div></>:null}</div>}

    <label className="finance-check span-2"><input type="checkbox" checked={form.sendEmailAfterIssue} onChange={e=>setForm({...form,sendEmailAfterIssue:e.target.checked})}/> Enviar cobrança por e-mail após emissão</label>
    <label className="finance-check span-2"><input type="checkbox" checked={form.issue} onChange={e=>setForm({...form,issue:e.target.checked})}/> Emitir imediatamente no provedor selecionado</label>
  </div>
  {uniqueErrors.length>0&&<div className="finance-validation-warning"><strong>Dados do pagador precisam de atenção.</strong><span>{uniqueErrors.join(" · ")}</span>{tenantMode&&form.tenantId&&<button type="button" className="ghost" onClick={()=>onEditProfile(Number(form.tenantId))}>Editar cadastro financeiro</button>}</div>}
  {minimumAmountError&&<div className="finance-validation-warning" role="alert"><strong>Valor abaixo do mínimo da Cora.</strong><span>{minimumAmountError}</span></div>}
  {error&&<p className="error" role="alert">{error}</p>}
  <div className="form-actions"><button type="button" className="ghost" onClick={onClose}>Cancelar</button><button className="primary" disabled={busy||!settings||uniqueErrors.length>0||Boolean(minimumAmountError)}>{busy?"Gerando…":"Gerar cobrança"}</button></div></form></Modal>;
}

function BillingProfile({tenantId,onClose,onDone}:{tenantId:number;onClose:()=>void;onDone:()=>Promise<void>}){
  const[data,setData]=useState<any>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[exception,setException]=useState<any>({presetDays:5,customEndDate:"",reason:""});
  async function load(){setError("");try{setData((await api.get(`/saas/finance/tenants/${tenantId}/profile`)).data);}catch(e){setError(apiMessage(e));}}
  useEffect(()=>{void load();},[tenantId]);
  const patch=(changes:any)=>setData((current:any)=>({...current,profile:{...current.profile,...changes}}));
  async function save(){setBusy(true);try{const p=data.profile;await api.put(`/saas/finance/tenants/${tenantId}/profile`,{dueDay:Number(p.dueDay),autoBlockEnabled:Boolean(p.autoBlockEnabled),autoMonthlyEnabled:Boolean(p.autoMonthlyEnabled),billingLegalName:p.billingLegalName||null,billingTradeName:p.billingTradeName||null,billingDocument:p.billingDocument||null,billingEmail:p.billingEmail||"",billingPhone:p.billingPhone||null,financialContactName:p.financialContactName||null,financialContactDocument:p.financialContactDocument||null,financialContactEmail:p.financialContactEmail||"",financialContactPhone:p.financialContactPhone||null,billingZipCode:p.billingZipCode||null,billingStreet:p.billingStreet||null,billingNumber:p.billingNumber||null,billingComplement:p.billingComplement||null,billingDistrict:p.billingDistrict||null,billingCity:p.billingCity||null,billingState:p.billingState||null,autoEmailCharges:Boolean(p.autoEmailCharges)});await load();await onDone();}catch(e){setError(apiMessage(e));}finally{setBusy(false);}}
  async function grant(){setBusy(true);try{const body:any={reason:exception.reason};if(exception.customEndDate)body.customEndDate=exception.customEndDate;else body.presetDays=Number(exception.presetDays);await api.post(`/saas/finance/tenants/${tenantId}/access-exceptions`,body);setException({presetDays:5,customEndDate:"",reason:""});await load();await onDone();}catch(e){setError(apiMessage(e));}finally{setBusy(false);}}
  async function revoke(id:number){setBusy(true);try{await api.delete(`/saas/finance/access-exceptions/${id}`);await load();await onDone();}catch(e){setError(apiMessage(e));}finally{setBusy(false);}}
  if(!data)return <Modal title="Configuração financeira" onClose={onClose}><p>{error||"Carregando…"}</p></Modal>;
  const p=data.profile;
  return <Modal title={`Financeiro · ${p.tenantName}`} onClose={onClose} wide><div className="finance-profile">
    <section><div className="commercial-section-head"><div><h3>Dados de faturamento</h3><p>Estes dados são copiados para o snapshot de cada nova cobrança.</p></div><Badge tone={p.completeness?.complete?"success":"warning"}>{p.completeness?.complete?"Cadastro completo":"Cadastro incompleto"}</Badge></div><div className="commercial-form-grid"><label>Razão social<input value={p.billingLegalName||""} onChange={e=>patch({billingLegalName:e.target.value})}/></label><label>Nome fantasia<input value={p.billingTradeName||""} onChange={e=>patch({billingTradeName:e.target.value})}/></label><label>CPF / CNPJ<MaskedInput mask="cpfCnpj" value={p.billingDocument||""} onChange={billingDocument=>patch({billingDocument})}/></label><label>E-mail de faturamento<input type="email" value={p.billingEmail||""} onChange={e=>patch({billingEmail:e.target.value})}/></label><label>Telefone<MaskedInput mask="phone" value={p.billingPhone||""} onChange={billingPhone=>patch({billingPhone})}/></label></div></section>
    <section><h3>Responsável financeiro</h3><div className="commercial-form-grid"><label>Nome<input value={p.financialContactName||""} onChange={e=>patch({financialContactName:e.target.value})}/></label><label>CPF<MaskedInput mask="cpf" value={p.financialContactDocument||""} onChange={financialContactDocument=>patch({financialContactDocument})}/></label><label>E-mail financeiro<input type="email" value={p.financialContactEmail||""} onChange={e=>patch({financialContactEmail:e.target.value})}/></label><label>Telefone / WhatsApp<MaskedInput mask="phone" value={p.financialContactPhone||""} onChange={financialContactPhone=>patch({financialContactPhone})}/></label></div></section>
    <section><h3>Endereço de faturamento</h3><div className="commercial-form-grid"><label>CEP<CepLookupInput value={p.billingZipCode||""} onChange={billingZipCode=>patch({billingZipCode})} onAddressFound={address=>patch({billingZipCode:address.zipCode,billingStreet:address.street,billingComplement:address.complement,billingDistrict:address.district,billingCity:address.city,billingState:address.state,billingNumber:""})}/></label><label>Logradouro<input value={p.billingStreet||""} onChange={e=>patch({billingStreet:e.target.value})}/></label><label>Número<input value={p.billingNumber||""} onChange={e=>patch({billingNumber:e.target.value})}/></label><label>Complemento<input value={p.billingComplement||""} onChange={e=>patch({billingComplement:e.target.value})}/></label><label>Bairro<input value={p.billingDistrict||""} onChange={e=>patch({billingDistrict:e.target.value})}/></label><label>Cidade<input value={p.billingCity||""} onChange={e=>patch({billingCity:e.target.value})}/></label><label>UF<input maxLength={2} value={p.billingState||""} onChange={e=>patch({billingState:e.target.value.replace(/[^a-zA-Z]/g,"").toUpperCase()})}/></label></div></section>
    <section><h3>Mensalidade e preferências</h3><div className="commercial-form-grid"><label>Vencimento mensal<select value={p.dueDay} onChange={e=>patch({dueDay:Number(e.target.value)})}><option value={5}>Dia 5</option><option value={10}>Dia 10</option><option value={15}>Dia 15</option></select></label><label>Tolerância<input value="3 dias corridos" disabled/></label><label className="finance-check"><input type="checkbox" checked={p.autoMonthlyEnabled} onChange={e=>patch({autoMonthlyEnabled:e.target.checked})}/> Gerar mensalidade automaticamente</label><label className="finance-check"><input type="checkbox" checked={p.autoBlockEnabled} onChange={e=>patch({autoBlockEnabled:e.target.checked})}/> Bloqueio financeiro automático</label><label className="finance-check span-2"><input type="checkbox" checked={p.autoEmailCharges} onChange={e=>patch({autoEmailCharges:e.target.checked})}/> Enviar cobranças automaticamente por e-mail</label></div><button className="primary" disabled={busy} onClick={save}>{busy?"Salvando…":"Salvar configuração financeira"}</button></section>
    <section><h3>Situação atual</h3><div className={`finance-access-state ${data.access.blocked?"blocked":"ok"}`}><strong>{data.access.blocked?"Acesso bloqueado financeiramente":"Acesso financeiro regular"}</strong><span>{data.access.blockingCharges.length} cobrança(s) bloqueante(s)</span>{data.access.globalException&&<small>Liberado administrativamente até {brDate(data.access.globalException.endsAt)}</small>}</div></section>
    <section><h3>Suspender bloqueio financeiro</h3><p className="muted">A cobrança permanece vencida; apenas o acesso é liberado temporariamente.</p><div className="commercial-form-grid"><label>Prazo<select value={exception.customEndDate?"custom":exception.presetDays} onChange={e=>e.target.value==="custom"?setException({...exception,customEndDate:today()}):setException({...exception,presetDays:Number(e.target.value),customEndDate:""})}><option value={5}>+5 dias</option><option value={10}>+10 dias</option><option value={30}>+30 dias</option><option value="custom">Data personalizada</option></select></label>{exception.customEndDate&&<label>Liberar até<input type="date" value={exception.customEndDate} onChange={e=>setException({...exception,customEndDate:e.target.value})}/></label>}<label className="span-2">Motivo<textarea rows={3} value={exception.reason} onChange={e=>setException({...exception,reason:e.target.value})}/></label></div><button disabled={busy||exception.reason.trim().length<3} onClick={grant}>Conceder liberação</button><div className="finance-exception-list">{data.exceptions.filter((x:any)=>!x.revoked_at).map((x:any)=><div key={x.id}><span><strong>{x.charge_id?"Cobrança específica":"Cliente inteiro"}</strong><small>Até {brDate(x.ends_at)} · {x.reason}</small></span><button className="danger" disabled={busy} onClick={()=>revoke(x.id)}>Revogar</button></div>)}</div></section>
  </div>{error&&<p className="error" role="alert">{error}</p>}</Modal>;
}

function ChargeAdjustmentModal({charge,onClose,onDone,onRefresh}:{charge:any;onClose:()=>void;onDone:()=>Promise<void>;onRefresh:()=>Promise<void>}){
  const initialDue=String(charge.due_date||'').slice(0,10)<today()?today():String(charge.due_date||'').slice(0,10);
  const [form,setForm]=useState<any>({discountType:'PERCENT',discountValue:0,dueDate:initialDue,reason:'',applyRecurringDiscount:false});
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[completed,setCompleted]=useState(false);
  const base=Number(charge.amount||0);const value=Number(form.discountValue||0);
  const discount=form.discountType==='PERCENT'?Math.round(base*value)/100:form.discountType==='FIXED'?value:0;
  const next=Math.max(0,Math.round((base-discount)*100)/100);
  const minimumAmountError=coraMinimumAmountError(charge.provider,charge.requested_payment_method,next);
  async function submit(e:React.FormEvent){e.preventDefault();if(minimumAmountError){setError(minimumAmountError);return;}if(!confirm(`A cobrança #${charge.id} será cancelada no provedor e substituída por uma nova cobrança de ${money(next)}. Continuar?`))return;setBusy(true);setError('');try{const {data}=await api.post(`/saas/finance/charges/${charge.id}/reissue-adjusted`,{discountType:form.discountType,discountValue:Number(form.discountValue||0),dueDate:form.dueDate,reason:form.reason,applyRecurringDiscount:Boolean(form.applyRecurringDiscount)});if(data.issueError){setCompleted(true);setError(`A cobrança anterior foi cancelada e a nova #${data.newCharge?.id} foi criada, mas a emissão precisa de atenção: ${data.issueError}`);await onRefresh();return;}await onDone();}catch(e){setError(apiMessage(e));await onRefresh().catch(()=>undefined);}finally{setBusy(false);}}
  return <Modal title={`Ajustar / reemitir cobrança #${charge.id}`} onClose={onClose} wide><form className="commercial-form" onSubmit={submit}><div className="commercial-settings-intro">Use esta ação para conceder desconto apenas nesta cobrança ou alterar seu vencimento. O boleto/BolePix atual será cancelado no provedor e uma nova cobrança será emitida. A cobrança anterior permanece no histórico para auditoria.</div><div className="commercial-form-grid"><label>Valor atual<input value={money(base)} disabled/></label><label>Tipo de desconto<select value={form.discountType} onChange={e=>setForm({...form,discountType:e.target.value,discountValue:0,applyRecurringDiscount:false})}><option value="NONE">Sem desconto · apenas reemitir</option><option value="PERCENT">Percentual (%)</option><option value="FIXED">Valor fixo (R$)</option></select></label>{form.discountType==='PERCENT'&&<label>Desconto (%)<input type="number" min="0.01" max="99.99" step="0.01" value={form.discountValue} onChange={e=>setForm({...form,discountValue:Number(e.target.value)})}/></label>}{form.discountType==='FIXED'&&<label>Desconto (R$)<CurrencyInput min={0.01} value={form.discountValue} onChange={discountValue=>setForm({...form,discountValue})}/></label>}<label>Novo vencimento<input type="date" min={today()} required value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})}/></label><label>Desconto calculado<input value={money(discount)} disabled/></label><label>Novo valor<input value={money(next)} disabled/></label>{charge.product_subscription_id&&form.discountType==='PERCENT'&&<label className="finance-check span-2"><input type="checkbox" checked={form.applyRecurringDiscount} onChange={e=>setForm({...form,applyRecurringDiscount:e.target.checked})}/> Aplicar este percentual também às próximas mensalidades da assinatura</label>}<label className="span-2">Motivo / justificativa<textarea rows={3} minLength={3} maxLength={500} required value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} placeholder="Ex.: desconto comercial excepcional autorizado"/></label></div>{minimumAmountError&&<div className="finance-validation-warning" role="alert"><strong>Valor abaixo do mínimo da Cora.</strong><span>{minimumAmountError}</span></div>}{error&&<p className="error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="ghost" onClick={onClose}>{completed?'Fechar':'Cancelar'}</button>{!completed&&<button className="primary" disabled={busy||form.reason.trim().length<3||!form.dueDate||next<=0||Boolean(minimumAmountError)||(form.discountType!=='NONE'&&value<=0)}>{busy?'Cancelando e reemitindo…':'Confirmar e reemitir'}</button>}</div></form></Modal>;
}

function FinancePushModal({onClose}:{onClose:()=>void}){
  const [data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const deviceKey=useMemo(()=>financeDeviceKey(),[]);
  async function load(){setError("");try{setData((await api.get("/saas/finance/notifications/settings")).data);}catch(e){setError(apiMessage(e));}}
  useEffect(()=>{void load();},[]);
  const enabled=Boolean(data?.subscriptions?.some((x:any)=>x.deviceKey===deviceKey&&x.enabled));
  async function enable(){setBusy(true);setError("");setMessage("");try{if(!("Notification" in window)||!("serviceWorker" in navigator)||!("PushManager" in window))throw new Error("Este navegador não oferece Web Push para este PWA.");if(!data?.webReady||!data?.publicKey)throw new Error("Configure as chaves VAPID no servidor antes de ativar as notificações.");const permission=await Notification.requestPermission();if(permission!=="granted")throw new Error("A permissão de notificações não foi concedida.");await navigator.serviceWorker.register("/sw.js");const registration=await navigator.serviceWorker.ready;let subscription=await registration.pushManager.getSubscription();if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64Key(data.publicKey)});const raw=subscription.toJSON();const pushSubscription={endpoint:String(raw.endpoint||subscription.endpoint),keys:{p256dh:String(raw.keys?.p256dh||""),auth:String(raw.keys?.auth||"")}};if(!pushSubscription.endpoint||!pushSubscription.keys.p256dh||!pushSubscription.keys.auth)throw new Error("O navegador não retornou uma assinatura Web Push completa. Atualize a página e tente novamente.");await api.put("/saas/finance/notifications/subscription",{deviceKey,paymentConfirmed:true,subscription:pushSubscription});setMessage("Notificações de pagamento ativadas neste dispositivo.");await load();}catch(e){setError(apiMessage(e));}finally{setBusy(false);}}
  async function disable(){setBusy(true);setError("");setMessage("");try{await api.delete(`/saas/finance/notifications/subscription/${deviceKey}`);setMessage("Notificações financeiras desativadas neste dispositivo.");await load();}catch(e){setError(apiMessage(e));}finally{setBusy(false);}}
  const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent),standalone=window.matchMedia?.("(display-mode: standalone)").matches||(navigator as any).standalone===true;
  return <Modal title="Notificações de pagamento" onClose={onClose}><div className="finance-push-settings"><div className={`finance-push-state ${enabled?"ok":"off"}`}><strong>{enabled?"Ativas neste dispositivo":"Desativadas neste dispositivo"}</strong><span>Receba uma notificação PWA assim que boleto ou Pix for confirmado pelo provedor financeiro.</span></div>{ios&&!standalone&&<div className="finance-push-hint">No iPhone/iPad, instale o Ponto Certo na Tela de Início e abra pelo ícone instalado para habilitar Web Push.</div>}{data&&!data.webReady&&<div className="finance-validation-warning"><strong>Servidor não configurado</strong><span>As chaves VAPID precisam estar configuradas para enviar notificações PWA.</span></div>}{error&&<p className="error" role="alert">{error}</p>}{message&&<p className="success-message" role="status">{message}</p>}<div className="form-actions finance-mobile-actions"><button type="button" className="ghost" onClick={onClose}>Fechar</button>{enabled?<button type="button" className="danger" disabled={busy} onClick={()=>void disable()}>{busy?"Aguarde…":"Desativar neste dispositivo"}</button>:<button type="button" className="primary" disabled={busy||data?.webReady===false} onClick={()=>void enable()}>{busy?"Ativando…":"Ativar notificações"}</button>}</div></div></Modal>;
}

function EmailChargeModal({charge,onClose,onDone}:{charge:any;onClose:()=>void;onDone:()=>Promise<void>}){
  const[to,setTo]=useState(charge.payer_email||""),[cc,setCc]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");try{await api.post(`/saas/finance/charges/${charge.id}/email`,{to,cc:cc||null});await onDone();}catch(e){setError(apiMessage(e));}finally{setBusy(false);}}
  return <Modal title="Reenviar por e-mail" onClose={onClose}><form className="commercial-form" onSubmit={submit}><p className="muted">A cobrança existente será reenviada. Nenhuma nova cobrança será criada no provedor.</p><div className="commercial-form-grid"><label className="span-2">Destinatário<input type="email" required value={to} onChange={e=>setTo(e.target.value)}/></label><label className="span-2">CC opcional<input type="email" value={cc} onChange={e=>setCc(e.target.value)}/></label></div>{error&&<p className="error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="ghost" onClick={onClose}>Cancelar</button><button className="primary" disabled={busy}>{busy?"Enviando…":"Reenviar por e-mail"}</button></div></form></Modal>;
}

function DeliveryHistoryModal({charge,onClose}:{charge:any;onClose:()=>void}){
  const[rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
  useEffect(()=>{let active=true;void api.get(`/saas/finance/charges/${charge.id}/deliveries`).then(r=>{if(active)setRows(r.data);}).catch(e=>{if(active)setError(apiMessage(e));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[charge.id]);
  return <Modal title="Histórico de envios" onClose={onClose} wide>{loading?<p>Carregando histórico…</p>:error?<p className="error" role="alert">{error}</p>:rows.length===0?<Empty>Nenhum e-mail enviado para esta cobrança.</Empty>:<div className="table-wrap"><table className="finance-table"><thead><tr><th>Data</th><th>Tipo</th><th>Destinatário</th><th>CC</th><th>Status</th><th>Responsável</th><th>Observação</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{brDate(r.sent_at||r.created_at)}</td><td>{r.delivery_type==="AUTO"?"Automático":"Manual"}</td><td>{r.recipient_email}</td><td>{r.cc_email||"—"}</td><td><Badge tone={r.status==="SENT"?"success":r.status==="FAILED"?"danger":"warning"}>{r.status}</Badge></td><td>{r.sent_by_name||"Sistema"}</td><td>{r.error_message||"—"}</td></tr>)}</tbody></table></div>}</Modal>;
}
