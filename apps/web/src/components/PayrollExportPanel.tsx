import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
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
  const [step, setStep] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const steps = [
    "Período e destino",
    "Funcionários",
    "Códigos da folha",
    "Conferência",
  ];
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
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
  function validateStep(index: number): string {
    if (!ready)
      return "Aguarde o carregamento das configurações. Se houver uma falha, tente recarregar.";
    if (index === 0) {
      if (!companyId || !start || !end || !competence || start > end)
        return "Confira a empresa, o período e a competência da folha.";
      if (end >= localIsoDate())
        return "Escolha um período até ontem. O dia de hoje ainda pode ter pontos em andamento.";
      if ((Date.parse(end) - Date.parse(start)) / 86400000 >= 62)
        return "Selecione um período de até 62 dias.";
    }
    if (index === 1) {
      if (!selected.length)
        return "Selecione pelo menos um funcionário para continuar.";
      const codes = new Set<number>();
      for (const employee of employees.filter((e) => selected.includes(e.id))) {
        if (!employee.work_schedule_id)
          return `${employee.name} está sem jornada. Vincule uma jornada no cadastro antes de exportar.`;
        const code = (
          profile.employeeCodes[String(employee.id)] ??
          employee.registration_number ??
          ""
        ).trim();
        if (
          !/^\d+$/.test(code) ||
          code.length > (format === "SAGE" ? 5 : 10) ||
          Number(code) === 0
        )
          return `Confira a matrícula de ${employee.name}: use o código numérico do funcionário no ERP.`;
        if (codes.has(Number(code)))
          return "Dois funcionários estão com a mesma matrícula no ERP. Corrija antes de continuar.";
        codes.add(Number(code));
      }
    }
    if (index === 2) {
      if (
        !/^\d{1,10}$/.test(profile.companyCode.trim()) ||
        Number(profile.companyCode) === 0
      )
        return "Informe o código numérico da empresa no ERP. Sua contabilidade pode fornecer esse código.";
      if (format === "DOMINIO" && !/^\d{1,2}$/.test(profile.processCode.trim()))
        return "Confira o tipo de processo no Domínio: use até dois dígitos.";
      const codes = Object.values(profile.events)
        .map((c) => c.trim())
        .filter(Boolean);
      if (!codes.length)
        return "Informe pelo menos um código de rubrica para definir quais horas serão enviadas.";
      if (
        codes.some(
          (c) =>
            !/^\d+$/.test(c) ||
            !Number(c) ||
            c.length > (format === "SAGE" ? 5 : format === "DOMINIO" ? 4 : 10),
        )
      )
        return "Confira as rubricas: use códigos numéricos válidos do ERP.";
      if (new Set(codes.map(Number)).size !== codes.length)
        return "Use um código de rubrica diferente para cada tipo de hora.";
    }
    return "";
  }
  function advance() {
    const issue = validateStep(step);
    setError(issue);
    if (!issue) setStep((s) => s + 1);
  }
  function toggle(id: number) {
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
    );
  }
  async function save() {
    const issue = validateStep(2);
    if (issue) {
      setError(issue);
      return;
    }
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
    if (step < 2) {
      advance();
      return;
    }
    for (let index = 0; index <= 2; index++) {
      const issue = validateStep(index);
      if (issue) {
        setStep(index);
        setError(issue);
        return;
      }
    }
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
      setStep(3);
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
      <div className="export-intro">
        <span className="eyebrow">EXPORTAÇÃO GUIADA</span>
        <h2>Da conferência à contabilidade, passo a passo.</h2>
        <p>
          Escolha o período, selecione a equipe e confira as horas antes de
          baixar.
        </p>
        <details className="export-limits">
          <summary>O que este arquivo inclui?</summary>
          <p className="muted">
            Exporte dias encerrados. Horas extras são apuradas em total, sem
            separação de percentuais. Banco de horas, adicional noturno e DSR
            não são enviados por esta exportação.
          </p>
        </details>
      </div>
      <nav className="export-steps" aria-label="Etapas da exportação">
        {steps.map((label, index) => (
          <button
            type="button"
            key={label}
            disabled={!!busy || (index > step && !(index === 3 && result))}
            aria-current={step === index ? "step" : undefined}
            onClick={() => {
              setStep(index);
              setError("");
            }}
          >
            <span>
              {index < step ? <Icon name="check" size={16} /> : index + 1}
            </span>
            <strong>{label}</strong>
          </button>
        ))}
      </nav>
      <h2 className="step-heading" ref={headingRef} tabIndex={-1}>
        Etapa {step + 1} de 4 · {steps[step]}
      </h2>
      {error && (
        <div
          className="panel export-error"
          role="alert"
          ref={errorRef}
          tabIndex={-1}
        >
          <p className="negative">{error}</p>
          {!ready && (
            <button
              type="button"
              className="secondary"
              disabled={!!busy}
              onClick={() => setReload((n) => n + 1)}
            >
              Recarregar configurações
            </button>
          )}
        </div>
      )}
      {!options && !error && (
        <p role="status">Carregando empresas e funcionários...</p>
      )}
      {options && !options.companies.length && (
        <div className="panel">Nenhuma empresa disponível para exportação.</div>
      )}
      {options && options.companies.length > 0 && (
        <form onSubmit={generate} noValidate hidden={step === 3}>
          <fieldset className="payroll-fieldset" disabled={!!busy}>
            <div className="panel" hidden={step !== 0}>
              <h3>1. Empresa, destino e período</h3>
              <p>
                Qual período você vai enviar? A competência é o mês da folha que
                receberá essas horas.
              </p>
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
              {format === "QUESTOR" && (
                <p className="info-box">
                  O modelo do Questor precisa ser validado com a contabilidade
                  antes da primeira importação.
                </p>
              )}
              <details className="payroll-guide">
                <summary>
                  Orientações para importar no{" "}
                  {format === "CSV"
                    ? "ERP"
                    : format === "SAGE"
                      ? "Sage/IOB"
                      : format === "DOMINIO"
                        ? "Domínio"
                        : "Questor"}
                </summary>
                <p>
                  {layout?.instructions}{" "}
                  {layout?.source && (
                    <a href={layout.source} target="_blank" rel="noreferrer">
                      Consultar documentação do ERP
                    </a>
                  )}
                </p>
              </details>
            </div>
            <fieldset className="payroll-fieldset" disabled={!ready}>
              <div className="panel" hidden={step !== 2}>
                <h3>3. Como as horas entram na folha?</h3>
                <p>
                  Rubricas são os códigos dos eventos na folha, como horas
                  normais e extras. Use os códigos fornecidos pela
                  contabilidade. A configuração salva é carregada nas próximas
                  exportações.
                </p>
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
              <div className="panel" hidden={step !== 1}>
                <h3>2. Quem entra nesta exportação?</h3>
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
                          <td data-label="Selecionar">
                            <input
                              type="checkbox"
                              aria-label={`Selecionar ${e.name}`}
                              checked={selected.includes(e.id)}
                              onChange={() => toggle(e.id)}
                            />
                          </td>
                          <td data-label="Funcionário">
                            {e.name}
                            {!e.work_schedule_id && (
                              <small className="negative">
                                {" "}
                                — cadastre uma escala antes de exportar
                              </small>
                            )}
                          </td>
                          <td data-label="Matrícula no ERP">
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
              </div>
            </fieldset>
            <div className="wizard-footer">
              <div>
                <strong>
                  {
                    options.companies.find((c) => String(c.id) === companyId)
                      ?.legal_name
                  }
                </strong>
                <span>
                  {brDate(start)} a {brDate(end)} · {selected.length}{" "}
                  selecionados
                </span>
              </div>
              {step > 0 && (
                <button
                  className="ghost"
                  type="button"
                  onClick={() => {
                    setStep((s) => s - 1);
                    setError("");
                  }}
                >
                  Voltar
                </button>
              )}
              <button className="primary" type="submit" disabled={!ready}>
                {busy === "generate"
                  ? "Preparando arquivo..."
                  : step === 0
                    ? "Continuar para funcionários"
                    : step === 1
                      ? "Continuar para códigos da folha"
                      : "Preparar exportação"}
                <Icon name="arrow" size={17} />
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {result && step === 3 && (
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
            <button type="button" className="ghost" onClick={() => setStep(2)}>
              Revisar configuração
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
