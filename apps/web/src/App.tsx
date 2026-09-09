import { useEffect, useState } from "react";
import { api } from "./api";
import { DashboardPage } from "./pages/DashboardPage";
import { CompaniesPage } from "./pages/CompaniesPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { SchedulesPage } from "./pages/SchedulesPage";
import { PointsPage } from "./pages/PointsPage";
import { OccurrencesPage } from "./pages/OccurrencesPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SaasPage } from "./pages/SaasPage";
import { LocationsPage } from "./pages/LocationsPage";
import { apiMessage } from "./utils";

type Page = "dashboard"|"companies"|"employees"|"schedules"|"locations"|"points"|"occurrences"|"reports"|"settings"|"saas";
const nav: {id:Page;label:string;icon:string;superOnly?:boolean}[]=[
 {id:"dashboard",label:"Dashboard",icon:"▦"},{id:"companies",label:"Empresas",icon:"▣"},{id:"employees",label:"Funcionários",icon:"◎"},{id:"schedules",label:"Escalas",icon:"◷"},{id:"locations",label:"Locais",icon:"⌖"},{id:"points",label:"Pontos",icon:"●"},{id:"occurrences",label:"Ocorrências",icon:"◇"},{id:"reports",label:"Relatórios",icon:"▤"},{id:"settings",label:"Configurações",icon:"⚙"},{id:"saas",label:"Admin SaaS",icon:"◆",superOnly:true}
];

export function App(){
 const [token,setToken]=useState(localStorage.getItem("pc_token")); const [user,setUser]=useState<any>(null); const [page,setPage]=useState<Page>((localStorage.getItem("pc_page") as Page)||"dashboard"); const [email,setEmail]=useState("admin@pontocerto.local"),[password,setPassword]=useState("Admin@123"),[error,setError]=useState(""),[toast,setToast]=useState<{m:string;t:"ok"|"error"}|null>(null),[logging,setLogging]=useState(false);
 function notify(m:string,t:"ok"|"error"="ok"){setToast({m,t});setTimeout(()=>setToast(null),3500)}
 useEffect(()=>{if(token)api.get("/auth/me").then(r=>setUser(r.data)).catch(()=>logout())},[token]);
 useEffect(()=>{if(user&&page==="saas"&&user.role!=="SUPER_ADMIN")go("dashboard")},[user]);
 async function login(e:React.FormEvent){e.preventDefault();setLogging(true);setError("");try{const {data}=await api.post("/auth/login",{email,password});localStorage.setItem("pc_token",data.token);setToken(data.token);setUser(data.user)}catch(err){setError(apiMessage(err,"E-mail ou senha inválidos."))}finally{setLogging(false)}}
 function logout(){localStorage.removeItem("pc_token");setToken(null);setUser(null)}
 function go(p:Page){setPage(p);localStorage.setItem("pc_page",p)}
 if(!token)return <main className="login-page"><div className="login-brand"><div className="brand-mark">PC</div><h1>Ponto Certo</h1><p>Gestão inteligente de jornada</p></div><form className="login-card" onSubmit={login}><div><h2>Bem-vindo</h2><p>Acesse o painel administrativo</p></div><label>E-mail<input autoFocus type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<div className="form-error">{error}</div>}<button className="primary login-button" disabled={logging}>{logging?"Entrando...":"Entrar"}</button><small>Ambiente SaaS multi-tenant</small></form></main>;
 const pages:any={dashboard:<DashboardPage/>,companies:<CompaniesPage notify={notify}/>,employees:<EmployeesPage notify={notify}/>,schedules:<SchedulesPage notify={notify}/>,locations:<LocationsPage notify={notify}/>,points:<PointsPage notify={notify}/>,occurrences:<OccurrencesPage notify={notify}/>,reports:<ReportsPage notify={notify}/>,settings:<SettingsPage notify={notify}/>,saas:<SaasPage notify={notify}/>};
 return <div className="app-shell"><aside className="sidebar"><div className="sidebar-brand"><div className="brand-mark small">PC</div><div><b>Ponto Certo</b><span>SaaS</span></div></div><nav>{nav.filter(n=>!n.superOnly||user?.role==="SUPER_ADMIN").map(n=><button key={n.id} className={page===n.id?"active":""} onClick={()=>go(n.id)}><span>{n.icon}</span>{n.label}</button>)}</nav><div className="sidebar-user"><div className="avatar">{(user?.name||"U").slice(0,1).toUpperCase()}</div><div><strong>{user?.name||"Usuário"}</strong><span>{user?.tenant_name||user?.role}</span></div></div><button className="logout" onClick={logout}>Sair</button></aside><main className="main-content"><div className="topbar"><div className="tenant-chip">{user?.tenant_name||"Ponto Certo"}</div><div className="top-user">{user?.email}</div></div><div className="page-content">{pages[page]}</div></main>{toast&&<div className={`toast ${toast.t}`}>{toast.m}</div>}</div>;
}
