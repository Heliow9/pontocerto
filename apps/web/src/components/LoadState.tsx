import { useRef, useState } from "react";
import { apiMessage } from "../utils";
export function useLoadState() {
  const [pending, setPending] = useState(true),
    [error, setError] = useState("");
  const sequence = useRef(0);
  async function run<T>(work: () => Promise<T>) {
    const id = ++sequence.current;
    setPending(true);
    setError("");
    try {
      return await work();
    } catch (e) {
      if (id === sequence.current)
        setError(
          apiMessage(
            e,
            "Não foi possível carregar. Verifique a conexão e tente novamente.",
          ),
        );
    } finally {
      if (id === sequence.current) setPending(false);
    }
  }
  return { pending, error, run };
}
export function LoadState({
  state,
  retry,
}: {
  state: { pending: boolean; error: string };
  retry: () => unknown;
}) {
  if (state.pending)
    return (
      <div role="status" className="loader-line">
        Atualizando dados…
      </div>
    );
  if (state.error)
    return (
      <div role="alert" className="form-error">
        {state.error}{" "}
        <button className="ghost" onClick={retry}>
          Tentar novamente
        </button>
      </div>
    );
  return null;
}
