import { PwaNotice } from "./components/PwaNotice";
import { lazy, Suspense, useEffect, useState } from "react";
import { api } from "./api";
import { PageHeader } from "./components/Ui";
import { PageSkeleton } from "./components/PageSkeleton";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";
import { apiMessage } from "./utils";

import { useRef } from "react";
import { Modal } from "./components/Modal";
import { AccessProvider } from "./components/Access";
import { Icon } from "./components/Icon";
import { WorkspaceTools } from "./components/WorkspaceTools";

const SaasPortal = lazy(() => import("./pages/SaasPortal"));

type Page =
  | "team"
  | "audit"
  | "dashboard"
  | "companies"
  | "employees"
  | "schedules"
  | "locations"
  | "points"
  | "occurrences"
  | "reports"
  | "settings"
  | "saas"
  | "adjustments"
  | "password";
const loaders = {
  team: () => import("./pages/TeamPage").then(m=>({default:m.TeamPage})),
  audit: () => import("./pages/AuditPage").then(m=>({default:m.AuditPage})),
  password: () =>
    import("./pages/PasswordPage").then((m) => ({ default: m.PasswordPage })),
  dashboard: () =>
    import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
  companies: () =>
    import("./pages/CompaniesPage").then((m) => ({ default: m.CompaniesPage })),
  employees: () =>
    import("./pages/EmployeesPage").then((m) => ({ default: m.EmployeesPage })),
  schedules: () =>
    import("./pages/SchedulesPage").then((m) => ({ default: m.SchedulesPage })),
  locations: () =>
    import("./pages/LocationsPage").then((m) => ({ default: m.LocationsPage })),
  points: () =>
    import("./pages/PointsPage").then((m) => ({ default: m.PointsPage })),
  occurrences: () =>
    import("./pages/OccurrencesPage").then((m) => ({
      default: m.OccurrencesPage,
    })),
  reports: () =>
    import("./pages/ReportsPage").then((m) => ({ default: m.ReportsPage })),
  settings: () =>
    import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
  saas: () => import("./pages/SaasPage").then((m) => ({ default: m.SaasPage })),
  adjustments: () =>
    import("./pages/AdjustmentsPage").then((m) => ({
      default: m.AdjustmentsPage,
    })),
};
const TeamPage = lazy(loaders.team), AuditPage = lazy(loaders.audit), PasswordPage = lazy(loaders.password),
  DashboardPage = lazy(loaders.dashboard),
  CompaniesPage = lazy(loaders.companies),
  EmployeesPage = lazy(loaders.employees),
  SchedulesPage = lazy(loaders.schedules),
  LocationsPage = lazy(loaders.locations),
  PointsPage = lazy(loaders.points),
  OccurrencesPage = lazy(loaders.occurrences),
  ReportsPage = lazy(loaders.reports),
  SettingsPage = lazy(loaders.settings),
  SaasPage = lazy(loaders.saas),
  AdjustmentsPage = lazy(loaders.adjustments);
function preload(page: Page) {
  void loaders[page]().catch(() => {});
}
const nav: { id: Page; label: string; group: string }[] = [
  {id:"team",label:"Supervisores",group:"Administração"},
  {id:"audit",label:"Auditoria",group:"Administração"},
  { id: "password", label: "Alterar senha", group: "Minha conta" },
  { id: "dashboard", label: "Visão geral", group: "Operação" },
  { id: "points", label: "Marcações", group: "Operação" },
  { id: "adjustments", label: "Solicitações de ajuste", group: "Operação" },
  { id: "occurrences", label: "Ocorrências", group: "Operação" },
  { id: "reports", label: "Relatórios", group: "Operação" },
  { id: "employees", label: "Funcionários", group: "Cadastros" },
  { id: "schedules", label: "Escalas e jornadas", group: "Cadastros" },
  { id: "locations", label: "Locais de trabalho", group: "Cadastros" },
  { id: "companies", label: "Empresas", group: "Cadastros" },
  { id: "settings", label: "Configurações", group: "Administração" },
  { id: "saas", label: "Administração SaaS", group: "Administração" },
];
function readPage(hash: string): Page {
  const value = hash.slice(1).split("?")[0];
  return nav.some((n) => n.id === value) ? (value as Page) : "dashboard";
}
export function App() {
  const [token, setToken] = useState(localStorage.getItem("pc_token")),
    [user, setUser] = useState<any>(null),
    [menu, setMenu] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [showPassword, setShowPassword] = useState(false),
    [help, setHelp] = useState(false),
    [error, setError] = useState(""),
    [sessionError, setSessionError] = useState(""),
    [logging, setLogging] = useState(false),
    [toast, setToast] = useState<{ m: string; t: "ok" | "error" } | null>(null),
    [online, setOnline] = useState(navigator.onLine);
  const [route, setRoute] = useState(location.hash);
  const page = readPage(route);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function notify(m: string, t: "ok" | "error" = "ok") {
    clearTimeout(timer.current);
    setToast({ m, t });
    if (t === "ok") timer.current = setTimeout(() => setToast(null), 6000);
  }
  function logout() {
    localStorage.removeItem("pc_token");
    setToken(null);
    setUser(null);
    setSessionError("");
    setPassword("");
    setMenu(false);
  }
  async function restore() {
    setSessionError("");
    try {
      const { data } = await api.get("/auth/me");
      if (!data) {
        logout();
        return;
      }
      setUser(data);
    } catch (e: any) {
      if (e?.response?.status === 401) logout();
      else
        setSessionError(
          "Não foi possível verificar a sessão. Seus dados de acesso foram preservados.",
        );
    }
  }
  useEffect(() => {
    if (token) void restore();
  }, [token]);
  useEffect(() => {
    const hash = () => {
      setRoute(location.hash);
      setMenu(false);
      window.scrollTo(0, 0);
    };
    const connection = () => setOnline(navigator.onLine);
    const expired = () => {
      logout();
      setError("Sua sessão expirou. Entre novamente.");
    };
    window.addEventListener("hashchange", hash);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    window.addEventListener("pc:unauthorized", expired);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener("hashchange", hash);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      window.removeEventListener("pc:unauthorized", expired);
    };
  }, []);
  function go(p: Page) {
    location.hash = p;
    setMenu(false);
  }
  const canAdmin = ["SUPER_ADMIN", "TENANT_ADMIN", "RH"].includes(user?.role);
  const visible = nav.filter(
    (n) =>
      (n.id !== "saas" || user?.role === "SUPER_ADMIN") &&
      (n.id !== "settings" || canAdmin) &&
      (n.id !== "team" || user?.role === "TENANT_ADMIN") &&
      (n.id !== "audit" || ["TENANT_ADMIN","RH","SUPERVISOR"].includes(user?.role)) &&
      (user?.role !== "SUPERVISOR" || !user.permissions || n.id === "password" || ["read","write"].includes(user.permissions[n.id === "audit" ? "logs" : n.id])),
  );
  useEffect(() => {
    if (user && user.role !== "SUPER_ADMIN" && !visible.some((n) => n.id === page)) go(visible[0]?.id || "password");
  }, [user, page]);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (logging) return;
    setLogging(true);
    setError("");
    try {
      const { data } = await api.post("/auth/login", {
        email: email.trim(),
        password,
      });
      if (data.user.role === "FUNCIONARIO") {
        setError(
          "Este acesso é do funcionário. Abra o aplicativo Ponto Certo para registrar sua jornada.",
        );
        return;
      }
      localStorage.setItem("pc_token", data.token);
      setToken(data.token);
      setPassword("");
    } catch (err) {
      setError(
        apiMessage(
          err,
          "Não foi possível entrar. Verifique a conexão e os dados de acesso.",
        ),
      );
    } finally {
      setLogging(false);
    }
  }
  if (!token)
    return (
      <main className="login-page">
        <div className="login-brand">
          <img
            className="brand-logo"
            src="/brand/logo.png"
            alt="PontoCerto — Sistema de gestão de ponto"
          />
          <h1>
            Jornadas organizadas.
            <br />
            Gestão mais simples.
          </h1>
          <p>
            Acompanhe sua equipe, resolva pendências e consulte os registros em
            um só lugar.
          </p>
        </div>
        <form className="login-card" onSubmit={login}>
          <div>
            <span className="eyebrow">PONTO CERTO · GESTÃO</span>
            <h2>Bem-vindo de volta</h2>
            <p>Entre com seu acesso administrativo.</p>
          </div>
          <label>
            E-mail
            <input
              required
              autoComplete="username"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Senha
            <input
              required
              autoComplete="current-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="text-button"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? "Ocultar senha" : "Mostrar senha"}
          </button>
          {error && (
            <div role="alert" className="form-error">
              {error}
            </div>
          )}
          <button
            className="primary login-button"
            disabled={logging || !online}
          >
            {logging ? "Entrando…" : !online ? "Sem conexão" : "Entrar"}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => setHelp(true)}
          >
            Preciso recuperar meu acesso
          </button>
          {help && (
            <div role="status" className="info-box">
              Solicite ao RH ou ao administrador da sua organização a
              redefinição da senha. Informe seu e-mail de acesso; nunca envie
              sua senha.
            </div>
          )}
        </form>
      </main>
    );
  if (!user)
    return (
      <main className="session-state">
        <img
          className="brand-logo"
          src="/brand/logo.png"
          alt="PontoCerto — Sistema de gestão de ponto"
        />
        <h1>Preparando seu painel</h1>
        {sessionError ? (
          <div role="alert">
            <p>{sessionError}</p>
            <button className="primary" onClick={restore}>
              Tentar novamente
            </button>{" "}
            <button className="ghost" onClick={logout}>
              Voltar ao acesso
            </button>
          </div>
        ) : (
          <p role="status">
            <span className="loading-spinner" aria-hidden="true" />
            Verificando sua sessão…
          </p>
        )}
      </main>
    );
  if (user.role === "FUNCIONARIO")
    return (
      <main className="session-state">
        <h1>Acesso do funcionário</h1>
        <p>
          Abra o aplicativo Ponto Certo para registrar e consultar sua jornada.
        </p>
        <button className="primary" onClick={logout}>
          Voltar ao acesso
        </button>
      </main>
    );
  if (user.role === "SUPER_ADMIN") return <RouteErrorBoundary><Suspense fallback={<PageSkeleton/>}><SaasPortal logout={logout}/></Suspense></RouteErrorBoundary>;
  const pages: Record<Page, React.ReactNode> = {
    team: <TeamPage/>,
    audit: <AuditPage/>,
    password: <PasswordPage />,
    dashboard: <DashboardPage />,
    companies: <CompaniesPage notify={notify} />,
    employees: <EmployeesPage notify={notify} />,
    schedules: <SchedulesPage notify={notify} />,
    locations: <LocationsPage notify={notify} />,
    points: <PointsPage notify={notify} />,
    occurrences: <OccurrencesPage notify={notify} />,
    reports: <ReportsPage notify={notify} />,
    settings: <SettingsPage notify={notify} />,
    saas: <SaasPage notify={notify} />,
    adjustments: <AdjustmentsPage notify={notify} />,
  };
  const navigation = (
    <nav aria-label="Navegação principal">
      {["Operação", "Cadastros", "Administração", "Minha conta"].map(
        (group) => (
          <div className="nav-group" key={group}>
            <span className="nav-heading">{group}</span>
            {visible
              .filter((n) => n.group === group)
              .map((n) => (
                <a
                  key={n.id}
                  href={`#${n.id}`}
                  aria-current={page === n.id ? "page" : undefined}
                  className={page === n.id ? "active" : ""}
                  onClick={() => go(n.id)}
                  onPointerEnter={() => preload(n.id)}
                  onFocus={() => preload(n.id)}
                >
                  <Icon name={n.id} size={18} />
                  {n.label}
                </a>
              ))}
          </div>
        ),
      )}
    </nav>
  );
  return (
    <AccessProvider role={user.role} permissions={user.permissions} page={page}>
      <div className="app-shell">
        <a className="skip-link" href="#main-content">
          Ir para o conteúdo
        </a>
        <aside className="sidebar">
          <div className="sidebar-brand">
            <img
              className="brand-logo sidebar-logo"
              src="/brand/logo.png"
              alt="PontoCerto — Gestão de jornada"
            />
          </div>
          {navigation}
          <div className="sidebar-user">
            <div className="avatar">{user.name.slice(0, 1)}</div>
            <div>
              <strong>{user.name}</strong>
              <span>{user.tenant_name}</span>
            </div>
          </div>
          <button className="logout" onClick={logout}>
            Sair da conta
          </button>
        </aside>
        <main className="main-content" id="main-content" tabIndex={-1}>
          <header className="topbar">
            <button
              className="ghost mobile-menu"
              aria-label="Abrir menu"
              aria-expanded={menu}
              onClick={() => setMenu(true)}
            >
              ☰ Menu
            </button>
            <img
              className="header-brand"
              src="/icons/icon-192.png"
              alt="PontoCerto"
            />
            <span className="tenant-chip">{user.tenant_name}</span>
            <WorkspaceTools page={page} links={visible} />
            <span className="top-user">{user.name}</span>
          </header>
          <PwaNotice />
          {!online && (
            <div className="connection-banner" role="status">
              Sem conexão. Os dados exibidos podem estar desatualizados.
            </div>
          )}
          <div className="page-content" key={route}>
            <RouteErrorBoundary>
              <Suspense
                fallback={
                  <>
                    <PageHeader
                      title={nav.find((n) => n.id === page)?.label || "Painel"}
                    />
                    <PageSkeleton
                      variant={page === "dashboard" ? "dashboard" : "table"}
                    />
                  </>
                }
              >
                {visible.some((n) => n.id === page) ? pages[page] : null}
              </Suspense>
            </RouteErrorBoundary>
          </div>
        </main>
        {menu && (
          <Modal title="Menu" onClose={() => setMenu(false)}>
            {navigation}
            <button className="ghost" onClick={logout}>
              Sair da conta
            </button>
          </Modal>
        )}
        {toast && (
          <div
            className={`toast ${toast.t}`}
            role={toast.t === "error" ? "alert" : "status"}
          >
            {toast.m}
            <button aria-label="Fechar aviso" onClick={() => setToast(null)}>
              ×
            </button>
          </div>
        )}
      </div>
    </AccessProvider>
  );
}
