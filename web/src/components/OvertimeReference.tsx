import { useEffect, useState } from "react";
import { api } from "../api";
import { apiMessage } from "../utils";
export function OvertimeReference({
  kind,
  id,
}: {
  kind: "employee" | "group";
  id: number;
}) {
  const [hours, setHours] = useState(""),
    [inherited, setInherited] = useState<number | null>(null),
    [busy, setBusy] = useState(true),
    [ready, setReady] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    setReady(false);
    setBusy(true);
    setMessage("");
    api
      .get(`/automation/limits/${kind}/${id}`)
      .then(({ data }) => {
        if (live) {
          setHours(data.minutes == null ? "" : String(data.minutes / 60));
          setInherited(data.inheritedMinutes);
          setReady(true);
        }
      })
      .catch((e) => live && setMessage(apiMessage(e)))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [kind, id]);
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await api.put(`/automation/limits/${kind}/${id}`, {
        minutes: hours.trim() === "" ? null : Math.round(Number(hours) * 60),
      });
      setMessage("Referência salva.");
    } catch (e) {
      setMessage(apiMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="card company-automation"
      style={{ marginTop: 16 }}
      aria-label="Referência mensal de horas extras"
      aria-busy={busy}
    >
      <h3>Referência mensal de horas extras</h3>
      <p>
        {kind === "employee"
          ? "A configuração individual tem prioridade. Deixe vazio para herdar do grupo."
          : "Esta quantidade se aplica individualmente a cada integrante sem configuração própria."}{" "}
        Nenhum registro de ponto é bloqueado por esta referência.
      </p>
      {kind === "employee" && (
        <p>
          Referência do grupo:{" "}
          {inherited == null
            ? "não configurada"
            : `${inherited / 60} horas/mês`}
          .
        </p>
      )}
      <label>
        Horas extras por mês
        <input
          type="number"
          min="0.02"
          max="744"
          step="0.01"
          placeholder="Ex.: 40"
          value={hours}
          disabled={busy || !ready}
          onChange={(e) => setHours(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="secondary"
        disabled={busy || !ready}
        onClick={() => void save()}
      >
        Salvar referência mensal
      </button>
      <p>Os alertas precisam estar habilitados nas configurações da empresa.</p>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
