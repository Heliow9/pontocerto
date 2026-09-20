import { useRef, useState } from "react";
import { apiMessage } from "../utils";
import { PageSkeleton } from "./PageSkeleton";
import { PageHeader } from "./Ui";
export function useLoadState() {
  const [pending, setPending] = useState(true),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  const sequence = useRef(0);
  async function run<T>(work: () => Promise<T>) {
    const id = ++sequence.current;
    setPending(true);
    setError("");
    try {
      const result = await work();
      if (id === sequence.current) setReady(true);
      return result;
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
  return { pending, error, ready, run };
}
export function LoadState({
  state,
  retry,
  variant = "table",
}: {
  state: { pending: boolean; error: string; ready?: boolean };
  retry: () => unknown;
  variant?: "table" | "dashboard";
}) {
  if (state.pending)
    if (!state.ready) return <PageSkeleton variant={variant} />;
    else
      return (
        <div role="status" className="refresh-indicator">
          <span className="loading-spinner" aria-hidden="true" /> Atualizando
          dados…
        </div>
      );
  if (state.error)
    return (
      <div role="alert" className="load-error">
        <div>
          <strong>Não foi possível carregar os dados</strong>
          <p>{state.error}</p>
          {state.ready && (
            <small>Os dados anteriores continuam disponíveis.</small>
          )}
        </div>
        <button className="ghost" onClick={retry}>
          Tentar novamente
        </button>
      </div>
    );
  return null;
}

export function InitialPageState({
  title,
  subtitle,
  state,
  retry,
}: {
  title: string;
  subtitle?: string;
  state: ReturnType<typeof useLoadState>;
  retry: () => unknown;
}) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <LoadState state={state} retry={retry} />
    </>
  );
}
