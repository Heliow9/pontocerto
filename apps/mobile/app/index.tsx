import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import * as Device from "expo-device";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { CameraView, useCameraPermissions } from "expo-camera";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../src/api";

type Entry = { id: number; entry_type: string; registered_at: string; source: string; manually_adjusted: number; has_selfie?: number | null; device_biometric_verified?: number | null; device_biometric_type?: string | null; geo_decision?: string | null; distance_meters?: number | null; device_id?: string | null };
type Tab = "home" | "history" | "profile";
type PendingGeo = { latitude: number; longitude: number; accuracy: number | null; mocked: boolean };
type DeviceStatus = { policy: { punchRadiusMeters: number; maxGpsAccuracyMeters: number; requireLocation: boolean; requireDeviceBiometric: boolean; companyRequireDeviceBiometric?: boolean; employeeBiometricExempt?: boolean; requireRegisteredDevice: boolean; maxRegisteredDevices: number; enforceScheduleWindow?: boolean; scheduleEarlyMarginMinutes?: number; scheduleLateMarginMinutes?: number; address?: string | null }; registeredDevices: number; currentDevice: any | null; devices: any[] };
type ScheduleContext = { decision: "ALLOWED" | "BLOCKED" | "NOT_REQUIRED"; message?: string | null; scheduleName?: string | null; scheduleText?: string | null; nextType?: string | null; complete: boolean; entriesCount: number; policy?: { enforceScheduleWindow: boolean; earlyMarginMinutes: number; lateMarginMinutes: number } };

const typeLabel: Record<string, string> = { CLOCK_IN: "Entrada", BREAK_OUT: "Saída intervalo", BREAK_IN: "Retorno intervalo", CLOCK_OUT: "Saída", OTHER: "Registro" };
const actionLabel: Record<string, string> = { CLOCK_IN: "REGISTRAR ENTRADA", BREAK_OUT: "SAIR PARA INTERVALO", BREAK_IN: "RETORNAR DO INTERVALO", CLOCK_OUT: "REGISTRAR SAÍDA", OTHER: "REGISTRAR PONTO" };
const time = (v: string) => v?.slice(11, 16) || "--:--"; function brDate(v: string) { const [y, m, d] = v.slice(0, 10).split("-"); return `${d}/${m}/${y}` }
function uidKey(employeeId: number) { return `pc_device_uid_${employeeId}` }
function secretKey(employeeId: number) { return `pc_device_secret_${employeeId}` }
function biometricLabels(types: number[]) { const out: string[] = []; if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) out.push("FINGERPRINT"); if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) out.push("FACE_ID"); if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) out.push("IRIS"); return out }

function isExpoGoOnIOS() {
  return Platform.OS === "ios" && Constants.appOwnership === "expo";
}


async function getPunchLocation(): Promise<PendingGeo> {
  if (Platform.OS === "web") {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      throw new Error("Seu navegador não oferece suporte à localização.");
    }

    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        resolve,
        (err) => {
          const msg =
            err.code === 1 ? "Permissão de localização negada. Libere a localização para este site nos ajustes do Safari." :
            err.code === 2 ? "Não foi possível determinar sua localização. Verifique o GPS, Wi‑Fi e sinal do aparelho." :
            err.code === 3 ? "A localização demorou demais para responder. Tente novamente em uma área com melhor sinal." :
            "Não foi possível obter sua localização.";
          reject(new Error(msg));
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    });

    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
      mocked: false
    };
  }

  const enabled = await Location.hasServicesEnabledAsync();
  if (!enabled) throw new Error("GPS desligado. Ative a localização do aparelho para registrar o ponto.");

  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    throw new Error("Permita o uso da localização para registrar o ponto.");
  }

  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? null,
    mocked: Boolean((pos as any).mocked)
  };
}

async function appendSelfieToForm(form: FormData, uri: string) {
  const filename = `ponto-${Date.now()}.jpg`;

  if (Platform.OS === "web") {
    const response = await fetch(uri);
    if (!response.ok) throw new Error("Não foi possível preparar a foto para envio.");
    const blob = await response.blob();
    form.append("selfie", blob, filename);
    return;
  }

  form.append("selfie", {
    uri,
    name: filename,
    type: "image/jpeg"
  } as any);
}

function biometricErrorMessage(error?: string | null) {
  const messages: Record<string, string> = {
    missing_usage_description: "O binário iOS não contém NSFaceIDUsageDescription. Instale o Development Build do Ponto Certo; Face ID não pode ser habilitado dentro do Expo Go.",
    not_enrolled: "Nenhuma biometria está cadastrada neste aparelho.",
    not_available: "A biometria não está disponível neste aparelho.",
    lockout: "A biometria foi bloqueada temporariamente por excesso de tentativas.",
    passcode_not_set: "Configure um código de bloqueio no aparelho antes de usar a biometria.",
    authentication_failed: "A biometria não foi reconhecida.",
    user_cancel: "A autenticação biométrica foi cancelada."
  };
  return messages[error || ""] || `Não foi possível confirmar a biometria${error ? ` (${error})` : ""}.`;
}

export default function App() {
  const [ready, setReady] = useState(false), [token, setToken] = useState<string | null>(null), [user, setUser] = useState<any>(null), [tab, setTab] = useState<Tab>("home"), [entries, setEntries] = useState<Entry[]>([]), [history, setHistory] = useState<Entry[]>([]), [email, setEmail] = useState("funcionario@pontocerto.local"), [password, setPassword] = useState("Admin@123"), [loading, setLoading] = useState(false), [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null), [deviceUid, setDeviceUid] = useState<string | null>(null), [scheduleContext, setScheduleContext] = useState<ScheduleContext | null>(null);
  const cameraRef = useRef<any>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [clockStep, setClockStep] = useState<string | null>(null);
  useEffect(() => { (async () => { const saved = await AsyncStorage.getItem("pc_token"); setToken(saved); if (saved) { try { const { data } = await api.get("/auth/me"); setUser(data); if (data.employee_id) { const uid = await AsyncStorage.getItem(uidKey(Number(data.employee_id))); setDeviceUid(uid) } } catch { await AsyncStorage.removeItem("pc_token"); setToken(null) } } setReady(true) })() }, []);
  useEffect(() => { if (token && user) { loadToday(); loadHistory(); loadDeviceStatus(); loadScheduleContext() } }, [token, user, deviceUid]);
  const fallbackNextType = useMemo(() => entries.length < 4 ? ["CLOCK_IN", "BREAK_OUT", "BREAK_IN", "CLOCK_OUT"][entries.length] : "OTHER", [entries]);
  const nextType = scheduleContext?.nextType || fallbackNextType;

  async function login() { setLoading(true); try { const { data } = await api.post("/auth/login", { email, password }); if (!data.user.employeeId) { Alert.alert("Acesso", "Este usuário não está vinculado a um funcionário."); return } await AsyncStorage.setItem("pc_token", data.token); setToken(data.token); const me = await api.get("/auth/me"); setUser(me.data); const uid = await AsyncStorage.getItem(uidKey(Number(data.user.employeeId))); setDeviceUid(uid) } catch (e: any) { Alert.alert("Login", e?.response?.data?.message || "Não foi possível entrar.") } finally { setLoading(false) } }
  async function logout() { await AsyncStorage.removeItem("pc_token"); setToken(null); setUser(null); setEntries([]); setHistory([]); setDeviceStatus(null); setDeviceUid(null); setScheduleContext(null) }
  async function loadToday() { try { const { data } = await api.get("/time-entries/my/today"); setEntries(data) } catch { setEntries([]) } }
  async function loadHistory() { try { const { data } = await api.get("/time-entries/my/history", { params: { days: 15 } }); setHistory(data) } catch { setHistory([]) } }
  async function loadScheduleContext() { try { const { data } = await api.get("/time-entries/my/context"); setScheduleContext(data) } catch { setScheduleContext(null) } }
  async function loadDeviceStatus() { try { const uid = user?.employee_id ? await AsyncStorage.getItem(uidKey(Number(user.employee_id))) : null; if (uid !== deviceUid) setDeviceUid(uid); const { data } = await api.get("/devices/my/status", { params: { deviceUid: uid || "" } }); setDeviceStatus(data) } catch { setDeviceStatus(null) } }

  async function checkBiometrics() {
    if (isExpoGoOnIOS()) {
      Alert.alert(
        "Face ID exige Development Build",
        "Você está executando o Ponto Certo dentro do Expo Go. No iPhone, o Expo Go não possui a permissão NSFaceIDUsageDescription do seu aplicativo e o SecureStore com biometria também não funciona nesse modo. Instale o Development Build gerado pelo EAS e abra o projeto por ele."
      );
      return null;
    }

    const hardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    const strongStorage = SecureStore.canUseBiometricAuthentication();
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

    if (!hardware) { Alert.alert("Biometria necessária", "Este aparelho não possui hardware biométrico compatível."); return null }
    if (!enrolled) { Alert.alert("Biometria necessária", "Cadastre Face ID, Touch ID ou impressão digital nas configurações do aparelho."); return null }
    if (!strongStorage) { Alert.alert("Biometria indisponível", "O armazenamento seguro do aparelho não está disponível para proteger a credencial do Ponto Certo."); return null }

    return { types: biometricLabels(types), level };
  }

  async function registerDevice() {
    if (!user?.employee_id) return; setLoading(true);
    try {
      const requireBiometric = Boolean(deviceStatus?.policy?.requireDeviceBiometric);
      let biometricCapable = false;
      let biometricTypes: string[] = [];

      if (requireBiometric) {
        if (Platform.OS === "web") {
          Alert.alert(
            "Biometria no PWA",
            "A biometria nativa deste cadastro está habilitada. No PWA do iPhone ela não pode ser validada pelo expo-local-authentication. Desabilite a exigência de biometria para este funcionário no dashboard ou utilize o aplicativo nativo. A selfie e o GPS continuam disponíveis no PWA."
          );
          return;
        }
        const bio = await checkBiometrics(); if (!bio) return;
        const auth = await LocalAuthentication.authenticateAsync({
          promptMessage: "Confirme sua biometria para vincular este aparelho",
          promptSubtitle: "Ponto Certo",
          disableDeviceFallback: true,
          fallbackLabel: "",
          biometricsSecurityLevel: "strong",
          requireConfirmation: true
        });
        if (!auth.success) {
          Alert.alert("Biometria não confirmada", biometricErrorMessage(auth.error));
          return;
        }
        biometricCapable = true;
        biometricTypes = bio.types;
      } else {
        try {
          const hardware = await LocalAuthentication.hasHardwareAsync();
          const enrolled = await LocalAuthentication.isEnrolledAsync();
          const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
          biometricCapable = hardware && enrolled;
          biometricTypes = biometricCapable ? biometricLabels(types) : [];
        } catch {
          biometricCapable = false;
          biometricTypes = [];
        }
      }

      const { data } = await api.post("/devices/my/register", {
        platform: Device.osName || null,
        model: Device.modelName || null,
        manufacturer: Device.manufacturer || null,
        osVersion: Device.osVersion || null,
        biometricCapable,
        biometricTypes
      });

      await AsyncStorage.setItem(uidKey(Number(user.employee_id)), data.deviceUid);
      if (Platform.OS === "web") {
        await AsyncStorage.setItem(secretKey(Number(user.employee_id)), data.deviceSecret);
      } else {
        await SecureStore.setItemAsync(
          secretKey(Number(user.employee_id)),
          data.deviceSecret,
          requireBiometric
            ? { requireAuthentication: true, authenticationPrompt: "Confirme sua biometria para proteger o Ponto Certo" }
            : {}
        );
      }

      setDeviceUid(data.deviceUid);
      Alert.alert(
        "Aparelho vinculado",
        requireBiometric
          ? "A credencial deste dispositivo agora está protegida pela biometria nativa."
          : deviceStatus?.policy?.employeeBiometricExempt
            ? "Aparelho vinculado. A biometria foi dispensada pelo RH para seu cadastro."
            : "Aparelho vinculado sem exigência de biometria."
      );
      await loadDeviceStatus();
    } catch (e: any) {
      Alert.alert("Vínculo do aparelho", e?.response?.data?.message || e?.message || "Não foi possível vincular o aparelho.");
    } finally {
      setLoading(false);
    }
  }

  async function diagnoseGps() {
    if (!user?.employee_id) return;
    setLoading(true);
    try {
      const geo = await getPunchLocation();
      const payload = {
        latitude: geo.latitude,
        longitude: geo.longitude,
        accuracy: geo.accuracy,
        locationMocked: geo.mocked
      };

      const { data } = await api.post("/time-entries/geofence-preview", payload);
      const ref = data.reference;
      const source =
        ref?.source === "WORK_LOCATION" ? "Local de trabalho vinculado" :
        ref?.source === "COMPANY_DEFAULT" ? "Endereço padrão da empresa" :
        "Sem referência";

      Alert.alert(
        "Diagnóstico GPS",
        [
          `Decisão: ${data.decision}`,
          `Precisão do celular: ${payload.accuracy == null ? "-" : `${Math.round(payload.accuracy)} m`}`,
          `Distância calculada: ${data.distanceMeters == null ? "-" : `${Math.round(data.distanceMeters)} m`}`,
          "",
          `Referência usada: ${ref?.name || "-"}`,
          `Origem: ${source}`,
          `Raio: ${ref?.radiusMeters != null ? `${ref.radiusMeters} m` : "-"}`,
          "",
          `Celular: ${payload.latitude.toFixed(6)}, ${payload.longitude.toFixed(6)}`,
          `Referência: ${ref ? `${Number(ref.latitude).toFixed(6)}, ${Number(ref.longitude).toFixed(6)}` : "-"}`,
          "",
          ref?.source === "WORK_LOCATION"
            ? "Este funcionário possui um local de trabalho vinculado. Esse local tem prioridade sobre o endereço padrão da empresa."
            : "Se você está no local e a distância continua alta, recalibre as coordenadas da empresa com “Usar localização atual exata” no dashboard."
        ].join("\n")
      );
    } catch (e:any) {
      Alert.alert("Diagnóstico GPS", e?.response?.data?.message || e?.message || "Não foi possível executar o diagnóstico.");
    } finally {
      setLoading(false);
    }
  }

  async function openSelfieCamera() {
    if (!user?.employee_id) return;
    if (scheduleContext?.decision === "BLOCKED") {
      Alert.alert("Fora da jornada", scheduleContext.message || "O ponto está fora da janela permitida da sua jornada.");
      return;
    }
    if (scheduleContext?.complete) {
      Alert.alert("Jornada concluída", "Todas as marcações previstas para esta jornada já foram registradas.");
      return;
    }
    if ((deviceStatus?.policy?.requireRegisteredDevice || deviceStatus?.policy?.requireDeviceBiometric) && !deviceStatus?.currentDevice) {
      Alert.alert("Aparelho não vinculado", "Antes de bater o ponto, vincule este celular à sua conta em Perfil.", [{ text: "Ir para Perfil", onPress: () => setTab("profile") }]);
      return;
    }

    let granted = cameraPermission?.granted;
    if (!granted) {
      const result = await requestCameraPermission();
      granted = result.granted;
    }
    if (!granted) {
      Alert.alert("Câmera obrigatória", "Permita o acesso à câmera frontal para registrar a foto antes do ponto.");
      return;
    }

    setSelfieUri(null);
    setCameraOpen(true);
  }

  async function captureSelfie() {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality:0.65,
        skipProcessing:false
      });
      if (photo?.uri) setSelfieUri(photo.uri);
    } catch (e:any) {
      Alert.alert("Foto", e?.message || "Não foi possível capturar a foto.");
    } finally {
      setCapturing(false);
    }
  }

  async function startClock() {
    await openSelfieCamera();
  }

  async function confirmSelfieAndClock() {
    if (!selfieUri || !user?.employee_id) return;
    setLoading(true);
    setClockStep("Obtendo localização...");
    try {
      const geo = await getPunchLocation();
      setClockStep("Validando segurança...");
      if (geo.mocked) { Alert.alert("Localização simulada", "Foi detectado GPS simulado. O ponto foi bloqueado."); return }
      const maxAccuracy = deviceStatus?.policy?.maxGpsAccuracyMeters || 100; if (geo.accuracy != null && geo.accuracy > maxAccuracy) { Alert.alert("GPS sem precisão suficiente", `Precisão atual: ${Math.round(geo.accuracy)} m. Aguarde até ${maxAccuracy} m ou menos.`); return }

      const requireDevice = Boolean(deviceStatus?.policy?.requireRegisteredDevice || deviceStatus?.policy?.requireDeviceBiometric);
      const requireBiometric = Boolean(deviceStatus?.policy?.requireDeviceBiometric);
      let uid: string | null = null;
      let secret: string | null = null;

      if (requireDevice) {
        uid = await AsyncStorage.getItem(uidKey(Number(user.employee_id)));
        if (!uid) { Alert.alert("Aparelho não vinculado", "Vincule o dispositivo em Perfil."); return }

        if (Platform.OS === "web") {
          if (requireBiometric) {
            Alert.alert(
              "Biometria necessária",
              "Este funcionário está configurado para exigir biometria nativa. No PWA do iPhone, desabilite essa exigência para este funcionário no dashboard ou utilize o app nativo."
            );
            return;
          }
          secret = await AsyncStorage.getItem(secretKey(Number(user.employee_id)));
        } else {
          secret = requireBiometric
            ? await SecureStore.getItemAsync(secretKey(Number(user.employee_id)), {
                requireAuthentication: true,
                authenticationPrompt: "Confirme sua biometria para registrar o ponto"
              })
            : await SecureStore.getItemAsync(secretKey(Number(user.employee_id)));
        }

        if (!secret) {
          Alert.alert(
            requireBiometric ? "Credencial biométrica indisponível" : "Credencial do aparelho indisponível",
            requireBiometric
              ? "A biometria do aparelho pode ter sido alterada. Solicite ao RH a revogação deste dispositivo e faça um novo vínculo."
              : "Solicite ao RH a revogação deste dispositivo e faça um novo vínculo."
          );
          return;
        }
      }

      const form = new FormData();
      form.append("type", String(nextType || "OTHER"));
      form.append("latitude", String(geo.latitude));
      form.append("longitude", String(geo.longitude));
      if (geo.accuracy != null) form.append("accuracy", String(geo.accuracy));
      form.append("locationMocked", geo.mocked ? "true" : "false");
      if (uid) form.append("deviceUid", uid);
      if (secret) form.append("deviceSecret", secret);
      form.append("biometricType", requireBiometric ? "DEVICE_BIOMETRIC" : "NOT_REQUIRED");
      setClockStep("Preparando foto...");
      await appendSelfieToForm(form, selfieUri);

      setClockStep("Registrando ponto...");
      const { data } = await api.post("/time-entries/secure", form);

      const geoText = data.geo?.distanceMeters != null ? `\n📍 ${Math.round(data.geo.distanceMeters)} m do local autorizado` : "\n📍 Localização validada";
      const bioText = data.device?.biometricVerified
        ? "\n🔐 Biometria do aparelho confirmada"
        : data.device?.biometricExempt
          ? "\n✅ Biometria dispensada pelo RH"
          : "";
      const selfieText = data.selfie?.captured ? "\n📷 Foto registrada" : "";

      setCameraOpen(false);
      Alert.alert("Ponto registrado", `${typeLabel[data.entry_type] || "Registro"} às ${time(data.registered_at)}${selfieText}${bioText}${geoText}`);
      setSelfieUri(null);
      await loadToday(); await loadHistory(); await loadDeviceStatus(); await loadScheduleContext();
    } catch (e:any) {
      const code = e?.response?.data?.code;
      Alert.alert(
        code === "GEOFENCE_BLOCKED" ? "Fora da área permitida" :
        code === "SELFIE_REQUIRED" ? "Foto obrigatória" :
        code?.startsWith("SCHEDULE") ? "Jornada bloqueada" :
        code?.startsWith("DEVICE") ? "Dispositivo bloqueado" :
        "Registro bloqueado",
        e?.response?.data?.message || e?.message || "Não foi possível registrar o ponto."
      );
    } finally {
      setClockStep(null);
      setLoading(false);
    }
  }

  if (!ready) return <SafeAreaView style={[s.page, s.center]}><ActivityIndicator /></SafeAreaView>;
  if (!token) return <SafeAreaView style={[s.page, s.center]}><View style={s.login}><View style={s.logo}><Text style={s.logoText}>PC</Text></View><Text style={s.loginTitle}>Ponto Certo</Text><Text style={s.sub}>Acesse para registrar sua jornada</Text><TextInput style={s.input} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="E-mail" /><TextInput style={s.input} secureTextEntry value={password} onChangeText={setPassword} placeholder="Senha" /><Pressable style={s.primary} onPress={login} disabled={loading}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>ENTRAR</Text>}</Pressable></View></SafeAreaView>;

  return <SafeAreaView style={s.page}>
    <View style={s.appHeader}><View><Text style={s.hello}>Olá, {user?.name?.split(" ")[0] || "Funcionário"} 👋</Text><Text style={s.company}>{user?.company_name || "Ponto Certo"}</Text></View><View style={s.avatar}><Text style={s.avatarText}>{(user?.name || "P").slice(0, 1).toUpperCase()}</Text></View></View>
    {tab === "home" && <ScrollView contentContainerStyle={s.content}><View style={s.securityStrip}><View style={s.securityItem}><Text style={s.securityIcon}>📍</Text><Text style={s.securityText}>Raio {deviceStatus?.policy?.punchRadiusMeters || 1000} m</Text></View><View style={s.securityItem}><Text style={s.securityIcon}>🔐</Text><Text style={s.securityText}>{deviceStatus?.policy?.employeeBiometricExempt ? "Biometria dispensada" : deviceStatus?.policy?.requireDeviceBiometric ? (deviceStatus?.currentDevice ? "Biometria pronta" : "Vincule o aparelho") : "Biometria opcional"}</Text></View><View style={s.securityItem}><Text style={s.securityIcon}>🕐</Text><Text style={s.securityText}>{scheduleContext?.scheduleText || "Jornada"}</Text></View></View><View style={s.clockCard}><Text style={s.today}>{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</Text><Text style={s.clock}>{new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</Text><Text style={s.server}>Antes de cada marcação, o app registra uma foto pela câmera frontal. Depois valida jornada, GPS e a política de biometria.</Text>{scheduleContext?.decision === "BLOCKED" && <Text style={s.scheduleWarning}>{scheduleContext.message}</Text>}{scheduleContext?.scheduleText && scheduleContext.decision !== "BLOCKED" && <Text style={s.scheduleOk}>Jornada: {scheduleContext.scheduleText}</Text>}<Pressable style={[s.clockButton, (loading || scheduleContext?.decision === "BLOCKED" || scheduleContext?.complete) && s.disabled]} onPress={startClock} disabled={loading || scheduleContext?.decision === "BLOCKED" || scheduleContext?.complete}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={s.clockButtonText}>{scheduleContext?.complete ? "JORNADA CONCLUÍDA" : scheduleContext?.decision === "BLOCKED" ? "FORA DA JORNADA" : actionLabel[nextType] || "REGISTRAR PONTO"}</Text>}</Pressable><Text style={s.locationHint}>{deviceStatus?.policy?.employeeBiometricExempt ? "📷 selfie obrigatória · GPS · biometria dispensada" : "📷 selfie obrigatória · GPS · biometria nativa"}</Text></View><View style={s.card}><Text style={s.cardTitle}>Hoje</Text>{entries.length === 0 ? <Text style={s.empty}>Nenhuma marcação realizada.</Text> : entries.map((e, index) => <View style={s.entry} key={e.id}><View style={s.entryIndex}><Text style={s.entryIndexText}>{index + 1}</Text></View><View style={{ flex: 1 }}><Text style={s.entryLabel}>{typeLabel[e.entry_type] || e.entry_type}{e.manually_adjusted ? " *" : ""}</Text><Text style={s.entrySource}>{e.source}{e.has_selfie ? " · 📷 foto" : ""}{e.device_biometric_verified ? " · 🔐 biometria" : ""}{e.distance_meters != null ? ` · ${Math.round(Number(e.distance_meters))} m` : ""}</Text></View><Text style={s.entryTime}>{time(e.registered_at)}</Text></View>)}</View></ScrollView>}
    {tab === "history" && <View style={s.contentFlex}><Text style={s.pageTitle}>Histórico</Text><Text style={s.pageSub}>Últimos 15 dias</Text><FlatList data={history} keyExtractor={i => String(i.id)} contentContainerStyle={{ paddingTop: 12, paddingBottom: 100 }} ListEmptyComponent={<Text style={s.empty}>Sem registros no período.</Text>} renderItem={({ item }) => <View style={s.historyRow}><View><Text style={s.historyDate}>{brDate(item.registered_at)}</Text><Text style={s.entrySource}>{typeLabel[item.entry_type] || item.entry_type} · {item.source}{item.has_selfie ? " · 📷" : ""}{item.device_biometric_verified ? " · 🔐" : ""}{item.geo_decision === "ALLOWED" ? " · 📍" : ""}</Text></View><Text style={s.historyTime}>{time(item.registered_at)}{item.manually_adjusted ? " *" : ""}</Text></View>} /></View>}
    {tab === "profile" && <ScrollView contentContainerStyle={s.content}><Text style={s.pageTitle}>Meu perfil</Text><View style={s.card}><Info label="Nome" value={user?.name} /><Info label="Empresa" value={user?.company_name} /><Info label="Matrícula" value={user?.registration_number} /><Info label="Cargo" value={user?.position_name} /><Info label="E-mail" value={user?.email} /></View><View style={s.card}><Text style={s.cardTitle}>Segurança do aparelho</Text><View style={s.bioStatus}><Text style={s.bioBig}>{deviceStatus?.currentDevice ? "✅" : "🔐"}</Text><View style={{ flex: 1 }}><Text style={s.bioTitle}>{deviceStatus?.currentDevice ? "Este aparelho está vinculado" : "Aparelho pendente"}</Text><Text style={s.entrySource}>{deviceStatus?.policy?.employeeBiometricExempt ? "Biometria desabilitada pelo RH para este funcionário" : deviceStatus?.policy?.requireDeviceBiometric ? "Biometria obrigatória para bater ponto" : "Biometria opcional"}</Text></View></View>{!deviceStatus?.currentDevice && <Pressable style={s.secondaryButton} onPress={registerDevice} disabled={loading}><Text style={s.secondaryButtonText}>VINCULAR ESTE APARELHO</Text></Pressable>}<Text style={s.privacy}>{deviceStatus?.policy?.employeeBiometricExempt ? "A biometria foi dispensada pelo RH para o seu cadastro. GPS, raio permitido, jornada e horário oficial do servidor continuam sendo validados normalmente." : "O Ponto Certo não recebe sua impressão digital nem seu Face ID. O sistema operacional apenas libera uma credencial secreta deste aparelho após a autenticação biométrica. Alterar as biometrias cadastradas pode invalidar essa credencial."}</Text>{isExpoGoOnIOS() && deviceStatus?.policy?.requireDeviceBiometric && <Text style={s.scheduleWarning}>No iPhone, o Face ID não funciona dentro do Expo Go. Instale o Development Build do Ponto Certo para vincular este aparelho.</Text>}</View><View style={s.card}><Text style={s.cardTitle}>Local de ponto</Text><Info label="Endereço padrão" value={deviceStatus?.policy?.address || "A empresa pode usar locais específicos vinculados ao funcionário"} /><Info label="Raio permitido" value={`${deviceStatus?.policy?.punchRadiusMeters || 1000} m`} /><Info label="Precisão GPS exigida" value={`até ${deviceStatus?.policy?.maxGpsAccuracyMeters || 100} m`} /><Info label="Dispositivos permitidos" value={String(deviceStatus?.policy?.maxRegisteredDevices || 1)} /><Info label="Jornada" value={scheduleContext?.scheduleText || scheduleContext?.scheduleName || "Não configurada"} /><Info label="Bloqueio por jornada" value={deviceStatus?.policy?.enforceScheduleWindow ? "Ativo" : "Desativado"} /><Pressable style={s.secondaryButton} onPress={diagnoseGps} disabled={loading}><Text style={s.secondaryButtonText}>📍 DIAGNOSTICAR GPS E RAIO</Text></Pressable></View><Pressable style={s.logout} onPress={logout}><Text style={s.logoutText}>Sair da conta</Text></Pressable></ScrollView>}
    <Modal visible={cameraOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={()=>{setCameraOpen(false);setSelfieUri(null)}}>
      <SafeAreaView style={s.cameraPage}>
        <View style={s.cameraHeader}>
          <View>
            <Text style={s.cameraTitle}>Foto antes do ponto</Text>
            <Text style={s.cameraSub}>Enquadre seu rosto e confirme a foto para continuar.</Text>
          </View>
          <Pressable onPress={()=>{setCameraOpen(false);setSelfieUri(null)}}><Text style={s.cameraClose}>Cancelar</Text></Pressable>
        </View>

        {!selfieUri ? (
          <View style={s.cameraWrap}>
            <CameraView ref={cameraRef} style={s.camera} facing="front" mirror />
            <View style={s.faceGuide}>
              <View style={s.faceOval} />
              <Text style={s.faceGuideText}>Centralize o rosto</Text>
            </View>
          </View>
        ) : (
          <View style={s.previewWrap}>
            <Image source={{uri:selfieUri}} style={s.previewImage} resizeMode="cover" />
          </View>
        )}

        <View style={s.cameraActions}>
          {!selfieUri ? (
            <Pressable style={s.captureButton} onPress={captureSelfie} disabled={capturing}>
              {capturing ? <ActivityIndicator color="#fff" /> : <Text style={s.captureText}>📷 TIRAR FOTO</Text>}
            </Pressable>
          ) : (
            <>
              <Pressable style={s.secondaryCameraButton} onPress={()=>setSelfieUri(null)}><Text style={s.secondaryCameraText}>TIRAR OUTRA</Text></Pressable>
              <Pressable style={[s.confirmCameraButton, loading && s.disabled]} onPress={confirmSelfieAndClock} disabled={loading}><Text style={s.confirmCameraText}>{clockStep || "CONFIRMAR E REGISTRAR PONTO"}</Text></Pressable>
            </>
          )}
        </View>
      </SafeAreaView>
    </Modal>

    <View style={s.tabs}><TabButton active={tab === "home"} label="Ponto" onPress={() => setTab("home")} /><TabButton active={tab === "history"} label="Histórico" onPress={() => setTab("history")} /><TabButton active={tab === "profile"} label="Perfil" onPress={() => setTab("profile")} /></View>
  </SafeAreaView>
}
function Info({ label, value }: { label: string; value?: string }) { return <View style={s.info}><Text style={s.infoLabel}>{label}</Text><Text style={s.infoValue}>{value || "-"}</Text></View> }
function TabButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { return <Pressable style={s.tab} onPress={onPress}><View style={[s.tabDot, active && s.tabDotActive]} /><Text style={[s.tabText, active && s.tabTextActive]}>{label}</Text></Pressable> }
const s = StyleSheet.create({ page: { flex: 1, backgroundColor: "#f4f7fb" }, center: { justifyContent: "center", padding: 22 }, login: { backgroundColor: "#fff", borderRadius: 22, padding: 24, gap: 12 }, logo: { width: 54, height: 54, borderRadius: 16, backgroundColor: "#1f3b68", alignItems: "center", justifyContent: "center", marginBottom: 2 }, logoText: { color: "#fff", fontWeight: "900", fontSize: 19 }, loginTitle: { fontSize: 28, fontWeight: "800", color: "#172033" }, sub: { color: "#718096", marginBottom: 7 }, input: { borderWidth: 1, borderColor: "#d8dee8", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: "#fff" }, primary: { backgroundColor: "#1f3b68", borderRadius: 13, paddingVertical: 15, alignItems: "center", marginTop: 4 }, primaryText: { color: "#fff", fontWeight: "800" }, appHeader: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, hello: { fontSize: 18, fontWeight: "800", color: "#172033" }, company: { fontSize: 11, color: "#7b8798", marginTop: 3 }, avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#dce7f7", alignItems: "center", justifyContent: "center" }, avatarText: { color: "#27466f", fontWeight: "800" }, content: { padding: 20, paddingTop: 8, paddingBottom: 105 }, contentFlex: { flex: 1, padding: 20, paddingTop: 8 }, securityStrip: { flexDirection: "row", gap: 8, marginBottom: 10 }, securityItem: { flex: 1, backgroundColor: "#fff", borderRadius: 12, padding: 10, flexDirection: "row", alignItems: "center", gap: 7 }, securityIcon: { fontSize: 14 }, securityText: { fontSize: 10, fontWeight: "700", color: "#41516a" }, clockCard: { backgroundColor: "#fff", borderRadius: 22, padding: 24, alignItems: "center", shadowColor: "#13233c", shadowOpacity: .06, shadowRadius: 16, elevation: 2 }, today: { color: "#697386", textTransform: "capitalize", fontSize: 12 }, clock: { fontSize: 54, fontWeight: "800", color: "#172033", marginTop: 5 }, server: { fontSize: 10, color: "#8a95a5", textAlign: "center", maxWidth: 290 }, scheduleWarning: { fontSize: 10, color: "#a23e3e", textAlign: "center", marginTop: 10, fontWeight: "700" }, scheduleOk: { fontSize: 10, color: "#347259", textAlign: "center", marginTop: 10, fontWeight: "700" }, clockButton: { backgroundColor: "#1f3b68", width: "100%", borderRadius: 15, paddingVertical: 18, alignItems: "center", marginTop: 22 }, disabled: { opacity: .55 }, clockButtonText: { color: "#fff", fontWeight: "900", fontSize: 13 }, locationHint: { fontSize: 10, color: "#718096", marginTop: 12 }, card: { backgroundColor: "#fff", borderRadius: 18, padding: 18, marginTop: 16 }, cardTitle: { fontSize: 17, fontWeight: "800", color: "#172033", marginBottom: 8 }, empty: { color: "#8a95a5", paddingVertical: 16, textAlign: "center" }, entry: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e1e6ed", gap: 10 }, entryIndex: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#edf3fb", alignItems: "center", justifyContent: "center" }, entryIndexText: { color: "#34577f", fontWeight: "800", fontSize: 11 }, entryLabel: { fontSize: 12, fontWeight: "700", color: "#23314a" }, entrySource: { fontSize: 9, color: "#8a95a5", marginTop: 2 }, entryTime: { fontSize: 18, fontWeight: "800", color: "#172033" }, pageTitle: { fontSize: 25, fontWeight: "800", color: "#172033" }, pageSub: { fontSize: 11, color: "#7d8899", marginTop: 2 }, historyRow: { backgroundColor: "#fff", borderRadius: 14, padding: 15, marginBottom: 9, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, historyDate: { fontWeight: "700", color: "#26344a", fontSize: 12 }, historyTime: { fontWeight: "800", fontSize: 18, color: "#172033" }, info: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e3e8ef" }, infoLabel: { fontSize: 10, color: "#8a95a5", textTransform: "uppercase" }, infoValue: { fontSize: 13, fontWeight: "600", color: "#26344a", marginTop: 3 }, logout: { marginTop: 18, borderWidth: 1, borderColor: "#e3bcbc", borderRadius: 13, padding: 14, alignItems: "center" }, logoutText: { color: "#a23e3e", fontWeight: "700" }, bioStatus: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 }, bioBig: { fontSize: 30 }, bioTitle: { fontSize: 14, fontWeight: "800", color: "#26344a" }, secondaryButton: { borderWidth: 1, borderColor: "#b9c8da", borderRadius: 12, padding: 13, alignItems: "center", marginTop: 10 }, secondaryButtonText: { color: "#27466f", fontWeight: "800", fontSize: 11 }, privacy: { fontSize: 9, color: "#8a95a5", lineHeight: 14, marginTop: 12 }, cameraPage: { flex: 1, backgroundColor: "#0c1220" }, cameraHeader: { padding: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }, cameraTitle: { color: "#fff", fontSize: 22, fontWeight: "900" }, cameraSub: { color: "#aab6c8", fontSize: 11, marginTop: 4, maxWidth: 270 }, cameraClose: { color: "#dbe6f5", fontWeight: "800", paddingTop: 5 }, cameraWrap: { flex: 1, margin: 16, borderRadius: 24, overflow: "hidden", position: "relative", backgroundColor: "#111" }, camera: { flex: 1 }, faceGuide: { position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }, faceOval: { width: 220, height: 290, borderRadius: 120, borderWidth: 3, borderColor: "rgba(255,255,255,.9)", backgroundColor: "transparent" }, faceGuideText: { color: "#fff", fontWeight: "800", marginTop: 16, backgroundColor: "rgba(0,0,0,.38)", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 }, previewWrap: { flex: 1, margin: 16, borderRadius: 24, overflow: "hidden", backgroundColor: "#111" }, previewImage: { width: "100%", height: "100%" }, cameraActions: { padding: 18, paddingBottom: 28, flexDirection: "row", gap: 10 }, captureButton: { flex: 1, backgroundColor: "#1f3b68", borderRadius: 16, paddingVertical: 18, alignItems: "center" }, captureText: { color: "#fff", fontWeight: "900" }, secondaryCameraButton: { flex: .7, borderWidth: 1, borderColor: "#60718b", borderRadius: 14, paddingVertical: 16, alignItems: "center" }, secondaryCameraText: { color: "#dce6f4", fontWeight: "800", fontSize: 11 }, confirmCameraButton: { flex: 1.3, backgroundColor: "#1f6b47", borderRadius: 14, paddingVertical: 16, alignItems: "center", justifyContent: "center" }, confirmCameraText: { color: "#fff", fontWeight: "900", fontSize: 11 }, tabs: { position: "absolute", left: 14, right: 14, bottom: 12, height: 66, backgroundColor: "#fff", borderRadius: 20, flexDirection: "row", shadowColor: "#15243b", shadowOpacity: .1, shadowRadius: 18, elevation: 6 }, tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 5 }, tabDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#d5dce6" }, tabDotActive: { backgroundColor: "#1f3b68" }, tabText: { fontSize: 10, color: "#8a95a5", fontWeight: "600" }, tabTextActive: { color: "#1f3b68", fontWeight: "800" } });
