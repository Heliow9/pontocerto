import {
  Children,
  isValidElement,
  ReactNode,
  FormEvent,
  FormHTMLAttributes,
  useRef,
  useState,
} from "react";
export function AsyncForm({
  onSubmit,
  children,
  ...props
}: Omit<FormHTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  onSubmit?: (event: FormEvent<HTMLFormElement>) => unknown;
}) {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      {...props}
      onInvalidCapture={(event) => {
        const group = (event.target as HTMLElement).closest("details");
        if (group) group.open = true;
      }}
      aria-busy={busy}
      onSubmit={async (event) => {
        event.preventDefault();
        if (locked.current) return;
        locked.current = true;
        setBusy(true);
        setError("");
        try {
          await onSubmit?.(event);
        } catch {
          setError(
            "Não foi possível salvar. Revise os dados e tente novamente.",
          );
        } finally {
          locked.current = false;
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} className="form-fields">
        <FormSections>{children}</FormSections>
      </fieldset>
      {busy && (
        <p role="status" className="span-2">
          Salvando, aguarde…
        </p>
      )}
      {error && (
        <p role="alert" className="form-error span-2">
          {error}
        </p>
      )}
    </form>
  );
}

function FormSections({ children }: { children: ReactNode }) {
  const nodes = Children.toArray(children);
  const section = (node: any) =>
    isValidElement(node) &&
    (node.props as any).className?.includes("section-label");
  if (nodes.filter(section).length < 2) return <>{children}</>;
  const groups: { title: ReactNode; items: ReactNode[] }[] = [];
  const actions: ReactNode[] = [];
  let current = {
    title: "Identificação" as ReactNode,
    items: [] as ReactNode[],
  };
  for (const node of nodes) {
    if (section(node)) {
      if (current.items.length) groups.push(current);
      current = { title: (node as any).props.children, items: [] };
    } else if (
      isValidElement(node) &&
      (node.props as any).className?.includes("form-actions")
    )
      actions.push(node);
    else current.items.push(node);
  }
  if (current.items.length) groups.push(current);
  return (
    <>
      {groups.map((group, index) => (
        <details key={index} className="form-section span-2" open={index === 0}>
          <summary>
            {index + 1}. {group.title}
          </summary>
          <div className="form-grid">{group.items}</div>
        </details>
      ))}
      {actions}
    </>
  );
}
