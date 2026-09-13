import {
  InitialPageState,
  LoadState,
  useLoadState,
} from "../components/LoadState";
import { AsyncForm } from "../components/AsyncForm";
import { DataTable } from "../components/DataTable";
import { useEffect, useState } from "react";
import { api } from "../api";
import { Modal } from "../components/Modal";
import { Badge, Empty, PageHeader } from "../components/Ui";
import { apiMessage, brDate } from "../utils";

export function SaasPage({
  notify,
}: {
  notify: (m: string, t?: "ok" | "error") => void;
}) {
  const [tenants, setTenants] = useState<any[]>([]),
    [plans, setPlans] = useState<any[]>([]),
    [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    tenantName: "",
    slug: "",
    companyName: "",
    cnpj: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
    planId: null,
    trialDays: 14,
  });
  const loadState = useLoadState();
  const fetchData = () =>
    Promise.all([api.get("/saas/tenants"), api.get("/saas/plans")]).then(
      ([a, b]) => {
        setTenants(a.data);
        setPlans(b.data);
      },
    );
  const load = () => loadState.run(fetchData);
  useEffect(() => {
    load();
  }, []);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/saas/tenants", {
        ...form,
        planId: form.planId ? Number(form.planId) : null,
        trialDays: Number(form.trialDays),
      });
      notify("Novo tenant criado com administrador inicial.");
      setOpen(false);
      setForm({
        ...form,
        tenantName: "",
        slug: "",
        companyName: "",
        cnpj: "",
        adminName: "",
        adminEmail: "",
        adminPassword: "",
      });
      load();
    } catch (err) {
      notify(apiMessage(err), "error");
    }
  }
  async function status(id: number, value: string) {
    try {
      await api.patch(`/saas/tenants/${id}/status`, { status: value });
      notify("Status do tenant atualizado.");
      load();
    } catch (err) {
      notify(apiMessage(err), "error");
    }
  }
  if (!loadState.ready)
    return (
      <InitialPageState
        title="Clientes / Empresas"
        subtitle="Cadastre e acompanhe os clientes SaaS, empresas vinculadas, capacidade e status comercial."
        state={loadState}
        retry={load}
      />
    );
  return (
    <>
      <LoadState state={loadState} retry={load} />
      <PageHeader
        title="Clientes / Empresas"
        subtitle="Cadastre e acompanhe os clientes SaaS, empresas vinculadas, capacidade e status comercial."
        action={
          <button className="primary" onClick={() => setOpen(true)}>
            + Novo cliente
          </button>
        }
      />
      <section className="commercial-metrics client-metrics">
        {[
          ["Total de clientes", tenants.length, "blue"],
          ["Clientes ativos", tenants.filter((t) => t.status === "ACTIVE").length, "green"],
          ["Suspensos", tenants.filter((t) => t.status === "SUSPENDED").length, "amber"],
          ["Funcionários ativos", tenants.reduce((sum, t) => sum + Number(t.employee_count || 0), 0), "teal"],
        ].map(([label, value, tone]) => (
          <article className={`commercial-metric metric-${tone}`} key={String(label)}>
            <div><p>{label}</p><strong>{value}</strong></div>
          </article>
        ))}
      </section>
      <div className="panel table-panel">
        {tenants.length === 0 ? (
          <Empty>Nenhum tenant cadastrado.</Empty>
        ) : (
          <div className="table-wrap">
            <DataTable>
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Plano</th>
                  <th>Empresas</th>
                  <th>Funcionários</th>
                  <th>Criado em</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.name}</strong>
                      <div className="muted">{t.slug}</div>
                    </td>
                    <td>{t.plan_name || "Sem plano"}</td>
                    <td>{t.company_count}</td>
                    <td>{t.employee_count}</td>
                    <td>{brDate(t.created_at)}</td>
                    <td>
                      <Badge
                        tone={
                          t.status === "ACTIVE"
                            ? "success"
                            : t.status === "SUSPENDED"
                              ? "warning"
                              : "danger"
                        }
                      >
                        {t.status}
                      </Badge>
                    </td>
                    <td>
                      <select
                        className="compact-select"
                        value={t.status}
                        onChange={(e) => status(t.id, e.target.value)}
                      >
                        <option value="ACTIVE">Ativo</option>
                        <option value="SUSPENDED">Suspenso</option>
                        <option value="CANCELED">Cancelado</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}
      </div>
      {open && (
        <Modal title="Criar novo cliente SaaS" onClose={() => setOpen(false)} wide>
          <AsyncForm className="form-grid" onSubmit={create}>
            <div className="section-label span-2">Cliente SaaS</div>
            <label>
              Nome do tenant
              <input
                required
                value={form.tenantName}
                onChange={(e) =>
                  setForm({ ...form, tenantName: e.target.value })
                }
              />
            </label>
            <label>
              Slug
              <input
                required
                pattern="[a-z0-9-]+"
                value={form.slug}
                onChange={(e) =>
                  setForm({
                    ...form,
                    slug: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, "-"),
                  })
                }
              />
            </label>
            <label>
              Empresa inicial
              <input
                required
                value={form.companyName}
                onChange={(e) =>
                  setForm({ ...form, companyName: e.target.value })
                }
              />
            </label>
            <label>
              CNPJ
              <input
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
              />
            </label>
            <label>
              Plano
              <select
                value={form.planId || ""}
                onChange={(e) =>
                  setForm({ ...form, planId: e.target.value || null })
                }
              >
                <option value="">Sem plano</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Dias de teste
              <input
                type="number"
                min={0}
                value={form.trialDays}
                onChange={(e) =>
                  setForm({ ...form, trialDays: Number(e.target.value) })
                }
              />
            </label>
            <div className="section-label span-2">Administrador do cliente</div>
            <label>
              Nome
              <input
                required
                value={form.adminName}
                onChange={(e) =>
                  setForm({ ...form, adminName: e.target.value })
                }
              />
            </label>
            <label>
              E-mail
              <input
                type="email"
                required
                value={form.adminEmail}
                onChange={(e) =>
                  setForm({ ...form, adminEmail: e.target.value })
                }
              />
            </label>
            <label className="span-2">
              Senha inicial
              <input
                type="password"
                minLength={6}
                required
                value={form.adminPassword}
                onChange={(e) =>
                  setForm({ ...form, adminPassword: e.target.value })
                }
              />
            </label>
            <div className="form-actions span-2">
              <button
                type="button"
                className="ghost"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
              <button className="primary">Criar tenant</button>
            </div>
          </AsyncForm>
        </Modal>
      )}
    </>
  );
}
