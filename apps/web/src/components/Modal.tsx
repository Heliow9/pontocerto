import { ReactNode, useEffect, useId, useRef, useState } from "react";
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    close = useRef(onClose),
    dirty = useRef(false);
  close.current = onClose;
  const [confirmClose, setConfirmClose] = useState(false);
  const titleId = useId();
  function requestClose() {
    if (ref.current?.querySelector('[aria-busy="true"]')) return;
    if (dirty.current) setConfirmClose(true);
    else close.current();
  }
  const request = useRef(requestClose);
  request.current = requestClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        request.current();
      }
      if (event.key !== "Tab") return;
      const targets = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
        ) || [],
      ).filter((el) => el.getClientRects().length);
      if (!targets.length) {
        event.preventDefault();
        return;
      }
      const first = targets[0],
        last = targets[targets.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === ref.current)
      ) {
        event.preventDefault();
        last.focus();
      }
      if (
        !event.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === ref.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    document.addEventListener("keydown", keyboard);
    window.addEventListener("beforeunload", unload);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keyboard);
      window.removeEventListener("beforeunload", unload);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`modal ${wide ? "modal-wide" : ""}`}
        onChangeCapture={() => {
          dirty.current = true;
        }}
        onClickCapture={(event) => {
          const button = (event.target as HTMLElement).closest("button");
          if (button?.textContent?.trim() === "Cancelar") {
            event.preventDefault();
            event.stopPropagation();
            requestClose();
          }
        }}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="icon-button"
            onClick={requestClose}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          {confirmClose ? (
            <div role="alert">
              <h3>Descartar alterações?</h3>
              <p>As alterações ainda não salvas serão perdidas.</p>
              <div className="form-actions">
                <button
                  autoFocus
                  className="primary"
                  onClick={() => setConfirmClose(false)}
                >
                  Continuar editando
                </button>
                <button className="ghost" onClick={() => close.current()}>
                  Descartar
                </button>
              </div>
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}
