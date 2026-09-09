import { useAccess } from "../components/Access";
import { LoadState, useLoadState } from "../components/LoadState";
import { AsyncForm } from "../components/AsyncForm";
import { DataTable } from "../components/DataTable";
import { useEffect, useState } from "react";
import { api } from "../api";
import { Employee } from "../types";
import { Modal } from "../components/Modal";
import { Badge, Empty, PageHeader } from "../components/Ui";
import { apiMessage, brDate, localIsoDate } from "../utils";

const labels: any = {
  ATESTADO: "Atestado",
  FERIAS: "Férias",
  AFASTAMENTO: "Afastamento",
  LICENCA: "Licença",
  ABONO: "Abono",
  OUTRO: "Outro",
};
export function OccurrencesPage({
  notify,
}: {
  notify: (m: string, t?: "ok" | "error") => void;
}) {
  const today = localIsoDate();
  const { canManage, canAdjust, role } = useAccess();
  const editable = canAdjust;
  const [items, setItems] = useState<any[]>([]),
    [employees, setEmployees] = useState<Employee[]>([]),
    [open, setOpen] = useState(false),
    [form, setForm] = useState<any>({
      employeeId: 0,
      startDate: today,
      endDate: today,
      type: "ATESTADO",
      reason: "",
      status: "APPROVED",
    });
  const loadState = useLoadState();
  const fetchData = () =>
    Promise.all([api.get("/absences"), api.get("/employees")]).then(
      ([a, b]) => {
        setItems(a.data);
        setEmployees(b.data);
      },
    );
  const load = () => loadState.run(fetchData);
  useEffect(() => {
    load();
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/absences", {
        ...form,
        employeeId: Number(form.employeeId),
      });
      notify("Ocorrência cadastrada.");
      setOpen(false);
      load();
    } catch (err) {
      notify(apiMessage(err), "error");
    }
  }
  async function remove(id: number) {
    if (!confirm("Excluir esta ocorrência?")) return;
    try {
      await api.delete(`/absences/${id}`);
      notify("Ocorrência excluída.");
      load();
    } catch (err) {
      notify(apiMessage(err), "error");
    }
  }
  return (
    <>
      <LoadState state={loadState} retry={load} />
      <PageHeader
        title="Ocorrências"
        subtitle="Atestados, férias, afastamentos, licenças e abonos"
        action={
          editable && (
            <button
              className="primary"
              onClick={() => {
                setForm({ ...form, employeeId: employees[0]?.id || 0 });
                setOpen(true);
              }}
            >
              + Nova ocorrência
            </button>
          )
        }
      />
      <div className="panel">
        {items.length === 0 ? (
          loadState.pending || loadState.error ? null : (
            <Empty>Nenhuma ocorrência cadastrada.</Empty>
          )
        ) : (
          <div className="table-wrap">
            <DataTable>
              <thead>
                <tr>
                  <th>Funcionário</th>
                  <th>Tipo</th>
                  <th>Período</th>
                  <th>Motivo</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.employee_name}</strong>
                    </td>
                    <td>{labels[i.type] || i.type}</td>
                    <td>
                      {brDate(i.start_date)} a {brDate(i.end_date)}
                    </td>
                    <td>{i.reason || "-"}</td>
                    <td>
                      <Badge
                        tone={
                          i.status === "APPROVED"
                            ? "success"
                            : i.status === "PENDING"
                              ? "warning"
                              : "danger"
                        }
                      >
                        {i.status}
                      </Badge>
                    </td>
                    <td>
                      {canManage && (
                        <button
                          className="danger-link"
                          onClick={() => remove(i.id)}
                        >
                          Excluir
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}
      </div>
      {open && (
        <Modal title="Nova ocorrência" onClose={() => setOpen(false)}>
          <AsyncForm className="form-grid" onSubmit={save}>
            <label className="span-2">
              Funcionário
              <select
                required
                value={form.employeeId}
                onChange={(e) =>
                  setForm({ ...form, employeeId: Number(e.target.value) })
                }
              >
                <option value={0}>Selecione</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Data inicial
              <input
                type="date"
                value={form.startDate}
                onChange={(e) =>
                  setForm({ ...form, startDate: e.target.value })
                }
              />
            </label>
            <label>
              Data final
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </label>
            <label>
              Tipo
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                {Object.entries(labels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {String(v)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="APPROVED">Aprovado</option>
                <option value="PENDING">Pendente</option>
                <option value="REJECTED">Rejeitado</option>
              </select>
            </label>
            <label className="span-2">
              Motivo/observação
              <textarea
                rows={3}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
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
              <button className="primary">Salvar ocorrência</button>
            </div>
          </AsyncForm>
        </Modal>
      )}
    </>
  );
}
