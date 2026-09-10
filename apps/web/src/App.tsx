import { PasswordPage } from "./pages/PasswordPage";
import { PwaNotice } from "./components/PwaNotice";
import { AdjustmentsPage } from "./pages/AdjustmentsPage";
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

import { useRef } from "react";
import { Modal } from "./components/Modal";
import { AccessProvider } from "./components/Access";
import { Icon } from "./components/Icon";
import { WorkspaceTools } from "./components/WorkspaceTools";

type Page =
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
const nav: { id: Page; label: string; group: string }[] = [
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
function readPage(): Page {
  const value = location.hash.slice(1).split("?")[0];
  return nav.some((n) => n.id === value) ? (value as Page) : "dashboard";
}
export function App() {
  const [token, setToken] = useState(localStorage.getItem("pc_token")),
    [user, setUser] = useState<any>(null),
    [page, setPage] = useState<Page>(readPage),
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
      setPage(readPage());
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
    setPage(p);
    setMenu(false);
  }
  const canAdmin = ["SUPER_ADMIN", "TENANT_ADMIN", "RH"].includes(user?.role);
  const visible = nav.filter(
    (n) =>
      (n.id !== "saas" || user?.role === "SUPER_ADMIN") &&
      (n.id !== "settings" || canAdmin),
  );
  useEffect(() => {
    if (user && !visible.some((n) => n.id === page)) go("dashboard");
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
          <p role="status">Verificando sua sessão…</p>
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
  const pages: Record<Page, React.ReactNode> = {
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
    <AccessProvider role={user.role}>
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
            {visible.some((n) => n.id === page) ? pages[page] : null}
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
