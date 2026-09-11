import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "./api";
import {
  disableReminders,
  enableReminders,
  reminderStatus,
} from "./notification-client";
export function ReminderSettings() {
  const [status, setStatus] = useState<Awaited<
      ReturnType<typeof reminderStatus>
    > | null>(null),
    [events, setEvents] = useState<any[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load() {
    try {
      const [next, upcoming] = await Promise.all([
        reminderStatus(),
        api.get("/notifications/upcoming"),
      ]);
      setStatus(next);
      setEvents(upcoming.data.events || []);
      setError("");
    } catch {
      setError("Não foi possível consultar os lembretes. Tente atualizar.");
    }
  }
  useEffect(() => {
    void load();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => sub.remove();
  }, []);
  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (status?.serverEnabled) await disableReminders();
      else await enableReminders();
      await load();
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Não foi possível alterar os lembretes.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={s.card}>
      <Text accessibilityRole="header" style={s.title}>
        Lembretes de ponto
      </Text>
      <Text style={s.body}>
        Receba um aviso 5 minutos antes da entrada, do intervalo, do retorno e
        da saída previstos na sua jornada.
      </Text>
      <Text accessibilityLiveRegion="polite" style={s.status}>
        {status?.enabled
          ? "Ativados neste aparelho"
          : status?.serverEnabled
            ? "Permissão bloqueada no aparelho"
            : "Desativados neste aparelho"}
      </Text>
      {status && !status.ready && (
        <Text style={s.body}>
          O responsável pelo sistema precisa habilitar as notificações no
          servidor.
        </Text>
      )}
      {status && !status.supported && (
        <Text style={s.body}>
          Use um navegador com notificações. No iPhone, adicione à tela inicial
          e abra o aplicativo instalado.
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{
          disabled: busy || !status || !status.ready || !status.supported,
        }}
        disabled={busy || !status || !status.ready || !status.supported}
        style={s.button}
        onPress={toggle}
      >
        {busy ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={s.buttonText}>
            {status?.serverEnabled ? "Desativar lembretes" : "Ativar lembretes"}
          </Text>
        )}
      </Pressable>
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        style={s.secondary}
        disabled={busy}
        onPress={() => void load()}
      >
        <Text style={s.link}>Atualizar lembretes</Text>
      </Pressable>
      {Platform.OS !== "web" && (
        <Pressable
          accessibilityRole="button"
          style={s.secondary}
          onPress={() => Linking.openSettings()}
        >
          <Text style={s.link}>Abrir permissões do aparelho</Text>
        </Pressable>
      )}
      <Text style={s.caption}>
        Os horários usam Brasília. Folgas, feriados cadastrados e afastamentos
        aprovados não geram avisos. A entrega depende da conexão e das
        permissões do aparelho e pode atrasar. O lembrete não registra seu
        ponto.
      </Text>
      <Text style={s.title}>Próximos horários previstos</Text>
      {events.slice(0, 4).map((event) => (
        <Text key={event.key} style={s.body}>
          {new Date(event.remindAt).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          · aviso de {event.label} às {event.time}
        </Text>
      ))}
      {!events.length && (
        <Text style={s.caption}>
          Sem horários previstos nos próximos 7 dias. Confira sua jornada com o
          RH.
        </Text>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  card: { padding: 20, gap: 12, backgroundColor: "white", borderRadius: 20 },
  title: { fontSize: 18, fontWeight: "700", color: "#18334c" },
  body: { fontSize: 15, lineHeight: 23, color: "#34465b" },
  caption: { fontSize: 13, lineHeight: 20, color: "#526477" },
  status: { fontSize: 15, fontWeight: "700", color: "#007c88" },
  button: {
    minHeight: 50,
    backgroundColor: "#007c88",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  buttonText: { color: "white", fontSize: 16, fontWeight: "700" },
  secondary: { minHeight: 48, justifyContent: "center" },
  link: { color: "#007c88", fontSize: 15, fontWeight: "700" },
  error: { color: "#a62424", fontSize: 15 },
});
