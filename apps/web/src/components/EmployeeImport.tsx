import { useState } from "react";
import { api } from "../api";
import { apiMessage } from "../utils";
import { Company } from "../types";
import { Modal } from "./Modal";
type Preview = {
  rows: any[];
  preview: any[];
  canImport: boolean;
  confirmation: string | null;
};
export function EmployeeImport({
  companies,
  close,
  reload,
}: {
  companies: Company[];
  close: () => void;
  reload: () => Promise<unknown>;
}) {
  const [companyId, setCompanyId] = useState(
    String(companies.find((c) => c.active)?.id || ""),
  );
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState("");
  async function template() {
    try {
      const { data } = await api.get("/employees/import/template", {
        responseType: "blob",
      });
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = "modelo-funcionarios.xlsx";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(apiMessage(err));
    }
  }
  async function analyze() {
    if (!file || !companyId || busy) return;
    setBusy(true);
    setError("");
    setPreview(null);
    setResult("");
    try {
      const form = new FormData();
      form.append("companyId", companyId);
      form.append("file", file);
      const { data } = await api.post("/employees/import/preview", form);
      setPreview(data);
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!preview?.canImport || busy) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/employees/import/confirm", {
        rows: preview.rows,
        confirmation: preview.confirmation,
      });
      setResult(
        data.imported === 1
          ? "1 funcionário importado com sucesso."
          : `${data.imported} funcionários importados com sucesso.`,
      );
      setPreview(null);
      setFile(null);
      await reload();
    } catch (err: any) {
      setError(apiMessage(err));
      if (err.response?.data?.preview)
        setPreview({
          ...preview,
          preview: err.response.data.preview,
          canImport: false,
          confirmation: null,
        });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Importar funcionários por planilha"
      onClose={busy ? () => {} : close}
      wide
      isDirty={Boolean(preview && !result)}
    >
      <div aria-busy={busy}>
        <p>
          1. Baixe o modelo. 2. Preencha os funcionários. 3. Confira a prévia
          antes de cadastrar.
        </p>
        <p>
          Somente novos funcionários ativos, até 500 por arquivo. Grupos,
          jornadas e locais devem existir na empresa. O acesso ao aplicativo é
          configurado depois, no cadastro individual.
        </p>
        <button className="secondary" disabled={busy} onClick={template}>
          Baixar modelo Excel
        </button>
        <div className="form-grid" style={{ margin: "18px 0" }}>
          <label>
            Empresa da importação
            <select
              aria-label="Empresa da importação"
              disabled={busy}
              value={companyId}
              onChange={(e) => {
                setCompanyId(e.target.value);
                setPreview(null);
                setResult("");
              }}
            >
              <option value="">Selecione</option>
              {companies
                .filter((c) => c.active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.legal_name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Arquivo Excel ou CSV
            <input
              type="file"
              accept=".xlsx,.csv"
              disabled={busy}
              onChange={(e) => {
                const chosen = e.target.files?.[0] || null;
                setPreview(null);
                setResult("");
                setError("");
                if (chosen && chosen.size > 2 * 1024 * 1024) {
                  setFile(null);
                  setError("Use um arquivo de até 2 MB.");
                } else setFile(chosen);
              }}
            />
            <small>
              CPF e matrícula devem estar como texto para preservar zeros
              iniciais.
            </small>
          </label>
        </div>
        <button
          className="primary"
          disabled={busy || !file || !companyId || Boolean(result)}
          onClick={analyze}
        >
          {busy ? "Processando…" : "Conferir planilha"}
        </button>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {result && <p role="status">{result}</p>}
        {preview && (
          <>
            <h3>
              Prévia · {preview.preview.length}{" "}
              {preview.preview.length === 1 ? "funcionário" : "funcionários"}
            </h3>
            <p role="status">
              {preview.canImport
                ? "Dados conferidos. Confirme abaixo para cadastrar toda a planilha."
                : "Nenhum funcionário foi importado. Corrija as linhas indicadas e envie o arquivo novamente."}
            </p>
            <div
              className="table-wrap"
              style={{ maxHeight: 380, overflow: "auto" }}
            >
              <table>
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>Funcionário / matrícula</th>
                    <th>Grupo / jornada / local</th>
                    <th>Validação</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((row) => (
                    <tr key={row.line}>
                      <td>{row.line}</td>
                      <td>
                        {row.nome}
                        <small className="muted"> · {row.matricula}</small>
                      </td>
                      <td>
                        {[row.grupo, row.jornada, row.local]
                          .filter(Boolean)
                          .join(" / ") || "Não informado"}
                      </td>
                      <td>
                        {row.errors.length
                          ? row.errors.join(" ")
                          : row.warnings.length
                            ? row.warnings.join(" ")
                            : "Pronto para importar"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              className="primary"
              style={{ marginTop: 16 }}
              disabled={busy || !preview.canImport}
              onClick={confirm}
            >
              Importar {preview.preview.length}{" "}
              {preview.preview.length === 1 ? "funcionário" : "funcionários"}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
