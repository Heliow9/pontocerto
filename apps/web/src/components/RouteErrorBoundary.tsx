import { Component, type ReactNode } from "react";

export class RouteErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <section className="load-error" role="alert">
          <div>
            <h2>Não foi possível abrir esta página</h2>
            <p>
              Verifique a conexão e recarregue. Você também pode acessar outra
              tela pelo menu.
            </p>
          </div>
          <button className="primary" onClick={() => location.reload()}>
            Recarregar página
          </button>
        </section>
      );
    return this.props.children;
  }
}
