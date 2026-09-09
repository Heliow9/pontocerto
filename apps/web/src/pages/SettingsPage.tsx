import { useAccess } from "../components/Access";
import { LoadState, useLoadState } from "../components/LoadState";
import { AsyncForm } from "../components/AsyncForm";
import { useEffect, useState } from "react";
import { api } from "../api";
import { Company } from "../types";
import { Empty, PageHeader } from "../components/Ui";
import { apiMessage, brDate, localIsoDate } from "../utils";

export function SettingsPage({
  notify,
}: {
  notify: (m: string, t?: "ok" | "error") => void;
}) {
  const { role } = useAccess();
  const canConfigure = ["SUPER_ADMIN", "TENANT_ADMIN"].includes(role);
  const [holidaySearch, setHolidaySearch] = useState("");
  const [holidayLimit, setHolidayLimit] = useState(20);
  const [settings, setSettings] = useState<any>(null),
    [companies, setCompanies] = useState<Company[]>([]),
    [holidays, setHolidays] = useState<any[]>([]),
    [holiday, setHoliday] = useState<any>({
      companyId: null,
      holidayDate: localIsoDate(),
      name: "",
      scope: "COMPANY",
    });
  const loadState = useLoadState();
  const fetchData = () =>
    Promise.all([
      api.get("/settings"),
      api.get("/companies"),
      api.get("/holidays"),
    ]).then(([a, b, c]) => {
      setSettings(a.data);
      setCompanies(b.data);
      setHolidays(c.data);
    });
  const load = () => loadState.run(fetchData);
  useEffect(() => {
    load();
  }, []);
  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.put("/settings", {
        name: settings.name,
        reportTitle: settings.report_title || "Relatório de Pontos",
        reportFooter: settings.report_footer || "",
        timezone: settings.timezone || "America/Sao_Paulo",
      });
      notify("Configurações salvas.");
      load();
    } catch (err) {
      notify(apiMessage(err), "error");
    }
  }
  async function addHoliday(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/holidays", {
        ...holiday,
        companyId: holiday.companyId ? Number(holiday.companyId) : null,
      });
      notify("Feriado cadastrado.");
      setHoliday({ ...holiday, name: "" });
      load();
    } catch (err) {
      notify(apiMessage(err), "error");
    }
  }
  async function del(id: number) {
    if (!confirm("Excluir feriado?")) return;
    try {
      await api.delete(`/holidays/${id}`);
      await load();
    } catch (e) {
      notify(apiMessage(e), "error");
    }
  }
  if (!settings)
    return (
      <>
        <LoadState state={loadState} retry={load} />
        <PageHeader title="Configurações" />
      </>
    );
  return (
    <>
      <PageHeader
        title="Configurações"
        subtitle="Identidade da organização, relatório e feriados"
      />
      <LoadState state={loadState} retry={load} />
      <div className="settings-grid">
        <AsyncForm className="panel form-grid" onSubmit={saveSettings}>
          <div className="section-label span-2">Organização e relatório</div>
          <label className="span-2">
            Nome da organização
            <input
              disabled={!canConfigure}
              value={settings.name || ""}
              onChange={(e) =>
                setSettings({ ...settings, name: e.target.value })
              }
            />
          </label>
          <label className="span-2">
            Título do relatório
            <input
              disabled={!canConfigure}
              value={settings.report_title || ""}
              onChange={(e) =>
                setSettings({ ...settings, report_title: e.target.value })
              }
            />
          </label>
          <label className="span-2">
            Rodapé do relatório
            <input
              disabled={!canConfigure}
              value={settings.report_footer || ""}
              onChange={(e) =>
                setSettings({ ...settings, report_footer: e.target.value })
              }
            />
          </label>
          <label className="span-2">
            Fuso horário
            <input
              disabled={!canConfigure}
              value={settings.timezone || "America/Sao_Paulo"}
              onChange={(e) =>
                setSettings({ ...settings, timezone: e.target.value })
              }
            />
          </label>
          <div className="form-actions span-2">
            {canConfigure && (
              <button className="primary">Salvar configurações</button>
            )}
          </div>
        </AsyncForm>
        <div className="panel">
          <div className="section-label">Feriados</div>
          <AsyncForm className="holiday-form" onSubmit={addHoliday}>
            <select
              aria-label="Empresa do feriado"
              value={holiday.companyId || ""}
              onChange={(e) =>
                setHoliday({ ...holiday, companyId: e.target.value || null })
              }
            >
              <option value="">Todas as empresas</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.trade_name || c.legal_name}
                </option>
              ))}
            </select>
            <input
              aria-label="Data do feriado"
              type="date"
              value={holiday.holidayDate}
              onChange={(e) =>
                setHoliday({ ...holiday, holidayDate: e.target.value })
              }
            />
            <input
              placeholder="Nome do feriado"
              required
              value={holiday.name}
              onChange={(e) => setHoliday({ ...holiday, name: e.target.value })}
            />
            <select
              aria-label="Abrangência do feriado"
              value={holiday.scope}
              onChange={(e) =>
                setHoliday({ ...holiday, scope: e.target.value })
              }
            >
              <option value="NATIONAL">Nacional</option>
              <option value="STATE">Estadual</option>
              <option value="MUNICIPAL">Municipal</option>
              <option value="COMPANY">Empresa</option>
            </select>
            <button className="secondary">Adicionar</button>
          </AsyncForm>
          <label>
            Buscar feriados
            <input
              value={holidaySearch}
              onChange={(e) => {
                setHolidaySearch(e.target.value);
                setHolidayLimit(20);
              }}
              placeholder="Nome ou data"
            />
          </label>
          <div className="holiday-list">
            {holidays.length === 0 ? (
              <Empty>Nenhum feriado cadastrado.</Empty>
            ) : (
              holidays
                .filter((h) =>
                  `${h.name} ${brDate(h.holiday_date)}`
                    .toLowerCase()
                    .includes(holidaySearch.toLowerCase()),
                )
                .slice(0, holidayLimit)
                .map((h) => (
                  <div className="holiday-row" key={h.id}>
                    <div>
                      <strong>{h.name}</strong>
                      <span>
                        {brDate(h.holiday_date)} ·{" "}
                        {h.company_name || "Todas as empresas"}
                      </span>
                    </div>
                    <button className="danger-link" onClick={() => del(h.id)}>
                      Excluir
                    </button>
                  </div>
                ))
            )}
          </div>
          {holidayLimit < holidays.length && (
            <button
              className="ghost"
              onClick={() => setHolidayLimit(holidayLimit + 20)}
            >
              Mostrar mais feriados
            </button>
          )}
        </div>
      </div>
    </>
  );
}
