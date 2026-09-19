import {useEffect,useMemo,useState} from "react";
import {Icon} from "../components/Icon";
import {SaasPage} from "./SaasPage";
import {SaasPlans,ContractEditor} from "./SaasPlans";
import {ProposalsPage} from "./ProposalsPage";
import {SaasEmail} from "./SaasEmail";
import {SaasGeneral} from "./SaasGeneral";
import {AuditPage} from "./AuditPage";
import {PasswordPage} from "./PasswordPage";
import {ContractsPage} from "./ContractsPage";
import {SaasFinance} from "./SaasFinance";
import {SaasFinanceProviders} from "./SaasFinanceProviders";
import {SaasCommercialCustomers} from "./SaasCommercialCustomers";
import {SaasProducts} from "./SaasProducts";
import {SaasProductSubscriptions} from "./SaasProductSubscriptions";
import {SaasSellerProfile} from "./SaasSellerProfile";
import {SaasDocumentTemplates} from "./SaasDocumentTemplates";
import {SaasMovyoIntegration} from "./SaasMovyoIntegration";

import {ResourceState,useResource,money} from "./CommercialUi";
import "./commercial.css";

const sections:Record<string,{label:string;icon:string;group:string}>={
  overview:{label:"Dashboard SaaS",icon:"dashboard",group:"Visão geral"},
  clients:{label:"Clientes / Empresas",icon:"users",group:"Comercial"},
  "commercial-customers":{label:"Clientes Comerciais",icon:"users",group:"Comercial"},
  products:{label:"Produtos",icon:"plans",group:"Comercial"},
  "product-subscriptions":{label:"Assinaturas por Produto",icon:"subscription",group:"Comercial"},
  "movyo-integration":{label:"Integração Movyo",icon:"subscription",group:"Comercial"},
  plans:{label:"Planos",icon:"plans",group:"Comercial"},
  subscriptions:{label:"Assinaturas e Recursos",icon:"subscription",group:"Comercial"},
  proposals:{label:"Propostas Comerciais",icon:"proposal",group:"Negociações"},
  contracts:{label:"Contratos",icon:"contract",group:"Negociações"},
  "document-templates":{label:"Modelos de documentos",icon:"proposal",group:"Negociações"},
  finance:{label:"Dashboard Financeiro",icon:"finance",group:"Financeiro"},
  "finance-charges":{label:"Cobranças",icon:"subscription",group:"Financeiro"},
  "finance-receipts":{label:"Recebimentos",icon:"check",group:"Financeiro"},
  "finance-delinquent":{label:"Inadimplentes",icon:"occurrences",group:"Financeiro"},
  "finance-providers":{label:"Provedores de Pagamento",icon:"finance",group:"Financeiro"},
  "finance-logs":{label:"Logs Financeiros",icon:"audit",group:"Financeiro"},
  audit:{label:"Auditoria SaaS",icon:"audit",group:"Administração"},
  settings:{label:"Configurações SaaS",icon:"settings",group:"Administração"},
  seller:{label:"Empresa Vendedora",icon:"companies",group:"Administração"},
  email:{label:"Configuração de e-mail",icon:"mail",group:"Administração"},
  password:{label:"Alterar senha",icon:"password",group:"Conta"},
};
const current=()=>location.hash.replace("#saas/","").split("?")[0];

export default function SaasPortal({logout}:{logout:()=>void}){
  const [page,setPage]=useState(sections[current()]?current():"overview"),[message,setMessage]=useState<{text:string;error:boolean}|null>(null),[navOpen,setNavOpen]=useState(false);
  useEffect(()=>{const change=()=>{setPage(sections[current()]?current():"overview");setMessage(null);setNavOpen(false);};window.addEventListener("hashchange",change);return()=>window.removeEventListener("hashchange",change);},[]);
  const groups=useMemo(()=>Array.from(new Set(Object.values(sections).map(s=>s.group))),[]);
  const title=sections[page]?.label||"Administração SaaS";
  return <div className={`commercial-shell ${navOpen?"nav-open":""}`}>
    <aside className="commercial-sidebar" aria-label="Administração SaaS">
      <div className="commercial-brand"><a href="#saas/overview" aria-label="Ir para o Dashboard SaaS"><img src="/brand/logo.png" alt="Ponto Certo"/></a><span>Administração SaaS</span></div>
      <nav className="commercial-nav" aria-label="Navegação SaaS">
        {groups.map(group=><div className="commercial-nav-group" key={group}><p>{group}</p>{Object.entries(sections).filter(([,s])=>s.group===group).map(([key,item])=><a key={key} href={`#saas/${key}`} aria-current={page===key?"page":undefined}><Icon name={item.icon} size={18}/><span>{item.label}</span></a>)}</div>)}
      </nav>
      <div className="commercial-sidebar-footer"><div className="commercial-admin-avatar">PC</div><div><strong>Administrador SaaS</strong><span>Ambiente global</span></div><button className="commercial-icon-btn" onClick={logout} aria-label="Sair"><Icon name="logout" size={18}/></button></div>
    </aside>
    <div className="commercial-workspace">
      <header className="commercial-topbar"><button className="commercial-mobile-menu" onClick={()=>setNavOpen(!navOpen)} aria-label={navOpen?"Fechar menu":"Abrir menu"} aria-expanded={navOpen}><Icon name={navOpen?"close":"menu"} size={20}/></button><div><span className="commercial-eyebrow">Ponto Certo</span><strong>{title}</strong></div><div className="commercial-topbar-actions"><span className="commercial-role-chip">SUPER ADMIN</span><button className="commercial-logout" onClick={logout}><Icon name="logout" size={16}/>Sair</button></div></header>
      {navOpen&&<button className="commercial-nav-backdrop" aria-label="Fechar menu" onClick={()=>setNavOpen(false)}/>} 
      <main className="commercial-main" id="main-content">
        {message&&<div className={`commercial-toast ${message.error?"error":"success"}`} role={message.error?"alert":"status"}>{message.text}</div>}
        {page==="overview"?<Overview/>:page==="clients"?<SaasPage notify={(text,t)=>setMessage({text,error:t==="error"})}/>:page==="commercial-customers"?<SaasCommercialCustomers/>:page==="products"?<SaasProducts/>:page==="product-subscriptions"?<SaasProductSubscriptions/>:page==="movyo-integration"?<SaasMovyoIntegration/>:page==="document-templates"?<SaasDocumentTemplates/>:page==="seller"?<SaasSellerProfile/>:page==="plans"?<SaasPlans/>:page==="proposals"?<ProposalsPage/>:page==="subscriptions"?<Subscriptions/>:page==="contracts"?<ContractsPage/>:page==="finance"?<SaasFinance view="dashboard"/>:page==="finance-charges"?<SaasFinance view="charges"/>:page==="finance-receipts"?<SaasFinance view="receipts"/>:page==="finance-delinquent"?<SaasFinance view="delinquent"/>:page==="finance-providers"?<SaasFinanceProviders/>:page==="finance-logs"?<SaasFinance view="logs"/>:page==="audit"?<AuditPage global/>:page==="settings"?<SaasGeneral/>:page==="email"?<SaasEmail/>:<PasswordPage/>}
      </main>
    </div>
  </div>;
}

function Overview(){
  const r=useResource("/saas/dashboard");
  const finance=r.data?.finance||{};
  const productMetrics=r.data?.productMetrics||{};
  const financeCards=[
    {label:"MRR total",value:money(productMetrics.mrrTotal??r.data?.monthly),detail:"Receita recorrente contratada em todos os produtos",icon:"subscription",tone:"teal",href:"#saas/product-subscriptions"},
    {label:"Recebido no mês",value:money(finance.receivedMonth),detail:"Pagamentos confirmados no mês",icon:"check",tone:"green",href:"#saas/finance-receipts"},
    {label:"A receber",value:money(finance.openAmount),detail:`${finance.openCount||0} cobrança(s) em aberto`,icon:"finance",tone:"blue",href:"#saas/finance-charges"},
    {label:"Vencido",value:money(finance.overdueAmount),detail:`${finance.overdueTenants||0} cliente(s) · ${finance.overdueCount||0} cobrança(s)`,icon:"occurrences",tone:"red",href:"#saas/finance-delinquent"},
  ];
  const health=[
    {label:"Clientes ativos",value:r.data?.counts.active||0,icon:"users",tone:"green"},
    {label:"Em teste",value:r.data?.counts.trial||0,icon:"plans",tone:"violet"},
    {label:"Suspensos",value:r.data?.counts.suspended||0,icon:"occurrences",tone:"amber"},
    {label:"Funcionários ativos",value:r.data?.counts.employees||0,icon:"employees",tone:"blue"},
    {label:"Empresas / filiais",value:r.data?.counts.companies||0,icon:"companies",tone:"slate"},
    {label:"Contratos ativos",value:r.data?.contracts.active||0,icon:"contract",tone:"green"},
  ];
  const attention=[
    ...(finance.attention||[]),
    ...(Number(r.data?.contracts.awaiting_signature||0)>0?[{kind:"CONTRACT",label:`${r.data.contracts.awaiting_signature} contrato(s) aguardando assinatura`,tenantName:"Negociações pendentes",href:"#saas/contracts"}]:[]),
    ...(Number(r.data?.proposals.expired||0)>0?[{kind:"PROPOSAL",label:`${r.data.proposals.expired} proposta(s) expirada(s)`,tenantName:"Revisar pipeline comercial",href:"#saas/proposals"}]:[]),
  ].slice(0,8);
  return <>
    <div className="commercial-heading commercial-dashboard-heading"><div><span className="commercial-kicker">Visão executiva</span><h1>Dashboard SaaS</h1><p>Receita, carteira, inadimplência e operação em uma visão única para priorizar as próximas ações.</p></div><div className="commercial-heading-actions commercial-dashboard-actions"><a className="secondary" href="#saas/clients?new=1">+ Novo cliente</a><a className="secondary" href="#saas/finance-charges?new=1">+ Nova cobrança</a><a className="primary" href="#saas/proposals?new=1">+ Nova proposta</a><a className="attention" href="#saas/finance-delinquent">Ver inadimplentes</a></div></div>
    <ResourceState resource={r}>
      <section className="commercial-finance-kpis" aria-label="Resultado financeiro">{financeCards.map(card=><a className={`commercial-finance-kpi metric-${card.tone}`} href={card.href} key={card.label}><span className="commercial-finance-kpi-icon"><Icon name={card.icon} size={21}/></span><span><small>{card.label}</small><strong>{card.value}</strong><em>{card.detail}</em></span></a>)}</section>
      <section className="commercial-product-kpis" aria-label="MRR por produto">{[
        {code:"PONTO_CERTO",label:"MRR Ponto Certo",value:productMetrics.mrrPontoCerto},
        {code:"MOVYO",label:"MRR Movyo",value:productMetrics.mrrMovyo},
        {code:"PAYHUB",label:"MRR PayHub",value:productMetrics.mrrPayHub},
      ].map(product=>{const stats=(productMetrics.products||[]).find((p:any)=>p.productCode===product.code)||{};return <a href={`#saas/product-subscriptions?product=${product.code}`} className="commercial-product-kpi" key={product.code}><span><small>{product.label}</small><strong>{money(product.value)}</strong></span><div><em>Ativas <b>{stats.active||0}</b></em><em>Em atraso <b>{stats.pastDue||0}</b></em><em>Bloqueadas <b>{stats.blocked||0}</b></em></div></a>})}</section>
      <section className="commercial-health-section"><div className="commercial-section-head"><div><span className="commercial-kicker">Saúde do SaaS</span><h2>Operação da carteira</h2></div><span className="commercial-health-caption">{r.data?.counts.clients||0} clientes cadastrados</span></div><div className="commercial-health-grid">{health.map(card=><article className={`commercial-health-card metric-${card.tone}`} key={card.label}><span className="commercial-health-icon"><Icon name={card.icon} size={17}/></span><div><strong>{card.value}</strong><small>{card.label}</small></div></article>)}</div></section>
      <div className="commercial-dashboard-grid commercial-executive-grid"><section className="commercial-panel"><div className="commercial-panel-head"><div><span className="commercial-kicker">Carteira</span><h2>Distribuição por plano</h2></div><a href="#saas/plans">Gerenciar planos</a></div>{r.data?.plans?.length?<div className="commercial-plan-distribution">{r.data.plans.map((p:any)=>{const total=Math.max(1,Number(r.data?.counts.clients||0));const pct=Math.round((Number(p.clients||0)/total)*100);return <div className="commercial-plan-row" key={p.id}><div><strong>{p.name}</strong><span>{p.clients} cliente{Number(p.clients)===1?"":"s"}</span></div><div className="commercial-progress"><i style={{width:`${pct}%`}}/></div><b>{pct}%</b></div>})}</div>:<div className="commercial-empty"><div className="commercial-empty-icon"><Icon name="plans" size={24}/></div><strong>Nenhum cliente contratado</strong><p>A distribuição aparecerá conforme os contratos forem ativados.</p></div>}</section>
      <section className="commercial-panel"><div className="commercial-panel-head"><div><span className="commercial-kicker">Funil comercial</span><h2>Negociações</h2></div><a href="#saas/proposals">Ver propostas</a></div><div className="commercial-funnel"><a href="#saas/proposals"><span>Em aberto</span><strong>{r.data?.proposals.open||0}</strong></a><a href="#saas/proposals"><span>Aprovadas</span><strong>{r.data?.proposals.approved||0}</strong></a><a href="#saas/proposals"><span>Convertidas</span><strong>{r.data?.proposals.converted||0}</strong></a><a href="#saas/proposals"><span>Expiradas</span><strong>{r.data?.proposals.expired||0}</strong></a><a href="#saas/contracts"><span>Aguardando assinatura</span><strong>{r.data?.contracts.awaiting_signature||0}</strong></a></div></section></div>
      <section className="commercial-panel commercial-attention"><div className="commercial-panel-head"><div><span className="commercial-kicker">Prioridades</span><h2>Atenção necessária</h2></div><a href="#saas/finance-delinquent">Ver inadimplentes</a></div>{attention.length?<div className="commercial-attention-list">{attention.map((item:any,index:number)=><a href={item.href||"#saas/finance-delinquent"} key={`${item.kind}-${item.chargeId||index}`}><span className={`commercial-attention-dot ${item.kind==="BLOCKED"?"critical":item.kind==="OVERDUE"?"warning":"neutral"}`}/><span><strong>{item.tenantName}</strong><small>{item.label}{item.date?` · vencimento ${String(item.date).slice(0,10).split("-").reverse().join("/")}`:""}</small></span>{item.amount!=null&&<b>{money(item.amount)}</b>}<Icon name="arrow" size={16}/></a>)}</div>:<div className="commercial-empty compact-empty"><strong>Nenhuma pendência crítica</strong><p>Financeiro e pipeline comercial sem itens prioritários neste momento.</p></div>}</section>
    </ResourceState>
  </>;
}

function Subscriptions(){const r=useResource("/saas/tenants"),[selected,setSelected]=useState<number|null>(null);return <><div className="commercial-heading"><div><span className="commercial-kicker">Gestão comercial</span><h1>Assinaturas e recursos</h1><p>Gerencie valores negociados, capacidade contratada e liberações individuais por empresa.</p></div></div><ResourceState resource={r}>{r.data?.length?<section className="commercial-panel table-panel"><div className="table-scroll"><table><thead><tr><th>Cliente</th><th>Plano</th><th>Funcionários</th><th>Status</th><th>Contrato</th></tr></thead><tbody>{r.data.map((t:any)=><tr key={t.id}><td><strong>{t.name}</strong><small>Tenant #{t.id}</small></td><td>{t.plan_name||"Sem plano"}</td><td><strong>{t.employee_count}</strong></td><td><span className={`commercial-status status-${String(t.subscription_status||t.status||"").toLowerCase()}`}>{labelStatus(t.subscription_status||t.status)}</span></td><td><button className="secondary compact" onClick={()=>setSelected(t.id)}>Configurar contrato</button></td></tr>)}</tbody></table></div></section>:<div className="commercial-empty"><strong>Nenhuma assinatura encontrada</strong><p>Os clientes convertidos passarão a aparecer aqui.</p></div>}</ResourceState>{selected&&<ContractEditor tenantId={selected} onClose={()=>{setSelected(null);void r.reload();}}/>}</>;
}

function labelStatus(value:string){return ({ACTIVE:"Ativa",TRIAL:"Em teste",PAST_DUE:"Pagamento pendente",SUSPENDED:"Suspensa",CANCELED:"Cancelada"} as Record<string,string>)[value]||value||"—";}
