import { useEffect, useState } from "react";
export function PwaNotice() {
  const [prompt, setPrompt] = useState<any>(null),
    [worker, setWorker] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    const install = (e: Event) => {
      e.preventDefault();
      setPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", install);
    if (import.meta.env.PROD && "serviceWorker" in navigator)
      void navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          if (reg.waiting) setWorker(reg.waiting);
          reg.addEventListener("updatefound", () =>
            reg.installing?.addEventListener("statechange", () => {
              if (reg.waiting) setWorker(reg.waiting);
            }),
          );
        })
        .catch(() => {});
    return () => window.removeEventListener("beforeinstallprompt", install);
  }, []);
  if (!prompt && !worker) return null;
  return (
    <div className="connection-banner" role="status">
      {worker
        ? "Uma atualização do painel está disponível."
        : "Adicione o Ponto Certo à sua tela inicial."}{" "}
      <button
        className="ghost"
        onClick={async () => {
          if (worker) {
            if (
              document.querySelector('[role="dialog"],form[aria-busy="true"]')
            )
              return;
            navigator.serviceWorker.addEventListener(
              "controllerchange",
              () => location.reload(),
              { once: true },
            );
            worker.postMessage({ type: "SKIP_WAITING" });
          } else {
            await prompt.prompt();
            setPrompt(null);
          }
        }}
      >
        {worker ? "Atualizar painel" : "Instalar"}
      </button>
    </div>
  );
}
