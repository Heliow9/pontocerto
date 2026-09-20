import { useEffect, useState } from "react";

export function PageSkeleton({
  variant = "table",
}: {
  variant?: "table" | "dashboard";
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <section
      className={`page-skeleton page-skeleton--${variant}`}
      data-testid="page-skeleton"
      aria-label="Carregando dados"
      aria-busy="true"
    >
      <div className="loading-caption" role="status">
        <span className="loading-spinner" aria-hidden="true" />
        {slow
          ? "A consulta está demorando mais que o esperado. Aguardando resposta…"
          : "Carregando dados…"}
      </div>
      <div aria-hidden="true" className="skeleton-content">
        {variant === "dashboard" && (
          <div className="skeleton-summary">
            {[0, 1, 2, 3].map((i) => (
              <div className="skeleton-stat" key={i}>
                <i className="skeleton-bar short" />
                <i className="skeleton-bar number" />
                <i className="skeleton-bar" />
              </div>
            ))}
          </div>
        )}
        <div className="skeleton-toolbar">
          <i className="skeleton-bar" />
          <i className="skeleton-bar" />
          <i className="skeleton-bar short" />
        </div>
        <div className="skeleton-table">
          <div className="skeleton-row skeleton-table-head">
            {[0, 1, 2, 3].map((i) => (
              <i className="skeleton-bar" key={i} />
            ))}
          </div>
          {[0, 1, 2, 3, 4].map((row) => (
            <div className="skeleton-row" key={row}>
              {[0, 1, 2, 3].map((col) => (
                <i
                  className={`skeleton-bar ${col === 3 ? "short" : ""}`}
                  key={col}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
