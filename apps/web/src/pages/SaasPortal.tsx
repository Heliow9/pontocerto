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
import {ResourceState,useResource,money} from "./CommercialUi";
import "./commercial.css";

const sections:Record<string,{label:string;icon:string;group:string}>={
  overview:{label:"Dashboard SaaS",icon:"dashboard",group:"Visão geral"},
  clients:{label:"Clientes / Empresas",icon:"users",group:"Comercial"},
  plans:{label:"Planos",icon:"plans",group:"Comercial"},
  subscriptions:{label:"Assinaturas e Recursos",icon:"subscription",group:"Comercial"},
  proposals:{label:"Propostas Comerciais",icon:"proposal",group:"Negociações"},
  contracts:{label:"Contratos",icon:"contract",group:"Negociações"},
  audit:{label:"Auditoria SaaS",icon:"audit",group:"Administração"},
  settings:{label:"Configurações SaaS",icon:"settings",group:"Administração"},
  email:{label:"Configuração de e-mail",icon:"mail",group:"Administração"},
  password:{label:"Alterar senha",icon:"password",group:"Conta"},
};
const current=()=>location.hash.replace("#saas/","");

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
        {page==="overview"?<Overview/>:page==="clients"?<SaasPage notify={(text,t)=>setMessage({text,error:t==="error"})}/>:page==="plans"?<SaasPlans/>:page==="proposals"?<ProposalsPage/>:page==="subscriptions"?<Subscriptions/>:page==="contracts"?<ContractsPage/>:page==="audit"?<AuditPage global/>:page==="settings"?<SaasGeneral/>:page==="email"?<SaasEmail/>:<PasswordPage/>}
      </main>
    </div>
  </div>;
}

function Overview(){
  const r=useResource("/saas/dashboard");
  const cards=[
    {label:"Total de clientes",value:r.data?.counts.clients,icon:"users",tone:"blue"},
    {label:"Clientes ativos",value:r.data?.counts.active,icon:"check",tone:"green"},
    {label:"Suspensos",value:r.data?.counts.suspended,icon:"occurrences",tone:"amber"},
    {label:"Em teste",value:r.data?.counts.trial,icon:"plans",tone:"violet"},
    {label:"MRR",value:money(r.data?.monthly),icon:"subscription",tone:"teal"},
    {label:"Funcionários ativos",value:r.data?.counts.employees,icon:"employees",tone:"blue"},
    {label:"Empresas / filiais",value:r.data?.counts.companies,icon:"companies",tone:"slate"},
    {label:"Propostas em aberto",value:r.data?.proposals.open,icon:"proposal",tone:"violet"},
    {label:"Contratos ativos",value:r.data?.contracts.active,icon:"contract",tone:"green"},
    {label:"Aguardando assinatura",value:r.data?.contracts.awaiting_signature,icon:"contract",tone:"amber"},
    {label:"Implantação contratada",value:money(r.data?.contracts.implementation_value),icon:"subscription",tone:"teal"},
    {label:"Cancelados",value:r.data?.counts.canceled,icon:"close",tone:"red"},
  ];
  return <><div className="commercial-heading"><div><span className="commercial-kicker">Visão geral</span><h1>Dashboard SaaS</h1><p>Acompanhe a saúde comercial e administrativa do Ponto Certo em um único lugar.</p></div><div className="commercial-heading-actions"><a className="primary" href="#saas/proposals">+ Nova proposta</a></div></div><ResourceState resource={r}><div className="commercial-metrics">{cards.map(card=><article className={`commercial-metric metric-${card.tone}`} key={card.label}><div className="commercial-metric-icon"><Icon name={card.icon} size={20}/></div><div><p>{card.label}</p><strong>{card.value??0}</strong></div></article>)}</div><div className="commercial-dashboard-grid"><section className="commercial-panel"><div className="commercial-panel-head"><div><span className="commercial-kicker">Carteira</span><h2>Distribuição por plano</h2></div><a href="#saas/plans">Gerenciar planos</a></div>{r.data?.plans?.length?<div className="commercial-plan-distribution">{r.data.plans.map((p:any)=>{const total=Math.max(1,Number(r.data?.counts.clients||0));const pct=Math.round((Number(p.clients||0)/total)*100);return <div className="commercial-plan-row" key={p.id}><div><strong>{p.name}</strong><span>{p.clients} cliente{Number(p.clients)===1?"":"s"}</span></div><div className="commercial-progress"><i style={{width:`${pct}%`}}/></div><b>{pct}%</b></div>})}</div>:<div className="commercial-empty"><div className="commercial-empty-icon"><Icon name="plans" size={24}/></div><strong>Nenhum cliente contratado</strong><p>Quando os contratos forem convertidos, a distribuição aparecerá aqui.</p><a className="secondary" href="#saas/proposals">Gerenciar propostas</a></div>}</section><section className="commercial-panel"><div className="commercial-panel-head"><div><span className="commercial-kicker">Pipeline</span><h2>Resumo comercial</h2></div></div><div className="commercial-summary-list"><a href="#saas/proposals"><span>Propostas aprovadas</span><strong>{r.data?.proposals.approved||0}</strong></a><a href="#saas/proposals"><span>Propostas expiradas</span><strong>{r.data?.proposals.expired||0}</strong></a><a href="#saas/proposals"><span>Propostas convertidas</span><strong>{r.data?.proposals.converted||0}</strong></a><a href="#saas/contracts"><span>Contratos cancelados</span><strong>{r.data?.contracts.canceled||0}</strong></a></div></section></div><section className="commercial-quick-actions"><div><span className="commercial-kicker">Atalhos</span><h2>Ações rápidas</h2></div><div><a href="#saas/clients"><Icon name="users" size={18}/>Consultar clientes</a><a href="#saas/subscriptions"><Icon name="subscription" size={18}/>Assinaturas e recursos</a><a href="#saas/contracts"><Icon name="contract" size={18}/>Contratos</a><a href="#saas/audit"><Icon name="audit" size={18}/>Auditoria</a></div></section></ResourceState></>;
}

function Subscriptions(){const r=useResource("/saas/tenants"),[selected,setSelected]=useState<number|null>(null);return <><div className="commercial-heading"><div><span className="commercial-kicker">Gestão comercial</span><h1>Assinaturas e recursos</h1><p>Gerencie valores negociados, capacidade contratada e liberações individuais por empresa.</p></div></div><ResourceState resource={r}>{r.data?.length?<section className="commercial-panel table-panel"><div className="table-scroll"><table><thead><tr><th>Cliente</th><th>Plano</th><th>Funcionários</th><th>Status</th><th>Contrato</th></tr></thead><tbody>{r.data.map((t:any)=><tr key={t.id}><td><strong>{t.name}</strong><small>Tenant #{t.id}</small></td><td>{t.plan_name||"Sem plano"}</td><td><strong>{t.employee_count}</strong></td><td><span className={`commercial-status status-${String(t.subscription_status||t.status||"").toLowerCase()}`}>{labelStatus(t.subscription_status||t.status)}</span></td><td><button className="secondary compact" onClick={()=>setSelected(t.id)}>Configurar contrato</button></td></tr>)}</tbody></table></div></section>:<div className="commercial-empty"><strong>Nenhuma assinatura encontrada</strong><p>Os clientes convertidos passarão a aparecer aqui.</p></div>}</ResourceState>{selected&&<ContractEditor tenantId={selected} onClose={()=>{setSelected(null);void r.reload();}}/>}</>;
}

function labelStatus(value:string){return ({ACTIVE:"Ativa",TRIAL:"Em teste",PAST_DUE:"Pagamento pendente",SUSPENDED:"Suspensa",CANCELED:"Cancelada"} as Record<string,string>)[value]||value||"—";}
