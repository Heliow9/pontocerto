import {
  Children,
  isValidElement,
  ReactElement,
  ReactNode,
  useEffect,
  useState,
} from "react";
export function DataTable({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const [page, setPage] = useState(1);
  const sections = Children.toArray(children).filter(
    isValidElement,
  ) as ReactElement<any>[];
  const header = sections.find((s) => s.type === "thead"),
    body = sections.find((s) => s.type === "tbody");
  const headerRow = Children.toArray(header?.props.children)[0] as
    ReactElement<any> | undefined;
  const labels = Children.toArray(headerRow?.props.children).map((cell) =>
    isValidElement(cell) ? (cell.props as any).children : "",
  );
  const rows = Children.toArray(body?.props.children).filter(
    isValidElement,
  ) as ReactElement<any>[];
  const count = Math.max(1, Math.ceil(rows.length / 20)),
    current = Math.min(page, count);
  useEffect(() => setPage(1), [rows.length]);
  if (!rows.length)
    return (
      <div role="status" className="empty-state">
        Nenhum resultado para os filtros selecionados.
      </div>
    );
  return (
    <>
      <table className={`responsive-table ${className}`}>
        {header}
        <tbody>
          {rows.slice((current - 1) * 20, current * 20).map((row, index) => (
            <tr key={row.key || index}>
              {Children.toArray(row.props.children).map((cell, i) =>
                isValidElement(cell) ? (
                  <td key={i} {...(cell.props as any)}>
                    <span className="cell-label" aria-hidden="true">
                      {labels[i] || "Ações"}
                    </span>
                    <div className="cell-value">
                      {(cell.props as any).children}
                    </div>
                  </td>
                ) : (
                  cell
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 20 && (
        <nav className="pagination" aria-label="Paginação">
          <button
            className="ghost"
            disabled={current === 1}
            onClick={() => setPage(current - 1)}
          >
            Anterior
          </button>
          <span role="status">
            {current} de {count} · {rows.length} resultados
          </span>
          <button
            className="ghost"
            disabled={current === count}
            onClick={() => setPage(current + 1)}
          >
            Próxima
          </button>
        </nav>
      )}
    </>
  );
}
