import { useState } from "react";
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
      setMessage(
        "Grupo salvo. Os integrantes já estão disponíveis na exportação para ERP.",
      );
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Grupos de funcionários" isDirty={hasChanges} onClose={busy ? () => {} : close}>
      <p>
        Organize sua equipe por obra, contrato, unidade ou equipe. Cada
        funcionário pertence a um grupo da sua empresa. Alterar o vínculo
        transfere o funcionário do grupo anterior.
      </p>
      <div className="toolbar">
        <button
          className="secondary"
          type="button"
          onClick={() => select()}
          disabled={busy}
        >
          + Novo grupo
        </button>
        <label>
          Editar grupo
          <select
            value={id || ""}
            disabled={busy}
            onChange={(e) =>
              select(groups.find((g) => g.id === Number(e.target.value)))
            }
          >
            <option value="">Novo grupo</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ·{" "}
                {companies.find((c) => c.id === g.company_id)?.legal_name} (
                {g.employee_count} ativos)
              </option>
            ))}
          </select>
        </label>
      </div>
      <form onSubmit={save} aria-busy={busy}>
        <fieldset disabled={busy} className="group-fields">
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
          <h3>Integrantes · {members.length} selecionados</h3>
          <label>
            Buscar integrantes
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome ou matrícula"
            />
          </label>
          <div className="toolbar">
            <button
              className="secondary"
              type="button"
              onClick={() =>
                setMembers([
                  ...new Set([...members, ...visible.map((e) => e.id)]),
                ])
              }
            >
              Selecionar exibidos
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => setMembers([])}
            >
              Limpar seleção
            </button>
          </div>
          <div className="group-members">
            {visible.map((e) => (
              <label key={e.id} className="group-member">
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
                    {e.registration_number || "Sem matrícula"} ·{" "}
                    {e.active ? "Ativo" : "Inativo"} ·{" "}
                    {e.group_name || "Sem grupo"}
                  </small>
                </span>
              </label>
            ))}
            {!visible.length && (
              <p>Nenhum funcionário encontrado nesta empresa.</p>
            )}
          </div>
          <p className="muted">
            A exportação do grupo inclui seus funcionários ativos. Inativos
            mantêm o vínculo para consulta.
          </p>
          <button className="primary" type="submit">
            {busy ? "Salvando..." : "Salvar grupo e integrantes"}
          </button>
          {id && (
            <button
              className="ghost"
              type="button"
              disabled={members.length > 0}
              onClick={async () => {
                if (!confirm("Excluir este grupo vazio?")) return;
                setBusy(true);
                setError("");
                try {
                  await api.delete(`/groups/${id}`);
                  await reload();
                  select(undefined, true);
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
          )}
        </fieldset>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
      </form>
    </Modal>
  );
}
