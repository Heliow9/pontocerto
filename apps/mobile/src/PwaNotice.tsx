import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
export function PwaNotice({ busy }: { busy: boolean }) {
  const [install, setInstall] = useState<any>(null),
    [worker, setWorker] = useState<ServiceWorker | null>(null),
    [standalone, setStandalone] = useState(false),
    [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    try {
      setDismissed(
        Number(localStorage.getItem("pc_install_dismissed_until") || 0) >
          Date.now(),
      );
    } catch {}
    setStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        Boolean((navigator as any).standalone),
    );
    const prompt = (event: Event) => {
      event.preventDefault();
      setInstall(event);
    };
    const installed = () => {
      setStandalone(true);
      setInstall(null);
    };
    window.addEventListener("beforeinstallprompt", prompt);
    window.addEventListener("appinstalled", installed);
    if (!__DEV__ && "serviceWorker" in navigator)
      void navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          if (reg.waiting) setWorker(reg.waiting);
          reg.addEventListener("updatefound", () => {
            const current = reg.installing;
            current?.addEventListener("statechange", () => {
              if (
                current.state === "installed" &&
                navigator.serviceWorker.controller
              )
                setWorker(current);
            });
          });
        })
        .catch(() => {});
    return () => {
      window.removeEventListener("beforeinstallprompt", prompt);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  if (Platform.OS !== "web" || busy) return null;
  if (worker)
    return (
      <View style={s.card}>
        <Text style={s.title}>Atualização disponível</Text>
        <Text style={s.body}>
          Seus registros já confirmados estão salvos. Atualize quando terminar
          de usar esta tela.
        </Text>
        <Pressable
          accessibilityRole="button"
          style={s.button}
          onPress={() => {
            navigator.serviceWorker.addEventListener(
              "controllerchange",
              () => window.location.reload(),
              { once: true },
            );
            worker.postMessage({ type: "SKIP_WAITING" });
          }}
        >
          <Text style={s.link}>Atualizar aplicativo</Text>
        </Pressable>
      </View>
    );
  if (standalone || dismissed) return null;
  return (
    <View style={s.card}>
      <Text style={s.title}>Ponto Certo na sua tela inicial</Text>
      <Text style={s.body}>
        {install
          ? "Instale para abrir o aplicativo com mais facilidade."
          : "No menu do navegador, procure Instalar aplicativo ou Adicionar à Tela de Início. No Safari, use Compartilhar."}
      </Text>
      {install && (
        <Pressable
          accessibilityRole="button"
          style={s.button}
          onPress={async () => {
            await install.prompt();
            await install.userChoice;
            setInstall(null);
          }}
        >
          <Text style={s.link}>Instalar aplicativo</Text>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        style={s.button}
        onPress={() => {
          setDismissed(true);
          try {
            localStorage.setItem(
              "pc_install_dismissed_until",
              String(Date.now() + 7 * 86400000),
            );
          } catch {}
        }}
      >
        <Text style={s.link}>Agora não</Text>
      </Pressable>
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    backgroundColor: "#eaf1fc",
    borderRadius: 16,
    padding: 16,
    gap: 8,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  title: { fontSize: 16, fontWeight: "700", color: "#244a7d" },
  body: { fontSize: 14, lineHeight: 21, color: "#43536a" },
  button: { minHeight: 48, justifyContent: "center" },
  link: { fontSize: 15, fontWeight: "700", color: "#244a7d" },
});
