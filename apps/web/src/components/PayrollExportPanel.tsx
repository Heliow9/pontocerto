import { useEffect, useState } from "react";
import { api } from "../api";
import {
  apiMessage,
  brDate,
  localIsoDate,
  minutesToHHMM,
  monthRange,
} from "../utils";

type EventKey = "normal" | "overtime" | "late" | "absence";
type Format = "DOMINIO" | "SAGE" | "QUESTOR" | "CSV";
type Profile = {
  companyCode: string;
  processCode: string;
  hourFormat: "HHMM" | "DECIMAL";
  events: Record<EventKey, string>;
  employeeCodes: Record<string, string>;
};
type Employee = {
  id: number;
  company_id: number;
  name: string;
  registration_number: string | null;
  work_schedule_id: number | null;
};
type Options = {
  companies: { id: number; legal_name: string }[];
  employees: Employee[];
  formats: {
    id: Format;
    name: string;
    instructions: string;
    source: string | null;
  }[];
  events: { key: EventKey; label: string }[];
};
type ExportResult = {
  filename: string;
  content: string;
  mimeType: string;
  generatedAt: string;
  companyName: string;
  selectedCount: number;
  exportedCount: number;
  warnings: string[];
  instructions: string;
  rows: {
    employeeId: number;
    employeeName: string;
    employeeCode: string;
    event: EventKey;
    label: string;
    eventCode: string;
    minutes: number;
  }[];
};
const emptyProfile = (): Profile => ({
  companyCode: "",
  processCode: "11",
  hourFormat: "HHMM",
  events: { normal: "", overtime: "", late: "", absence: "" },
  employeeCodes: {},
});
function initialPeriod() {
  const today = localIsoDate();
  const [year, month] = today.split("-").map(Number);
  return monthRange(new Date(Date.UTC(year, month - 1, 0, 12)));
}

export function PayrollExportPanel({
  notify,
}: {
  notify: (message: string, type?: "ok" | "error") => void;
}) {
  const range = initialPeriod();
  const [options, setOptions] = useState<Options | null>(null);
  const [companyId, setCompanyId] = useState("");
  const [format, setFormat] = useState<Format>("DOMINIO");
  const [start, setStart] = useState(range.start),
    [end, setEnd] = useState(range.end);
  const [competence, setCompetence] = useState(range.start.slice(0, 7));
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [profileReady, setProfileReady] = useState("");
  const [busy, setBusy] = useState<"save" | "generate" | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<ExportResult | null>(null);
  const key = `${companyId}:${format}`;

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    api
      .get<Options>("/reports/payroll/options", { signal: controller.signal })
      .then(({ data }) => {
        setOptions(data);
        setCompanyId((current) =>
          data.companies.some((c) => String(c.id) === current)
            ? current
            : String(data.companies[0]?.id || ""),
        );
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(apiMessage(err));
      });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    const controller = new AbortController();
    setProfileReady("");
    setProfile(emptyProfile());
    setResult(null);
    if (companyId) {
      setError("");
      api
        .get<{ profile: Profile | null }>(
          `/reports/payroll/profiles/${companyId}/${format}`,
          { signal: controller.signal },
        )
        .then(({ data }) => {
          setProfile(data.profile || emptyProfile());
          setProfileReady(key);
        })
        .catch((err) => {
          if (!controller.signal.aborted) setError(apiMessage(err));
        });
    }
    return () => controller.abort();
  }, [companyId, format, reload]);
  useEffect(() => {
    setResult(null);
  }, [companyId, format, start, end, competence, selected, profile]);

  const employees =
    options?.employees.filter((e) => e.company_id === Number(companyId)) || [];
  const visible = employees.filter((e) =>
    `${e.name} ${e.registration_number || ""}`
      .toLocaleLowerCase("pt-BR")
      .includes(search.toLocaleLowerCase("pt-BR")),
  );
  const layout = options?.formats.find((f) => f.id === format);
  const ready = Boolean(companyId && options && profileReady === key);
  function toggle(id: number) {
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
    );
  }
  async function save() {
    setBusy("save");
    setError("");
    try {
      await api.put(
        `/reports/payroll/profiles/${companyId}/${format}`,
        profile,
      );
      notify("Configuração salva para esta empresa e ERP.");
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setBusy(null);
    }
  }
  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setResult(null);
    setError("");
    if (!selected.length) {
      setError("Selecione pelo menos um funcionário.");
      return;
    }
    if (!start || !end || start > end || !competence) {
      setError("Confira o período e a competência.");
      return;
    }
    setBusy("generate");
    try {
      const { data } = await api.post<ExportResult>(
        "/reports/payroll/generate",
        {
          companyId: Number(companyId),
          format,
          start,
          end,
          competence,
          employeeIds: selected,
          profile,
        },
        { timeout: 120000 },
      );
      setResult(data);
      notify("Arquivo preparado. Confira os eventos antes de baixar.");
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setBusy(null);
    }
  }
  function download() {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([result.content], { type: result.mimeType }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = result.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(
      "Arquivo baixado. Use as orientações de importação do ERP selecionado.",
    );
  }
  return (
    <section className="payroll-export" aria-label="Exportação para ERP">
      <div className="panel">
        <h2>Exportar pontos para a folha</h2>
        <p>
          Selecione uma empresa e um ou mais funcionários. O arquivo reúne as
          horas apuradas no período nas rubricas usadas pela sua contabilidade.
        </p>
        <p className="muted">
          Exporte dias encerrados. Horas extras são apuradas em total, sem
          separação de percentuais. Banco de horas, adicional noturno e DSR não
          são enviados por esta exportação.
        </p>
      </div>
      {error && (
        <div className="panel" role="alert">
          <p className="negative">{error}</p>
          <button
            type="button"
            className="secondary"
            disabled={!!busy}
            onClick={() => setReload((n) => n + 1)}
          >
            Recarregar configurações
          </button>
        </div>
      )}
      {!options && !error && (
        <p role="status">Carregando empresas e funcionários...</p>
      )}
      {options && !options.companies.length && (
        <div className="panel">Nenhuma empresa disponível para exportação.</div>
      )}
      {options && options.companies.length > 0 && (
        <form onSubmit={generate}>
          <fieldset className="payroll-fieldset" disabled={!!busy}>
            <div className="panel">
              <h3>1. Empresa, destino e período</h3>
              <div className="form-grid">
                <label>
                  Empresa para exportação
                  <select
                    required
                    value={companyId}
                    onChange={(e) => {
                      setCompanyId(e.target.value);
                      setSelected([]);
                      setSearch("");
                    }}
                  >
                    {options.companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.legal_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  ERP de destino
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value as Format)}
                  >
                    {options.formats.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Início da apuração
                  <input
                    type="date"
                    required
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label>
                  Fim da apuração
                  <input
                    type="date"
                    required
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
                <label>
                  Competência da folha
                  <input
                    type="month"
                    required
                    value={competence}
                    onChange={(e) => setCompetence(e.target.value)}
                  />
                </label>
              </div>
              <p className="payroll-guide">
                {layout?.instructions}{" "}
                {layout?.source && (
                  <a href={layout.source} target="_blank" rel="noreferrer">
                    Consultar documentação do ERP
                  </a>
                )}
              </p>
            </div>
            <fieldset className="payroll-fieldset" disabled={!ready}>
              <div className="panel">
                <h3>2. Códigos e rubricas no ERP</h3>
                {!ready && !error && (
                  <p role="status">Carregando configuração da empresa...</p>
                )}
                <div className="form-grid">
                  <label>
                    Código da empresa no ERP
                    <input
                      required
                      inputMode="numeric"
                      maxLength={10}
                      value={profile.companyCode}
                      onChange={(e) =>
                        setProfile((p) => ({
                          ...p,
                          companyCode: e.target.value,
                        }))
                      }
                    />
                  </label>
                  {format === "DOMINIO" && (
                    <label>
                      Tipo de processo no Domínio
                      <input
                        required
                        inputMode="numeric"
                        maxLength={2}
                        value={profile.processCode}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            processCode: e.target.value,
                          }))
                        }
                      />
                      <small>
                        Confira o código do processo de folha na contabilidade.
                      </small>
                    </label>
                  )}
                  {(format === "QUESTOR" || format === "CSV") && (
                    <label>
                      Formato de horas
                      <select
                        value={profile.hourFormat}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            hourFormat: e.target.value as Profile["hourFormat"],
                          }))
                        }
                      >
                        <option value="HHMM">Horas e minutos (02:30)</option>
                        <option value="DECIMAL">Horas decimais (2,50)</option>
                      </select>
                    </label>
                  )}
                  {options.events.map((e) => (
                    <label key={e.key}>
                      Rubrica: {e.label}
                      <input
                        inputMode="numeric"
                        maxLength={
                          format === "SAGE" ? 5 : format === "DOMINIO" ? 4 : 10
                        }
                        placeholder="Não exportar"
                        value={profile.events[e.key]}
                        onChange={(event) =>
                          setProfile((p) => ({
                            ...p,
                            events: {
                              ...p.events,
                              [e.key]: event.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
                <p className="muted">
                  Use rubricas de horas existentes no ERP. Deixe em branco os
                  tipos que não deseja enviar. Faltas e atrasos são enviados
                  como quantidades positivas para as rubricas de desconto.
                </p>
                <button type="button" className="secondary" onClick={save}>
                  {busy === "save"
                    ? "Salvando..."
                    : "Salvar configuração da empresa"}
                </button>
              </div>
              <div className="panel">
                <h3>3. Funcionários e matrículas</h3>
                <p>
                  Confira o código de cada funcionário no ERP. Por padrão,
                  usamos a matrícula do cadastro. Nesta etapa estão disponíveis
                  funcionários ativos.
                </p>
                <div className="toolbar">
                  <label>
                    Buscar funcionário
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Nome ou matrícula"
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary"
                    disabled={!visible.length}
                    onClick={() =>
                      setSelected((ids) => [
                        ...new Set([...ids, ...visible.map((e) => e.id)]),
                      ])
                    }
                  >
                    Selecionar exibidos
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={!selected.length}
                    onClick={() => setSelected([])}
                  >
                    Limpar seleção
                  </button>
                  <span aria-live="polite">
                    {selected.length} de {employees.length} selecionados
                  </span>
                </div>
                <div className="table-wrap payroll-employees">
                  <table>
                    <thead>
                      <tr>
                        <th>Selecionar</th>
                        <th>Funcionário</th>
                        <th>Matrícula no ERP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((e) => (
                        <tr key={e.id}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Selecionar ${e.name}`}
                              checked={selected.includes(e.id)}
                              onChange={() => toggle(e.id)}
                            />
                          </td>
                          <td>
                            {e.name}
                            {!e.work_schedule_id && (
                              <small className="negative">
                                {" "}
                                — cadastre uma escala antes de exportar
                              </small>
                            )}
                          </td>
                          <td>
                            <input
                              aria-label={`Matrícula no ERP de ${e.name}`}
                              inputMode="numeric"
                              maxLength={format === "SAGE" ? 5 : 10}
                              value={
                                profile.employeeCodes[String(e.id)] ??
                                e.registration_number ??
                                ""
                              }
                              onChange={(event) =>
                                setProfile((p) => ({
                                  ...p,
                                  employeeCodes: {
                                    ...p.employeeCodes,
                                    [String(e.id)]: event.target.value,
                                  },
                                }))
                              }
                            />
                          </td>
                        </tr>
                      ))}
                      {!visible.length && (
                        <tr>
                          <td colSpan={3}>Nenhum funcionário encontrado.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="muted">
                  As matrículas alteradas são incluídas ao salvar a configuração
                  da empresa. Gere um arquivo separado para cada empresa.
                </p>
                <button
                  className="primary"
                  type="submit"
                  disabled={!selected.length}
                >
                  {busy === "generate"
                    ? "Apurando e preparando arquivo..."
                    : "Preparar exportação"}
                </button>
              </div>
            </fieldset>
          </fieldset>
        </form>
      )}
      {result && (
        <div className="panel" aria-label="Conferência da exportação">
          <div className="toolbar">
            <div>
              <h3>4. Conferir e baixar</h3>
              <p>
                {result.companyName} · {brDate(start)} a {brDate(end)} ·
                Competência {competence}
              </p>
              <p>
                {result.exportedCount} de {result.selectedCount} funcionários
                com eventos · {result.rows.length} eventos
              </p>
            </div>
            <button type="button" className="primary" onClick={download}>
              Baixar arquivo para ERP
            </button>
          </div>
          {result.warnings.length > 0 && (
            <div className="payroll-guide" role="status">
              <strong>Confira antes de importar</strong>
              <ul>
                {result.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
          <p>{result.instructions}</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Funcionário</th>
                  <th>Matrícula ERP</th>
                  <th>Evento</th>
                  <th>Rubrica</th>
                  <th>Horas</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={`${row.employeeId}-${row.event}`}>
                    <td>{row.employeeName}</td>
                    <td>{row.employeeCode}</td>
                    <td>{row.label}</td>
                    <td>{row.eventCode}</td>
                    <td>{minutesToHHMM(row.minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary>Visualizar conteúdo do arquivo</summary>
            <pre className="payroll-file">{result.content}</pre>
          </details>
          <p className="muted">
            O download contém exatamente os eventos desta conferência. Se houver
            alterações nos pontos, prepare uma nova exportação.
          </p>
        </div>
      )}
    </section>
  );
}
