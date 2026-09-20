import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  return (
    <span className={`badge badge-${tone}`}>
      {typeof children === "string"
        ? statusLabels[children] || children
        : children}
    </span>
  );
}

export function Loader() {
  return <div className="loader-line">Carregando...</div>;
}

const statusLabels: Record<string, string> = {
  ALLOWED: "Permitido",
  BLOCKED: "Bloqueado",
  WARNED: "Com alerta",
  WARN: "Permitir com alerta",
  BLOCK: "Bloquear fora da área",
  DISABLED: "Desativado",
  APPROVED: "Aprovado",
  PENDING: "Pendente",
  REJECTED: "Rejeitado",
  ACTIVE: "Ativo",
  SUSPENDED: "Suspenso",
  CANCELED: "Cancelado",
  MOBILE: "Aplicativo",
  WEB: "Navegador",
  MANUAL: "Manual",
  NOT_REQUIRED: "Não exigido",
};
