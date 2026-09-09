import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge, Empty, PageHeader } from "../components/Ui";
import { LoadState, useLoadState } from "../components/LoadState";
import { DataTable } from "../components/DataTable";
import { AsyncForm } from "../components/AsyncForm";
import { Modal } from "../components/Modal";
import { useAccess } from "../components/Access";
import { apiMessage, brDateTime, entryTypeLabel } from "../utils";
export function AdjustmentsPage({
  notify,
}: {
  notify: (m: string, t?: "ok" | "error") => void;
}) {
  const [items, setItems] = useState<any[]>([]),
    [status, setStatus] = useState("PENDING"),
    [review, setReview] = useState<any>(null),
    [note, setNote] = useState("");
  const state = useLoadState();
  const { canAdjust } = useAccess();
  const load = () =>
    state.run(async () => {
      const { data } = await api.get("/adjustments");
      setItems(data);
    });
  useEffect(() => {
    void load();
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.patch(`/adjustments/${review.id}`, {
        status: review.decision,
        note,
      });
      setReview(null);
      notify(
        "Solicitação analisada. Processe o período para atualizar os totais.",
      );
      await load();
    } catch (e) {
      notify(apiMessage(e), "error");
    }
  }
  const filtered = items.filter((i) => !status || i.status === status);
  return (
    <>
      <PageHeader
        title="Solicitações de ajuste"
        subtitle="Revise pedidos dos funcionários e acompanhe as decisões"
      />
      <LoadState state={state} retry={load} />
      <div className="toolbar">
        <label>
          Situação
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="PENDING">Pendentes</option>
            <option value="APPROVED">Aprovadas</option>
            <option value="REJECTED">Rejeitadas</option>
            <option value="">Todas</option>
          </select>
        </label>
        <button className="ghost" onClick={load}>
          Atualizar
        </button>
      </div>
      <div className="panel">
        {filtered.length ? (
          <DataTable>
            <thead>
              <tr>
                <th>Funcionário</th>
                <th>Horário solicitado</th>
                <th>Tipo</th>
                <th>Justificativa</th>
                <th>Situação</th>
                <th>Análise</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id}>
                  <td>{i.employee_name}</td>
                  <td>
                    {brDateTime(i.requested_time)}
                    {i.original_time && (
                      <div className="muted">
                        Anterior: {brDateTime(i.original_time)}
                      </div>
                    )}
                  </td>
                  <td>{entryTypeLabel[i.requested_entry_type]}</td>
                  <td>{i.reason}</td>
                  <td>
                    <Badge>{i.status}</Badge>
                  </td>
                  <td>
                    {i.status === "PENDING" && canAdjust ? (
                      <>
                        <button
                          className="secondary"
                          onClick={() => {
                            setNote("");
                            setReview({ ...i, decision: "APPROVED" });
                          }}
                        >
                          Aprovar
                        </button>{" "}
                        <button
                          className="ghost"
                          onClick={() => {
                            setNote("");
                            setReview({ ...i, decision: "REJECTED" });
                          }}
                        >
                          Rejeitar
                        </button>
                      </>
                    ) : (
                      i.review_note || "Aguardando análise"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          !state.pending &&
          !state.error && <Empty>Nenhuma solicitação nesta situação.</Empty>
        )}
      </div>
      {review && (
        <Modal
          title={
            review.decision === "APPROVED"
              ? "Aprovar ajuste"
              : "Rejeitar ajuste"
          }
          onClose={() => setReview(null)}
        >
          <AsyncForm className="form-grid" onSubmit={save}>
            <p className="span-2">
              {review.employee_name} · {brDateTime(review.requested_time)}.{" "}
              {review.decision === "APPROVED"
                ? "A aprovação altera o registro e fica identificada no histórico."
                : "O registro será mantido."}
            </p>
            <label className="span-2">
              Justificativa da decisão
              <textarea
                required
                minLength={3}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <div className="form-actions span-2">
              <button className="primary">Confirmar decisão</button>
            </div>
          </AsyncForm>
        </Modal>
      )}
    </>
  );
}
