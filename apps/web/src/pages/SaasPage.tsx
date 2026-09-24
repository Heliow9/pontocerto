import {
  InitialPageState,
  LoadState,
  useLoadState,
} from "../components/LoadState";
import { AsyncForm } from "../components/AsyncForm";
import { DataTable } from "../components/DataTable";
import { MaskedInput } from "../components/MaskedInput";
import { CepLookupInput } from "../components/CepLookupInput";
import { useEffect, useState } from "react";
import { api } from "../api";
import { Modal } from "../components/Modal";
import { Badge, Empty, PageHeader } from "../components/Ui";
import { apiMessage, brDate } from "../utils";

const emptyTenantForm = () => ({
  tenantName: "",
  slug: "",
  companyName: "",
  cnpj: "",
  adminName: "",
  adminEmail: "",
  adminPassword: "",
  planId: null as number | null,
  trialDays: 14,
  billingLegalName: "",
  billingTradeName: "",
  billingDocument: "",
  billingEmail: "",
  billingPhone: "",
  financialContactName: "",
  financialContactDocument: "",
  financialContactEmail: "",
  financialContactPhone: "",
  billingZipCode: "",
  billingStreet: "",
  billingNumber: "",
  billingComplement: "",
  billingDistrict: "",
  billingCity: "",
  billingState: "",
  autoEmailCharges: true,
});

export function SaasPage({
  notify,
}: {
  notify: (m: string, t?: "ok" | "error") => void;
}) {
  const [tenants, setTenants] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyTenantForm());
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
    if (
      new URLSearchParams((location.hash.split("?")[1] || "")).get("new") ===
      "1"
    )
      setOpen(true);
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/saas/tenants", {
        ...form,
        billingLegalName: form.billingLegalName || form.companyName,
        billingTradeName: form.billingTradeName || form.companyName,
        billingDocument: form.billingDocument || form.cnpj,
        planId: form.planId ? Number(form.planId) : null,
        trialDays: Number(form.trialDays),
      });
      notify("Novo tenant criado com administrador e perfil financeiro inicial.");
      setOpen(false);
      setForm(emptyTenantForm());
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
          [
            "Clientes ativos",
            tenants.filter((t) => t.status === "ACTIVE").length,
            "green",
          ],
          [
            "Suspensos",
            tenants.filter((t) => t.status === "SUSPENDED").length,
            "amber",
          ],
          [
            "Funcionários ativos",
            tenants.reduce(
              (sum, t) => sum + Number(t.employee_count || 0),
              0,
            ),
            "teal",
          ],
        ].map(([label, value, tone]) => (
          <article
            className={`commercial-metric metric-${tone}`}
            key={String(label)}
          >
            <div>
              <p>{label}</p>
              <strong>{value}</strong>
            </div>
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
                  <th>Financeiro</th>
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
                      <div className="finance-client-summary">
                        <strong>
                          {Number(t.blocking_charges) > 0
                            ? "Bloqueado"
                            : Number(t.overdue_amount) > 0
                              ? "Em atraso"
                              : "Regular"}
                        </strong>
                        <span>
                          Dia {t.due_day || 10} ·{" "}
                          {Number(t.overdue_amount || 0).toLocaleString(
                            "pt-BR",
                            { style: "currency", currency: "BRL" },
                          )}
                        </span>
                        {t.financial_contact_email && (
                          <span>{t.financial_contact_email}</span>
                        )}
                        {!Boolean(Number(t.financial_profile_complete)) && (
                          <Badge tone="warning">
                            Cadastro financeiro incompleto
                          </Badge>
                        )}
                        <a href={`#saas/finance-charges?tenant=${t.id}`}>
                          Ver financeiro
                        </a>
                      </div>
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
        <Modal
          title="Criar novo cliente SaaS"
          onClose={() => setOpen(false)}
          wide
        >
          <AsyncForm className="form-grid tenant-finance-form" onSubmit={create}>
            <div className="section-label span-2">Identificação</div>
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
              CNPJ da empresa
              <MaskedInput
                mask="cnpj"
                value={form.cnpj}
                onChange={(cnpj) => setForm({ ...form, cnpj })}
              />
            </label>

            <div className="section-label span-2">Plano e acesso inicial</div>
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
            <label>
              Administrador do cliente
              <input
                required
                value={form.adminName}
                onChange={(e) =>
                  setForm({ ...form, adminName: e.target.value })
                }
              />
            </label>
            <label>
              E-mail do administrador
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

            <div className="section-label span-2">Dados de faturamento</div>
            <label>
              Razão social
              <input
                value={form.billingLegalName}
                placeholder={form.companyName || "Razão social"}
                onChange={(e) =>
                  setForm({ ...form, billingLegalName: e.target.value })
                }
              />
            </label>
            <label>
              Nome fantasia
              <input
                value={form.billingTradeName}
                placeholder={form.companyName || "Nome fantasia"}
                onChange={(e) =>
                  setForm({ ...form, billingTradeName: e.target.value })
                }
              />
            </label>
            <label>
              CNPJ de faturamento
              <MaskedInput
                mask="cnpj"
                value={form.billingDocument}
                onChange={(billingDocument) =>
                  setForm({ ...form, billingDocument })
                }
              />
            </label>
            <label>
              E-mail de faturamento
              <input
                type="email"
                value={form.billingEmail}
                onChange={(e) =>
                  setForm({ ...form, billingEmail: e.target.value })
                }
              />
            </label>
            <label className="span-2">
              Telefone de faturamento
              <MaskedInput
                mask="phone"
                value={form.billingPhone}
                onChange={(billingPhone) => setForm({ ...form, billingPhone })}
              />
            </label>

            <div className="section-label span-2">Responsável financeiro</div>
            <label>
              Nome do responsável
              <input
                value={form.financialContactName}
                onChange={(e) =>
                  setForm({ ...form, financialContactName: e.target.value })
                }
              />
            </label>
            <label>
              CPF do responsável
              <MaskedInput
                mask="cpf"
                value={form.financialContactDocument}
                onChange={(financialContactDocument) =>
                  setForm({ ...form, financialContactDocument })
                }
              />
            </label>
            <label>
              E-mail financeiro
              <input
                type="email"
                value={form.financialContactEmail}
                onChange={(e) =>
                  setForm({ ...form, financialContactEmail: e.target.value })
                }
              />
            </label>
            <label>
              Telefone / WhatsApp
              <MaskedInput
                mask="phone"
                value={form.financialContactPhone}
                onChange={(financialContactPhone) =>
                  setForm({ ...form, financialContactPhone })
                }
              />
            </label>

            <div className="section-label span-2">Endereço de faturamento</div>
            <label>
              CEP
              <CepLookupInput
                value={form.billingZipCode}
                onChange={(billingZipCode) => setForm((current: any) => ({ ...current, billingZipCode }))}
                onAddressFound={(address) => setForm((current: any) => ({
                  ...current,
                  billingZipCode: address.zipCode,
                  billingStreet: address.street,
                  billingComplement: address.complement,
                  billingDistrict: address.district,
                  billingCity: address.city,
                  billingState: address.state,
                  billingNumber: "",
                }))}
              />
            </label>
            <label>
              Logradouro
              <input
                value={form.billingStreet}
                onChange={(e) =>
                  setForm({ ...form, billingStreet: e.target.value })
                }
              />
            </label>
            <label>
              Número
              <input
                value={form.billingNumber}
                onChange={(e) =>
                  setForm({ ...form, billingNumber: e.target.value })
                }
              />
            </label>
            <label>
              Complemento
              <input
                value={form.billingComplement}
                onChange={(e) =>
                  setForm({ ...form, billingComplement: e.target.value })
                }
              />
            </label>
            <label>
              Bairro
              <input
                value={form.billingDistrict}
                onChange={(e) =>
                  setForm({ ...form, billingDistrict: e.target.value })
                }
              />
            </label>
            <label>
              Cidade
              <input
                value={form.billingCity}
                onChange={(e) =>
                  setForm({ ...form, billingCity: e.target.value })
                }
              />
            </label>
            <label>
              UF
              <input
                maxLength={2}
                value={form.billingState}
                onChange={(e) =>
                  setForm({
                    ...form,
                    billingState: e.target.value
                      .replace(/[^a-zA-Z]/g, "")
                      .toUpperCase(),
                  })
                }
              />
            </label>

            <div className="section-label span-2">Preferências de cobrança</div>
            <label className="finance-check span-2">
              <input
                type="checkbox"
                checked={form.autoEmailCharges}
                onChange={(e) =>
                  setForm({ ...form, autoEmailCharges: e.target.checked })
                }
              />
              Enviar cobranças automaticamente por e-mail
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
