import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import * as Network from "expo-network";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

const TOKEN_KEY = "pc_autopoint_token";
const entryLabel: Record<string, string> = {
  CLOCK_IN: "Entrada",
  BREAK_OUT: "Saída para intervalo",
  BREAK_IN: "Retorno do intervalo",
  CLOCK_OUT: "Saída",
  OTHER: "Registro",
};

type Session = {
  terminal: { id: number; name: string };
  company: { id: number; name: string };
  settings: {
    enabled: boolean;
    scanIntervalSeconds: number;
    resultDisplaySeconds: number;
    cooldownSeconds: number;
  };
};
type Result = {
  name: string;
  registration_number?: string | null;
  entry_type: string;
  registered_at: string;
};

async function appendPhoto(form: FormData, uri: string) {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    const blob = await response.blob();
    form.append("selfie", blob, `autoponto-${Date.now()}.jpg`);
    return;
  }
  form.append("selfie", {
    uri,
    name: `autoponto-${Date.now()}.jpg`,
    type: "image/jpeg",
  } as any);
}

async function isOnline() {
  if (Platform.OS === "web") return typeof navigator === "undefined" || navigator.onLine;
  const state = await Network.getNetworkStateAsync();
  return Boolean(state.isConnected && state.isInternetReachable !== false);
}

export function AutoPoint({ onClose }: { onClose: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [activationCode, setActivationCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [phase, setPhase] = useState<"activation" | "idle" | "scanning" | "success" | "error" | "offline" | "disabled">("activation");
  const [result, setResult] = useState<Result | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const camera = useRef<any>(null);
  const busy = useRef(false);

  async function loadSession(value: string) {
    const { data } = await api.get<Session>("/autopoint/session", {
      headers: { "x-autopoint-token": value },
    });
    setSession(data);
    setPhase(data.settings.enabled ? "idle" : "disabled");
    setMessage("");
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const saved = await AsyncStorage.getItem(TOKEN_KEY);
        if (!alive) return;
        if (!saved) {
          setPhase("activation");
          return;
        }
        setToken(saved);
        await loadSession(saved);
      } catch (error: any) {
        if (error?.response?.status === 401) {
          await AsyncStorage.removeItem(TOKEN_KEY);
          if (alive) {
            setToken(null);
            setSession(null);
            setPhase("activation");
          }
        } else if (alive) {
          setMessage(error?.response?.data?.message || "Não foi possível conectar ao AutoPonto.");
          setPhase("offline");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!session || !token || phase !== "idle" || !cameraReady) return;
    const delay = Math.max(1, Number(session.settings.scanIntervalSeconds || 3)) * 1000;
    const timer = setTimeout(() => void scan(), delay);
    return () => clearTimeout(timer);
  }, [session, token, phase, cameraReady]);

  useEffect(() => {
    if (!session || !["success", "error"].includes(phase)) return;
    const delay = Math.max(1, Number(session.settings.resultDisplaySeconds || 3)) * 1000;
    const timer = setTimeout(() => {
      setResult(null);
      setMessage("");
      setPhase("idle");
    }, delay);
    return () => clearTimeout(timer);
  }, [phase, session]);

  async function activate() {
    const code = activationCode.replace(/\D/g, "");
    if (code.length !== 6 || loading) return;
    setLoading(true);
    setMessage("");
    try {
      const { data } = await api.post<Session & { token: string }>("/autopoint/activate", { code });
      await AsyncStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setSession({ terminal: data.terminal, company: data.company, settings: data.settings });
      setActivationCode("");
      setPhase(data.settings.enabled ? "idle" : "disabled");
    } catch (error: any) {
      setMessage(error?.response?.data?.message || "Não foi possível ativar este terminal.");
    } finally {
      setLoading(false);
    }
  }

  async function forgetTerminal() {
    await AsyncStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setSession(null);
    setResult(null);
    setMessage("");
    setCameraReady(false);
    setPhase("activation");
  }

  async function authorizeCamera() {
    setMessage("");
    try {
      const response = await requestPermission();
      if (!response.granted) {
        setCameraReady(false);
        setMessage(
          response.canAskAgain === false
            ? "Câmera bloqueada. Libere a permissão da câmera para este site/aplicativo nas configurações do aparelho e abra o AutoPonto novamente."
            : "Permissão de câmera não concedida. O AutoPonto precisa da câmera frontal para identificar o funcionário.",
        );
      }
    } catch {
      setCameraReady(false);
      setMessage("Não foi possível solicitar a permissão de câmera. Confira as permissões do navegador ou aplicativo.");
    }
  }

  async function scan() {
    if (!token || !session || !camera.current || busy.current || !cameraReady) return;
    busy.current = true;
    setPhase("scanning");
    setMessage("Identificando funcionário…");
    try {
      if (!(await isOnline())) {
        setMessage("AutoPonto precisa de internet para identificar o funcionário.");
        setCameraReady(false);
        setPhase("offline");
        setTimeout(() => setPhase("idle"), Math.max(2, session.settings.scanIntervalSeconds) * 1000);
        return;
      }
      const picture = await camera.current.takePictureAsync({ quality: 0.6, skipProcessing: false });
      if (!picture?.uri) throw new Error("Não foi possível capturar a imagem.");
      const image = await ImageManipulator.manipulateAsync(
        picture.uri,
        [{ resize: { width: 480 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG },
      );
      const form = new FormData();
      await appendPhoto(form, image.uri);
      const { data } = await api.post("/autopoint/punch", form, {
        headers: { "x-autopoint-token": token },
        timeout: 20000,
      });
      setResult(data.entry);
      setMessage("Ponto registrado com sucesso");
      setCameraReady(false);
      setPhase("success");
    } catch (error: any) {
      const code = error?.response?.data?.code;
      if (error?.response?.status === 401 || code === "AUTOPONT_TERMINAL_INVALID") {
        await forgetTerminal();
        setMessage("Este terminal foi revogado. Ative novamente com um código do administrador.");
        return;
      }
      if (code === "AUTOPONT_DISABLED") {
        setMessage(error?.response?.data?.message || "AutoPonto desabilitado.");
        setCameraReady(false);
        setPhase("disabled");
        return;
      }
      setMessage(error?.response?.data?.message || error?.message || "Não foi possível identificar o rosto.");
      setCameraReady(false);
      setPhase("error");
    } finally {
      busy.current = false;
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[s.page, s.center]}>
        <ActivityIndicator size="large" />
        <Text style={s.subtitle}>Preparando AutoPonto…</Text>
      </SafeAreaView>
    );
  }

  if (phase === "activation" || !session || !token) {
    return (
      <SafeAreaView style={s.page}>
        <View style={s.activation}>
          <Image source={require("../assets/logo.png")} style={s.logo} resizeMode="contain" />
          <Text style={s.eyebrow}>PONTO CERTO · AUTOPONTO</Text>
          <Text style={s.title}>Ativar este terminal</Text>
          <Text style={s.subtitle}>Digite o código de 6 dígitos gerado pelo administrador da empresa.</Text>
          <TextInput
            value={activationCode}
            onChangeText={(value) => setActivationCode(value.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="000000"
            style={s.codeInput}
            textAlign="center"
            onSubmitEditing={() => void activate()}
          />
          {message ? <Text style={s.errorText}>{message}</Text> : null}
          <Pressable style={[s.button, activationCode.length !== 6 && s.buttonDisabled]} disabled={activationCode.length !== 6} onPress={() => void activate()}>
            <Text style={s.buttonText}>Ativar AutoPonto</Text>
          </Pressable>
          <Pressable style={s.linkButton} onPress={onClose}><Text style={s.linkText}>Voltar ao login</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const showCamera = phase === "idle" || phase === "scanning";
  return (
    <SafeAreaView style={s.page}>
      <View style={s.topbar}>
        <View>
          <Text style={s.company}>{session.company.name}</Text>
          <Text style={s.terminal}>{session.terminal.name}</Text>
        </View>
        <Pressable onPress={onClose} style={s.smallButton}><Text style={s.smallButtonText}>Sair</Text></Pressable>
      </View>
      <View style={s.cameraWrap}>
        {showCamera && permission?.granted && (
          <CameraView
            ref={camera}
            style={StyleSheet.absoluteFill}
            facing="front"
            onCameraReady={() => setCameraReady(true)}
            onMountError={() => {
              setCameraReady(false);
              setMessage("Não foi possível iniciar a câmera frontal. Confira a permissão e tente novamente.");
            }}
          />
        )}
        <View style={s.overlay}>
          {showCamera && !permission?.granted && (
            <View style={s.permissionCard}>
              <Text style={s.resultTitle}>Permissão de câmera</Text>
              <Text style={s.resultMessage}>
                {message || "Autorize a câmera frontal para usar o AutoPonto neste aparelho."}
              </Text>
              <Pressable style={s.permissionButton} onPress={() => void authorizeCamera()}>
                <Text style={s.buttonText}>Permitir câmera</Text>
              </Pressable>
            </View>
          )}
          {phase === "idle" && permission?.granted && <><View style={s.faceGuide} /><Text style={s.overlayTitle}>Posicione seu rosto</Text><Text style={s.overlayText}>Olhe para a câmera. A identificação acontece automaticamente.</Text></>}
          {phase === "scanning" && permission?.granted && <><ActivityIndicator size="large" color="#fff" /><Text style={s.overlayTitle}>Identificando…</Text><Text style={s.overlayText}>Aguarde um instante.</Text></>}
          {phase === "success" && result && <View style={[s.resultCard, s.successCard]}><Text style={s.resultIcon}>✓</Text><Text style={s.resultTitle}>Ponto registrado!</Text><Text style={s.personName}>{result.name}</Text><Text style={s.resultMeta}>Matrícula: {result.registration_number || "—"}</Text><Text style={s.resultType}>{entryLabel[result.entry_type] || "Registro"}</Text><Text style={s.resultTime}>{String(result.registered_at || "").slice(11, 19)}</Text></View>}
          {phase === "error" && <View style={[s.resultCard, s.errorCard]}><Text style={s.resultIcon}>×</Text><Text style={s.resultTitle}>Não foi possível registrar</Text><Text style={s.resultMessage}>{message}</Text><Text style={s.resultHint}>A câmera voltará automaticamente.</Text></View>}
          {phase === "offline" && <View style={[s.resultCard, s.errorCard]}><Text style={s.resultTitle}>Sem internet</Text><Text style={s.resultMessage}>{message}</Text></View>}
          {phase === "disabled" && <View style={s.resultCard}><Text style={s.resultTitle}>AutoPonto desabilitado</Text><Text style={s.resultMessage}>{message || "Solicite ao administrador que habilite este terminal."}</Text></View>}
        </View>
      </View>
      <View style={s.footer}>
        <Text style={s.footerText}>Reconhecimento facial automático · AWS Rekognition</Text>
        <Pressable onPress={() => void forgetTerminal()}><Text style={s.forgetText}>Trocar/desvincular terminal</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#071526" },
  center: { alignItems: "center", justifyContent: "center", gap: 14 },
  activation: { flex: 1, justifyContent: "center", padding: 28, maxWidth: 520, width: "100%", alignSelf: "center", gap: 12 },
  logo: { width: 220, height: 72, alignSelf: "center", marginBottom: 10 },
  eyebrow: { color: "#59d5ca", fontWeight: "800", letterSpacing: 1.4, textAlign: "center", fontSize: 12 },
  title: { color: "#fff", fontSize: 30, fontWeight: "800", textAlign: "center" },
  subtitle: { color: "#a9bbcf", fontSize: 15, lineHeight: 22, textAlign: "center" },
  codeInput: { backgroundColor: "#fff", borderRadius: 14, padding: 16, fontSize: 30, letterSpacing: 12, fontWeight: "800", marginTop: 8 },
  button: { backgroundColor: "#078b8e", borderRadius: 13, padding: 15, alignItems: "center", marginTop: 6 },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  linkButton: { padding: 13, alignItems: "center" },
  linkText: { color: "#b8c8d9", fontWeight: "700" },
  errorText: { color: "#ffb7b7", textAlign: "center" },
  topbar: { minHeight: 72, paddingHorizontal: 18, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  company: { color: "#fff", fontWeight: "800", fontSize: 16 },
  terminal: { color: "#8fa6bb", fontSize: 12, marginTop: 2 },
  smallButton: { borderWidth: 1, borderColor: "#365064", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 13 },
  smallButtonText: { color: "#d2dfeb", fontWeight: "700" },
  cameraWrap: { flex: 1, overflow: "hidden", backgroundColor: "#000", position: "relative" },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,.18)" },
  faceGuide: { width: 230, height: 300, borderRadius: 120, borderWidth: 3, borderColor: "rgba(255,255,255,.86)", marginBottom: 24 },
  overlayTitle: { color: "#fff", fontSize: 28, fontWeight: "800", textAlign: "center", textShadowColor: "rgba(0,0,0,.5)", textShadowRadius: 8 },
  overlayText: { color: "#fff", fontSize: 15, textAlign: "center", marginTop: 7, textShadowColor: "rgba(0,0,0,.6)", textShadowRadius: 7 },
  permissionCard: { width: "100%", maxWidth: 480, backgroundColor: "rgba(9,26,43,.96)", borderRadius: 24, padding: 28, alignItems: "center", borderWidth: 1, borderColor: "#35536d", gap: 14 },
  permissionButton: { width: "100%", backgroundColor: "#078b8e", borderRadius: 13, padding: 15, alignItems: "center", marginTop: 4 },
  resultCard: { width: "100%", maxWidth: 480, backgroundColor: "rgba(9,26,43,.94)", borderRadius: 24, padding: 28, alignItems: "center", borderWidth: 1, borderColor: "#35536d" },
  successCard: { borderColor: "#36b77d" },
  errorCard: { borderColor: "#e26363" },
  resultIcon: { color: "#fff", fontSize: 54, fontWeight: "900" },
  resultTitle: { color: "#fff", fontSize: 24, fontWeight: "900", textAlign: "center", marginTop: 5 },
  personName: { color: "#fff", fontSize: 28, fontWeight: "800", textAlign: "center", marginTop: 18 },
  resultMeta: { color: "#b5c7d8", fontSize: 14, marginTop: 5 },
  resultType: { color: "#66decf", fontSize: 18, fontWeight: "800", marginTop: 20 },
  resultTime: { color: "#fff", fontSize: 36, fontWeight: "900", marginTop: 5 },
  resultMessage: { color: "#e5eef7", fontSize: 16, lineHeight: 23, textAlign: "center", marginTop: 15 },
  resultHint: { color: "#9eb0c1", marginTop: 12, fontSize: 13 },
  footer: { minHeight: 60, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  footerText: { color: "#748ba0", fontSize: 11 },
  forgetText: { color: "#9ab0c5", fontSize: 11, textDecorationLine: "underline" },
});
