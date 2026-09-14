import { Icon } from "./Icon";
import { useEffect, useId, useRef, useState } from "react";
import { OvertimeReference } from "./OvertimeReference";
import { api } from "../api";
import { apiMessage } from "../utils";
import { Company, Employee } from "../types";
import { Modal } from "./Modal";

export type EmployeeGroup = {
  id: number;
  company_id: number;
  name: string;
  employee_count: number;
};
export function GroupsManager({
  groups,
  employees,
  companies,
  close,
  reload,
}: {
  groups: EmployeeGroup[];
  employees: Employee[];
  companies: Company[];
  close: () => void;
  reload: () => Promise<unknown>;
}) {
  const formId = useId();
  const [view, setView] = useState<"list" | "editor">("list");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [view]);
  const [id, setId] = useState<number | null>(null);
  const [companyId, setCompanyId] = useState(
    String(companies.find((c) => c.active)?.id || ""),
  );
  const [name, setName] = useState("");
  const [members, setMembers] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const signature = (company: string, title: string, ids: number[]) =>
    JSON.stringify([company, title.trim(), [...ids].sort((a, b) => a - b)]);
  const [savedSignature, setSavedSignature] = useState(() =>
    signature(companyId, "", []),
  );
  const hasChanges = signature(companyId, name, members) !== savedSignature;
  const visible = employees.filter(
    (e) =>
      String(e.company_id) === companyId &&
      `${e.name} ${e.registration_number || ""}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  function select(group?: EmployeeGroup, discard = false) {
    if (
      !discard &&
      hasChanges &&
      !confirm("Descartar as alterações deste grupo antes de trocar?")
    )
      return;
    setSavedSignature(
      signature(
        group ? String(group.company_id) : companyId,
        group?.name || "",
        group
          ? employees
              .filter((e) => Number(e.group_id) === group.id)
              .map((e) => e.id)
          : [],
      ),
    );
    setView("editor");
    setId(group?.id || null);
    setName(group?.name || "");
    setSearch("");
    setMessage("");
    setError("");
    if (group) setCompanyId(String(group.company_id));
    setMembers(
      group
        ? employees
            .filter((e) => Number(e.group_id) === group.id)
            .map((e) => e.id)
        : [],
    );
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let groupId = id;
      if (groupId)
        await api.put(`/groups/${groupId}`, {
          companyId: Number(companyId),
          name,
        });
      else {
        const { data } = await api.post("/groups", {
          companyId: Number(companyId),
          name,
        });
        groupId = data.id;
        setId(groupId);
      }
      await api.put(`/groups/${groupId}/members`, { employeeIds: members });
      await reload();
      setSavedSignature(signature(companyId, name, members));
      setView("list");
      setMessage(
        "Grupo salvo. Os integrantes já estão disponíveis na exportação para ERP.",
      );
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setBusy(false);
    }
  }
  const transfers = employees.filter(
    (e) => members.includes(e.id) && e.group_id && Number(e.group_id) !== id,
  );
  function back() {
    if (hasChanges && !confirm("Descartar as alterações deste grupo?")) return;
    setSavedSignature(signature(companyId, name, members));
    setError("");
    setMessage("");
    setView("list");
  }
  return (
    <Modal
      title={
        view === "list"
          ? "Grupos de funcionários"
          : id
            ? "Editar grupo"
            : "Novo grupo"
      }
      wide
      isDirty={view === "editor" && hasChanges}
      onClose={busy ? () => {} : close}
    >
      <div className="groups-manager">
        {view === "list" ? (
          <>
            <div className="groups-overview-header">
              <div>
                <h3 ref={heading} tabIndex={-1}>
                  Organize sua equipe
                </h3>
                <p>
                  Reúna funcionários por obra, contrato ou unidade para
                  facilitar a gestão.
                </p>
              </div>
              <button
                type="button"
                className="primary"
                onClick={() => select()}
              >
                <span aria-hidden="true">＋</span> Novo grupo
              </button>
            </div>
            {message && (
              <p role="status" className="groups-success">
                {message}
              </p>
            )}
            {groups.length ? (
              <div className="groups-list">
                {groups.map((group) => (
                  <article className="groups-list-item" key={group.id}>
                    <span className="groups-symbol">
                      <Icon name="employees" size={22} />
                    </span>
                    <div>
                      <h3>{group.name}</h3>
                      <p>
                        {
                          companies.find((c) => c.id === group.company_id)
                            ?.legal_name
                        }
                      </p>
                      <small>{group.employee_count} funcionários ativos</small>
                    </div>
                    <button
                      type="button"
                      className="secondary"
                      aria-label={"Editar " + group.name}
                      onClick={() => select(group)}
                    >
                      Editar grupo <Icon name="arrow" size={16} />
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="groups-empty">
                <span className="groups-symbol">
                  <Icon name="employees" size={28} />
                </span>
                <h3>Nenhum grupo cadastrado</h3>
                <p>
                  Crie o primeiro grupo e escolha os funcionários que fazem
                  parte dele.
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              className="ghost groups-back"
              disabled={busy}
              onClick={back}
            >
              ← Voltar aos grupos
            </button>
            <form id={formId} onSubmit={save} aria-busy={busy}>
              <fieldset disabled={busy} className="group-fields">
                <div className="groups-section-heading">
                  <span>1</span>
                  <div>
                    <h3 ref={heading} tabIndex={-1}>
                      Identifique o grupo
                    </h3>
                    <p>Escolha a empresa e um nome fácil de reconhecer.</p>
                  </div>
                </div>
                <div className="form-grid">
                  <label>
                    Empresa do grupo
                    <select
                      required
                      disabled={Boolean(id)}
                      value={companyId}
                      onChange={(e) => {
                        setCompanyId(e.target.value);
                        setMembers([]);
                        setSearch("");
                      }}
                    >
                      <option value="">Selecione a empresa</option>
                      {companies
                        .filter((c) => c.active || String(c.id) === companyId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.legal_name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Nome do grupo
                    <input
                      required
                      minLength={2}
                      maxLength={120}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex.: Equipe da obra Centro"
                    />
                  </label>
                </div>
                <div className="groups-section-heading">
                  <span>2</span>
                  <div>
                    <h3>Escolha os integrantes</h3>
                    <p>
                      Marque os funcionários que devem fazer parte deste grupo.
                    </p>
                  </div>
                  <strong className="groups-count" aria-live="polite">
                    {members.length} selecionados
                  </strong>
                </div>
                <label className="groups-search">
                  Buscar integrantes
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por nome ou matrícula"
                  />
                </label>
                <div className="groups-selection-actions">
                  <button
                    className="ghost"
                    type="button"
                    disabled={!visible.length}
                    onClick={() =>
                      setMembers([
                        ...new Set([...members, ...visible.map((e) => e.id)]),
                      ])
                    }
                  >
                    Selecionar exibidos ({visible.length})
                  </button>
                  <button
                    className="ghost"
                    type="button"
                    disabled={!members.length}
                    onClick={() => setMembers([])}
                  >
                    Limpar seleção
                  </button>
                </div>
                <div className="group-members">
                  {visible.map((e) => (
                    <label
                      key={e.id}
                      className={
                        "group-member" +
                        (members.includes(e.id) ? " is-selected" : "")
                      }
                    >
                      <input
                        type="checkbox"
                        checked={members.includes(e.id)}
                        onChange={() =>
                          setMembers(
                            members.includes(e.id)
                              ? members.filter((x) => x !== e.id)
                              : [...members, e.id],
                          )
                        }
                      />
                      <span>
                        <strong>{e.name}</strong>
                        <small>
                          Matrícula: {e.registration_number || "não informada"}
                          {!e.active && " · Inativo"}
                        </small>
                      </span>
                      <small className="groups-current-group">
                        {Number(e.group_id) === id
                          ? "Neste grupo"
                          : e.group_name || "Sem grupo"}
                      </small>
                    </label>
                  ))}
                  {!visible.length && (
                    <p className="groups-no-results">
                      {search
                        ? "Nenhum resultado. Tente outro nome ou matrícula."
                        : "Esta empresa ainda não tem funcionários cadastrados."}
                    </p>
                  )}
                </div>
                {transfers.length > 0 && (
                  <div className="groups-transfer" role="status">
                    <strong>
                      {transfers.length} funcionário(s) serão transferidos
                    </strong>
                    <p>
                      {transfers.map((e) => e.name).join(", ")} sairão dos
                      grupos atuais ao salvar. Cada funcionário pode pertencer a
                      apenas um grupo.
                    </p>
                  </div>
                )}
                <p className="groups-note">
                  A exportação inclui os integrantes ativos. Funcionários
                  inativos mantêm o vínculo para consulta.
                </p>
              </fieldset>
            </form>
            {id && (
              <details className="groups-options">
                <summary>Mais opções do grupo</summary>
                <OvertimeReference key={id} kind="group" id={id} />
                <div className="groups-delete">
                  <p>
                    Para excluir o grupo, remova todos os integrantes e salve
                    primeiro.
                  </p>
                  <button
                    className="ghost"
                    type="button"
                    disabled={busy || members.length > 0 || hasChanges}
                    onClick={async () => {
                      if (!confirm("Excluir este grupo vazio?")) return;
                      setBusy(true);
                      setError("");
                      try {
                        await api.delete("/groups/" + id);
                        await reload();
                        select(undefined, true);
                        setView("list");
                        setMessage("Grupo excluído.");
                      } catch (err) {
                        setError(apiMessage(err));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Excluir grupo vazio
                  </button>
                </div>
              </details>
            )}

            <div className="groups-footer">
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <div>
                <span>{members.length} integrante(s) no grupo</span>
                <div className="groups-footer-actions">
                  <button
                    className="secondary"
                    type="button"
                    disabled={busy}
                    onClick={back}
                  >
                    Voltar
                  </button>
                  <button
                    className="primary"
                    type="submit"
                    form={formId}
                    disabled={busy}
                  >
                    {busy
                      ? "Salvando…"
                      : id
                        ? "Salvar alterações"
                        : "Criar grupo"}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
