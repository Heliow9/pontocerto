import { useEffect, useRef, useState } from "react";
import {
  AppState,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import * as Network from "expo-network";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";
import { useFeedback } from "./feedback";
import {
  addToQueue,
  readQueue,
  updateQueue,
  type RemotePunch,
} from "./remote-queue";
const labels = {
  CLOCK_IN: "Entrada",
  BREAK_OUT: "Saída para intervalo",
  BREAK_IN: "Retorno do intervalo",
  CLOCK_OUT: "Saída",
};
export function RemoteClock({
  employeeId,
  onSynced,
}: {
  employeeId: number;
  onSynced: () => void;
}) {
  const feedback = useFeedback();
  const [policy, setPolicy] = useState<any>(null),
    [queue, setQueue] = useState<RemotePunch[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [cameraOpen, setCameraOpen] = useState(false),
    [online, setOnline] = useState(
      Platform.OS === "web"
        ? typeof navigator === "undefined" || navigator.onLine
        : true,
    ),
    [photo, setPhoto] = useState<{
      uri: string;
      base64: string;
      at: string;
    } | null>(null),
    [type, setType] = useState<RemotePunch["type"]>("CLOCK_IN");
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null),
    lock = useRef(false),
    latest = useRef<any>(null),
    alive = useRef(true),
    credential = useRef<{ uid: string | null; secret: string | null }>({
      uid: null,
      secret: null,
    });
  const policyKey = `pc_remote_policy_${employeeId}`;
  const capturedOnline = useRef(false);

  async function refreshConnectivity() {
    if (Platform.OS === "web") {
      const connected = typeof navigator === "undefined" || navigator.onLine;
      if (alive.current) setOnline(connected);
      return connected;
    }
    try {
      const state = await Network.getNetworkStateAsync();
      const connected =
        state.isConnected !== false && state.isInternetReachable !== false;
      if (alive.current) setOnline(connected);
      return connected;
    } catch {
      // Unknown state must not expose the offline flow as if connectivity were certainly absent.
      if (alive.current) setOnline(true);
      return true;
    }
  }
  async function refreshPolicy() {
    try {
      const { data } = await api.get("/remote-punch/policy", { timeout: 4000 });
      const value = { ...data, savedAt: Date.now() };
      await AsyncStorage.setItem(policyKey, JSON.stringify(value));
      latest.current = value;
      if (alive.current) setPolicy(value);
      return true;
    } catch {
      return false;
    }
  }
  async function credentials(p: any) {
    const needed =
      p.device?.requireRegisteredDevice || p.device?.requireDeviceBiometric;
    if (!needed) return { uid: null, secret: null };
    if (Platform.OS === "web" && p.device?.requireDeviceBiometric)
      throw new Error(
        "Sua conta exige biometria nativa. Use o Android ou consulte o RH.",
      );
    const uid = await AsyncStorage.getItem(`pc_device_uid_${employeeId}`),
      key = `pc_device_secret_${employeeId}`;
    const secret =
      Platform.OS === "web"
        ? await AsyncStorage.getItem(key)
        : await SecureStore.getItemAsync(
            key,
            p.device?.requireDeviceBiometric
              ? {
                  requireAuthentication: true,
                  authenticationPrompt:
                    "Confirme sua biometria para o ponto remoto",
                }
              : undefined,
          );
    if (!uid || !secret)
      throw new Error(
        "Vincule este aparelho no Perfil antes de usar o ponto remoto.",
      );
    return { uid, secret };
  }
  async function sync(manual = false) {
    if (lock.current) return;
    const p = latest.current;
    if (!p) return;
    if (p.device?.requireDeviceBiometric && !manual) return;
    lock.current = true;
    setBusy(true);
    try {
      let items = await readQueue(employeeId);
      if (!items.length) return;
      if (!(await refreshPolicy())) {
        if (manual)
          setMessage(
            "Sem conexão. Seus registros continuam salvos neste aparelho.",
          );
        return;
      }
      const current = latest.current,
        auth = await credentials(current);
      for (const item of [...items]) {
        if (item.rejected && !manual) continue;
        try {
          if (item.deviceUid !== auth.uid)
            throw {
              response: {
                status: 403,
                data: {
                  message:
                    "Esta marcação está vinculada a outro aparelho. Solicite conferência ao RH; os dados foram preservados.",
                },
              },
            };
          const { error, rejected, ...payload } = item;
          if (
            current.offlineEnabled &&
            Date.now() - Date.parse(item.capturedAt) > 60000
          )
            payload.offline = true;
          const { data } = await api.post(
            "/remote-punch",
            { ...payload, employeeId, deviceSecret: auth.secret },
            { timeout: 15000 },
          );
          items = await updateQueue(employeeId, (current) =>
            current.filter((i) => i.requestKey !== item.requestKey),
          );
          if (alive.current) {
            setQueue(items);
            setMessage(
              `${labels[item.type]} confirmada pelo servidor. Comprovante #${data.id}.`,
            );
          }
          onSynced();
        } catch (e: any) {
          const rejected = [400, 403, 409, 422].includes(e.response?.status);
          const error =
            e.response?.data?.message ||
            "Envio não confirmado. A tentativa será consultada novamente na próxima sincronização.";
          items = await updateQueue(employeeId, (stored) =>
            stored.map((i) =>
              i.requestKey === item.requestKey
                ? {
                    ...i,
                    offline: current.offlineEnabled ? true : i.offline,
                    rejected,
                    error:
                      e.response && e.response.status < 500 ? error : undefined,
                  }
                : i,
            ),
          );
          if (alive.current) {
            setQueue(items);
            setMessage(error);
          }
          if (!rejected) break;
        }
      }
    } catch (e: any) {
      if (alive.current)
        setMessage(e.message || "Não foi possível sincronizar.");
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function discard(item: RemotePunch) {
    feedback.alert(
      "Descartar tentativa rejeitada?",
      "Remova somente após o RH resolver o caso. A foto e o horário desta tentativa local serão apagados.",
      [
        { text: "Manter tentativa" },
        {
          text: "Descartar definitivamente",
          style: "destructive",
          onPress: () => {
            void updateQueue(employeeId, (current) =>
              current.filter(
                (i) => i.requestKey !== item.requestKey || !i.rejected,
              ),
            )
              .then((items) => {
                if (alive.current) setQueue(items);
              })
              .catch(() =>
                setMessage(
                  "Não foi possível remover a tentativa. Os dados foram preservados.",
                ),
              );
          },
        },
      ],
    );
  }
  useEffect(() => {
    alive.current = true;
    void (async () => {
      try {
        const cached = await AsyncStorage.getItem(policyKey);
        if (cached) {
          latest.current = JSON.parse(cached);
          if (alive.current) setPolicy(latest.current);
        }
        const q = await readQueue(employeeId);
        if (alive.current) setQueue(q);
        await refreshPolicy();
        if (alive.current) void sync();
      } catch {
        if (alive.current)
          setMessage(
            "Não foi possível ler os registros locais. Não limpe os dados do aplicativo; procure o RH.",
          );
      }
    })();
    const timer = setInterval(() => {
      if (!lock.current) void sync();
    }, 30000);
    const app = AppState.addEventListener("change", (s) => {
      if (s === "active" && !lock.current)
        void refreshPolicy().then(() => sync());
    });
    const becameOnline = () => {
      if (alive.current) setOnline(true);
      void refreshPolicy().then(() => sync());
    };
    const becameOffline = () => {
      if (alive.current) setOnline(false);
    };
    let networkSubscription: { remove: () => void } | null = null;
    if (Platform.OS === "web") {
      window.addEventListener("online", becameOnline);
      window.addEventListener("offline", becameOffline);
      void refreshConnectivity();
    } else {
      void refreshConnectivity();
      networkSubscription = Network.addNetworkStateListener(
        (state: Awaited<ReturnType<typeof Network.getNetworkStateAsync>>) => {
          const connected =
            state.isConnected !== false && state.isInternetReachable !== false;
          if (alive.current) setOnline(connected);
          if (connected && !lock.current)
            void refreshPolicy().then(() => sync());
        },
      );
    }
    return () => {
      alive.current = false;
      clearInterval(timer);
      app.remove();
      networkSubscription?.remove();
      if (Platform.OS === "web") {
        window.removeEventListener("online", becameOnline);
        window.removeEventListener("offline", becameOffline);
      }
    };
  }, [employeeId]);
  async function open() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const hasInternet = await refreshConnectivity();
      const connected = hasInternet ? await refreshPolicy() : false,
        p = latest.current;
      capturedOnline.current = connected && hasInternet;
      if (!p?.enabled)
        throw new Error("A empresa não habilitou o ponto remoto.");
      if (
        !connected &&
        (!p.offlineEnabled || Date.now() - p.savedAt > 7 * 86400000)
      )
        throw new Error(
          "Conecte o aplicativo à internet para atualizar a autorização de ponto remoto.",
        );
      credential.current = await credentials(p);
      const q = await readQueue(employeeId);
      if (q.length >= 10)
        throw new Error(
          "Envie as marcações pendentes antes de capturar outra.",
        );
      if (!permission?.granted && !(await requestPermission()).granted)
        throw new Error("Permita o uso da câmera para registrar a selfie.");
      setPhoto(null);
      setCameraOpen(true);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function capture() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const at = new Date().toISOString(),
        picture = await camera.current?.takePictureAsync({ quality: 0.6 });
      if (!picture?.uri) throw new Error("Não foi possível capturar a foto.");
      const result = await ImageManipulator.manipulateAsync(
        picture.uri,
        [{ resize: { width: 480 } }],
        {
          compress: 0.5,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        },
      );
      if (!result.base64 || result.base64.length > 650000)
        throw new Error("Foto muito grande. Capture novamente.");
      setPhoto({ uri: result.uri, base64: result.base64, at });
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function confirm() {
    if (lock.current || !photo) return;
    lock.current = true;
    setBusy(true);
    try {
      const p = latest.current;
      const punch: RemotePunch = {
        requestKey: Crypto.randomUUID(),
        type,
        capturedAt: photo.at,
        offline: Boolean(
          p.offlineEnabled &&
          (!capturedOnline.current ||
            (Platform.OS === "web" && !navigator.onLine)),
        ),
        source: Platform.OS === "web" ? "WEB" : "MOBILE",
        selfie: photo.base64,
        deviceUid: credential.current.uid,
      };
      const next = await updateQueue(employeeId, (current) =>
        addToQueue(current, punch),
      );
      setQueue(next);
      setMessage(
        "Marcação salva neste aparelho, pendente de envio. Ela só aparecerá no espelho após confirmação do servidor.",
      );
      setCameraOpen(false);
      setPhoto(null);
      credential.current = { uid: null, secret: null };
    } catch (e: any) {
      setMessage(
        e.response?.data?.message ||
          e.message ||
          "Não foi possível salvar. Mantenha a foto e tente novamente.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
    void sync(true);
  }
  const button = (title: string, fn: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={busy}
      onPress={fn}
      style={[s.button, busy && { opacity: 0.5 }]}
    >
      <Text style={s.buttonText}>{title}</Text>
    </Pressable>
  );
  if (!policy?.enabled && !queue.length) return null;
  return (
    <View style={s.card}>
      <Text style={s.title}>Ponto de qualquer lugar</Text>
      <Text>Com selfie, sem exigir localização.</Text>
      {!online && policy?.offlineEnabled && (
        <Text style={s.offlineNotice}>
          Sem internet: o modo offline está disponível. A marcação ficará salva
          neste aparelho até a conexão voltar.
        </Text>
      )}
      {!online && !policy?.offlineEnabled && (
        <Text style={s.error}>
          Sem internet. Esta empresa não autoriza marcação offline.
        </Text>
      )}
      <Text>
        O horário do aparelho ficará identificado no registro. Confira data e
        hora antes de marcar.
      </Text>
      {online
        ? button("Registrar ponto remoto", () => void open())
        : policy?.offlineEnabled
          ? button("Registrar ponto offline", () => void open())
          : null}
      {!!queue.length && (
        <>
          <Text style={s.title}>
            {queue.length} marcação(ões) aguardando confirmação
          </Text>
          <Text>
            Não limpe os dados nem desinstale o aplicativo antes de enviar. Sair
            da conta preserva a fila para este funcionário.
          </Text>
          {queue.map((q) => (
            <View key={q.requestKey}>
              <Text>
                {labels[q.type]} ·{" "}
                {new Date(q.capturedAt).toLocaleString("pt-BR")}
              </Text>
              {q.error && <Text style={s.error}>{q.error}</Text>}
              {q.rejected &&
                button("Descartar tentativa rejeitada", () => discard(q))}
            </View>
          ))}
          {button("Sincronizar marcações", () => void sync(true))}
        </>
      )}
      {!!message && (
        <Text accessibilityRole="alert" style={s.message}>
          {message}
        </Text>
      )}
      <Modal
        visible={cameraOpen}
        onRequestClose={() => {
          if (!busy) {
            setCameraOpen(false);
            credential.current = { uid: null, secret: null };
          }
        }}
        animationType="slide"
      >
        <ScrollView contentContainerStyle={s.modal}>
          <Text style={s.title}>
            {online ? "Registrar ponto remoto" : "Registrar ponto offline"}
          </Text>
          <Text>
            Escolha a marcação. Entradas e retornos iniciam períodos; saídas os
            encerram.
          </Text>
          {!online && (
            <Text style={s.offlineNotice}>
              Tire a selfie e confira a prévia. A marcação offline só será salva
              depois que você aprovar a foto.
            </Text>
          )}
          {(Object.keys(labels) as RemotePunch["type"][]).map((t) => (
            <Pressable
              key={t}
              accessibilityRole="radio"
              accessibilityState={{ checked: type === t }}
              onPress={() => !busy && setType(t)}
              style={s.choice}
            >
              <Text>
                {type === t ? "●" : "○"} {labels[t]}
              </Text>
            </Pressable>
          ))}
          {photo ? (
            <Image source={{ uri: photo.uri }} style={s.camera} />
          ) : (
            <CameraView ref={camera} facing="front" style={s.camera} />
          )}
          {photo ? (
            <>
              {button(
                online
                  ? "Confirmar marcação remota"
                  : "Aprovar foto e registrar offline",
                () => void confirm(),
              )}
              {button("Refazer foto", () => setPhoto(null))}
            </>
          ) : (
            button(
              online ? "Capturar selfie" : "Tirar foto para o ponto offline",
              () => void capture(),
            )
          )}
          {!!message && <Text style={s.error}>{message}</Text>}
          {button("Cancelar ponto remoto", () => {
            setCameraOpen(false);
            credential.current = { uid: null, secret: null };
          })}
        </ScrollView>
      </Modal>
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#b8deda",
  },
  title: { fontSize: 18, fontWeight: "700", color: "#174c52" },
  button: {
    backgroundColor: "#007c88",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: { color: "white", fontWeight: "700" },
  message: { color: "#174c52", padding: 8 },
  error: { color: "#a32929" },
  offlineNotice: { color: "#7a4f00", fontWeight: "600" },
  modal: { padding: 24, paddingTop: 55, gap: 12 },
  camera: { height: 320, width: "100%", borderRadius: 16 },
  choice: { padding: 10, backgroundColor: "#edf6f5", borderRadius: 8 },
});
