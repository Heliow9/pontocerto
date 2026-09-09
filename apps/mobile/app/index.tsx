import { DateTimeField } from "../src/DateTimeField";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFeedback } from "../src/feedback";
import { PwaNotice } from "../src/PwaNotice";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Location from "expo-location";
import * as Device from "expo-device";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { CameraView, useCameraPermissions } from "expo-camera";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../src/api";

type Entry = {
  id: number;
  entry_type: string;
  registered_at: string;
  source: string;
  manually_adjusted: number;
  has_selfie?: number | null;
  device_biometric_verified?: number | null;
  device_biometric_type?: string | null;
  geo_decision?: string | null;
  distance_meters?: number | null;
  device_id?: string | null;
};
type Tab = "home" | "history" | "profile";
type PendingGeo = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  mocked: boolean;
};
type DeviceStatus = {
  policy: {
    punchRadiusMeters: number;
    maxGpsAccuracyMeters: number;
    requireLocation: boolean;
    requireDeviceBiometric: boolean;
    companyRequireDeviceBiometric?: boolean;
    employeeBiometricExempt?: boolean;
    requireRegisteredDevice: boolean;
    maxRegisteredDevices: number;
    enforceScheduleWindow?: boolean;
    scheduleEarlyMarginMinutes?: number;
    scheduleLateMarginMinutes?: number;
    address?: string | null;
  };
  registeredDevices: number;
  currentDevice: any | null;
  devices: any[];
};
type ScheduleContext = {
  decision: "ALLOWED" | "BLOCKED" | "NOT_REQUIRED";
  message?: string | null;
  scheduleName?: string | null;
  scheduleText?: string | null;
  nextType?: string | null;
  complete: boolean;
  entriesCount: number;
  policy?: {
    enforceScheduleWindow: boolean;
    earlyMarginMinutes: number;
    lateMarginMinutes: number;
  };
};

const typeLabel: Record<string, string> = {
  CLOCK_IN: "Entrada",
  BREAK_OUT: "Saída intervalo",
  BREAK_IN: "Retorno intervalo",
  CLOCK_OUT: "Saída",
  OTHER: "Registro",
};
const actionLabel: Record<string, string> = {
  CLOCK_IN: "REGISTRAR ENTRADA",
  BREAK_OUT: "SAIR PARA INTERVALO",
  BREAK_IN: "RETORNAR DO INTERVALO",
  CLOCK_OUT: "REGISTRAR SAÍDA",
  OTHER: "REGISTRAR PONTO",
};
const time = (v: string) => v?.slice(11, 16) || "--:--";
function brDate(v: string) {
  const [y, m, d] = v.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
function uidKey(employeeId: number) {
  return `pc_device_uid_${employeeId}`;
}
function secretKey(employeeId: number) {
  return `pc_device_secret_${employeeId}`;
}
function biometricLabels(types: number[]) {
  const out: string[] = [];
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT))
    out.push("FINGERPRINT");
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION))
    out.push("FACE_ID");
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS))
    out.push("IRIS");
  return out;
}

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
            err.code === 1
              ? "Permissão de localização negada. Libere a localização para este site nas configurações do navegador."
              : err.code === 2
                ? "Não foi possível determinar sua localização. Verifique o GPS, Wi‑Fi e sinal do aparelho."
                : err.code === 3
                  ? "A localização demorou demais para responder. Tente novamente em uma área com melhor sinal."
                  : "Não foi possível obter sua localização.";
          reject(new Error(msg));
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
      );
    });

    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: Number.isFinite(pos.coords.accuracy)
        ? pos.coords.accuracy
        : null,
      mocked: false,
    };
  }

  const enabled = await Location.hasServicesEnabledAsync();
  if (!enabled)
    throw new Error(
      "GPS desligado. Ative a localização do aparelho para registrar o ponto.",
    );

  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    throw new Error("Permita o uso da localização para registrar o ponto.");
  }

  const pos = await new Promise<Location.LocationObject>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            "A localização demorou para responder. Vá para uma área com melhor sinal e tente novamente.",
          ),
        ),
      20000,
    );
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest })
      .then(resolve, reject)
      .finally(() => clearTimeout(timer));
  });
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? null,
    mocked: Boolean((pos as any).mocked),
  };
}

async function appendSelfieToForm(form: FormData, uri: string) {
  const filename = `ponto-${Date.now()}.jpg`;

  if (Platform.OS === "web") {
    const response = await fetch(uri);
    if (!response.ok)
      throw new Error("Não foi possível preparar a foto para envio.");
    const blob = await response.blob();
    form.append("selfie", blob, filename);
    return;
  }

  form.append("selfie", {
    uri,
    name: filename,
    type: "image/jpeg",
  } as any);
}

function biometricErrorMessage(error?: string | null) {
  const messages: Record<string, string> = {
    missing_usage_description:
      "O binário iOS não contém NSFaceIDUsageDescription. Instale o Development Build do Ponto Certo; Face ID não pode ser habilitado dentro do Expo Go.",
    not_enrolled: "Nenhuma biometria está cadastrada neste aparelho.",
    not_available: "A biometria não está disponível neste aparelho.",
    lockout:
      "A biometria foi bloqueada temporariamente por excesso de tentativas.",
    passcode_not_set:
      "Configure um código de bloqueio no aparelho antes de usar a biometria.",
    authentication_failed: "A biometria não foi reconhecida.",
    user_cancel: "A autenticação biométrica foi cancelada.",
  };
  return (
    messages[error || ""] ||
    `Não foi possível confirmar a biometria${error ? ` (${error})` : ""}.`
  );
}

export default function App() {
  const Alert = useFeedback();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [now, setNow] = useState(new Date()),
    [syncing, setSyncing] = useState(false),
    [syncError, setSyncError] = useState(""),
    [lastSync, setLastSync] = useState<string | null>(null),
    [showPassword, setShowPassword] = useState(false),
    [historyDays, setHistoryDays] = useState(15),
    [receipt, setReceipt] = useState<Entry | null>(null),
    [detail, setDetail] = useState<Entry | null>(null),
    [geoPreview, setGeoPreview] = useState<any>(null),
    [setup, setSetup] = useState(false),
    [adjustments, setAdjustments] = useState<any[]>([]),
    [adjustmentsError, setAdjustmentsError] = useState(""),
    [adjustment, setAdjustment] = useState<{
      timeEntryId: number | null;
      requestedTime: string;
      entryType: string;
      reason: string;
    } | null>(null);
  const epoch = useRef(0),
    refreshing = useRef(false),
    punchLock = useRef(false),
    pendingGeo = useRef<{ geo: PendingGeo; at: number } | null>(null),
    requestKey = useRef<string | null>(null);

  const [ready, setReady] = useState(false),
    [token, setToken] = useState<string | null>(null),
    [user, setUser] = useState<any>(null),
    [tab, setTab] = useState<Tab>("home"),
    [entries, setEntries] = useState<Entry[]>([]),
    [history, setHistory] = useState<Entry[]>([]),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [loading, setLoading] = useState(false),
    [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null),
    [deviceUid, setDeviceUid] = useState<string | null>(null),
    [scheduleContext, setScheduleContext] = useState<ScheduleContext | null>(
      null,
    );
  const cameraRef = useRef<any>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [clockStep, setClockStep] = useState<string | null>(null);
  useEffect(() => {
    void restoreSession();
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (token && user) void refresh();
  }, [token, user?.employee_id, historyDays]);
  useEffect(() => {
    if (params.tab && ["home", "history", "profile"].includes(params.tab))
      setTab(params.tab as Tab);
  }, [params.tab]);
  useEffect(() => {
    const change = AppState.addEventListener("change", (state) => {
      if (state === "active" && token && user && !punchLock.current) {
        setNow(new Date());
        void refresh();
      }
    });
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      if (loading || cameraOpen) return false;
      if (tab !== "home") {
        navigate("home");
        return true;
      }
      return false;
    });
    return () => {
      change.remove();
      back.remove();
    };
  }, [token, user, tab, loading, cameraOpen, historyDays]);
  const dayKey = now.toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  useEffect(() => {
    if (token && user && !punchLock.current) void refresh();
  }, [dayKey]);
  const nextType = scheduleContext?.nextType || "OTHER";
  const contextReady = Boolean(
    scheduleContext && deviceStatus && lastSync && !syncError && !syncing,
  );
  const mustBind = Boolean(
    deviceStatus &&
    (deviceStatus.policy.requireRegisteredDevice ||
      deviceStatus.policy.requireDeviceBiometric) &&
    !deviceStatus.currentDevice,
  );
  const unsupported =
    Platform.OS === "web" &&
    Boolean(deviceStatus?.policy.requireDeviceBiometric);
  function navigate(value: Tab) {
    setTab(value);
    router.setParams({ tab: value });
  }
  async function restoreSession() {
    try {
      const saved = await AsyncStorage.getItem("pc_token");
      setToken(saved);
      if (saved) {
        const cached = await AsyncStorage.getItem("pc_snapshot");
        if (cached) {
          try {
            const data = JSON.parse(cached);
            setUser(data.user);
            setEntries(data.entries || []);
            setHistory(data.history || []);
            setLastSync(data.at);
            setSyncError("Verificando conexão. Dados da última consulta.");
          } catch {
            await AsyncStorage.removeItem("pc_snapshot");
          }
        }
        try {
          const { data } = await api.get("/auth/me");
          if (!data?.employee_id)
            throw new Error("Usuário sem vínculo de funcionário.");
          setUser(data);
          const id = Number(data.employee_id);
          setDeviceUid(await AsyncStorage.getItem(uidKey(id)));
          requestKey.current = await AsyncStorage.getItem(`pc_pending_${id}`);
        } catch (e: any) {
          if (e.response?.status === 401) await logout();
          else
            setSyncError(
              "Não foi possível verificar sua sessão. Verifique a conexão e tente novamente.",
            );
        }
      }
    } catch {
      setSyncError("Não foi possível ler sua sessão. Tente novamente.");
    } finally {
      setReady(true);
    }
  }
  async function login() {
    if (loading) return;
    if (!email.trim() || !password) {
      Alert.alert("Dados de acesso", "Preencha e-mail e senha.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", {
        email: email.trim(),
        password,
      });
      if (!data.user.employeeId) {
        Alert.alert(
          "Acesso",
          "Este usuário não está vinculado a um funcionário.",
        );
        return;
      }
      epoch.current++;
      await AsyncStorage.removeItem("pc_snapshot");
      await AsyncStorage.setItem("pc_token", data.token);
      setToken(data.token);
      setPassword("");
      const me = await api.get("/auth/me");
      setUser(me.data);
      setDeviceUid(
        await AsyncStorage.getItem(uidKey(Number(data.user.employeeId))),
      );
      requestKey.current = await AsyncStorage.getItem(
        `pc_pending_${data.user.employeeId}`,
      );
    } catch (e: any) {
      Alert.alert(
        "Acesso",
        e.response?.data?.message ||
          "Não foi possível entrar. Verifique sua conexão e tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function logout() {
    epoch.current++;
    await AsyncStorage.multiRemove(["pc_token", "pc_snapshot"]);
    setToken(null);
    setUser(null);
    setEntries([]);
    setHistory([]);
    setAdjustments([]);
    setReceipt(null);
    setDeviceStatus(null);
    setDeviceUid(null);
    setScheduleContext(null);
    setLastSync(null);
    setSyncError("");
    setCameraOpen(false);
    setSelfieUri(null);
    requestKey.current = null;
    navigate("home");
  }
  async function refresh() {
    if (!user?.employee_id || refreshing.current) return null;
    const currentEpoch = epoch.current;
    refreshing.current = true;
    setSyncing(true);
    setSyncError("");
    try {
      const id = Number(user.employee_id),
        uid = await AsyncStorage.getItem(uidKey(id));
      const [todayResult, historyResult, deviceResult, contextResult] =
        await Promise.all([
          api.get("/time-entries/my/today"),
          api.get("/time-entries/my/history", {
            params: { days: historyDays },
          }),
          api.get("/devices/my/status", { params: { deviceUid: uid || "" } }),
          api.get("/time-entries/my/context"),
        ]);
      if (currentEpoch !== epoch.current) return null;
      const at = new Date().toISOString();
      setEntries(todayResult.data);
      setHistory(historyResult.data);
      setDeviceUid(uid);
      setDeviceStatus(deviceResult.data);
      setScheduleContext(contextResult.data);
      setLastSync(at);
      await AsyncStorage.setItem(
        "pc_snapshot",
        JSON.stringify({
          user,
          entries: todayResult.data,
          history: historyResult.data,
          at,
        }),
      );
      void api
        .get("/adjustments")
        .then((r) => {
          if (currentEpoch === epoch.current) {
            setAdjustments(r.data);
            setAdjustmentsError("");
          }
        })
        .catch(() => {
          if (currentEpoch === epoch.current)
            setAdjustmentsError(
              "Não foi possível atualizar suas solicitações. Tente atualizar novamente.",
            );
        });
      return {
        device: deviceResult.data as DeviceStatus,
        schedule: contextResult.data as ScheduleContext,
      };
    } catch (e: any) {
      if (currentEpoch === epoch.current) {
        if (e.response?.status === 401) {
          await logout();
          Alert.alert("Sessão expirada", "Entre novamente para continuar.");
        } else
          setSyncError(
            "Não foi possível atualizar. Os dados exibidos são da última consulta. Tente novamente antes de registrar.",
          );
      }
      return null;
    } finally {
      refreshing.current = false;
      setSyncing(false);
    }
  }
  async function loadToday() {
    const { data } = await api.get("/time-entries/my/today");
    setEntries(data);
  }
  async function loadHistory() {
    const { data } = await api.get("/time-entries/my/history", {
      params: { days: historyDays },
    });
    setHistory(data);
  }
  async function loadDeviceStatus() {
    const uid = await AsyncStorage.getItem(uidKey(Number(user.employee_id)));
    const { data } = await api.get("/devices/my/status", {
      params: { deviceUid: uid || "" },
    });
    setDeviceStatus(data);
    setDeviceUid(uid);
  }
  async function loadScheduleContext() {
    const { data } = await api.get("/time-entries/my/context");
    setScheduleContext(data);
  }
  async function acceptReceipt(
    data: Entry & { selfie?: { captured?: boolean } },
  ) {
    setReceipt({
      ...data,
      has_selfie: data.selfie?.captured ? 1 : data.has_selfie,
    });
    setCameraOpen(false);
    setSelfieUri(null);
    requestKey.current = null;
    await AsyncStorage.removeItem(`pc_pending_${user.employee_id}`);
    await refresh();
  }
  async function reconcile() {
    if (!requestKey.current) return false;
    try {
      const { data } = await api.get(
        `/time-entries/my/requests/${requestKey.current}`,
      );
      await acceptReceipt(data);
      return true;
    } catch {
      return false;
    }
  }
  async function saveAdjustment() {
    if (!adjustment || loading) return;
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(adjustment.requestedTime) ||
      adjustment.reason.trim().length < 5
    ) {
      Alert.alert(
        "Revise o pedido",
        "Selecione uma data e um horário válidos e escreva uma justificativa de pelo menos 5 caracteres.",
      );
      return;
    }
    setLoading(true);
    try {
      await api.post("/adjustments", adjustment);
      setAdjustment(null);
      const { data } = await api.get("/adjustments");
      setAdjustments(data);
      Alert.alert(
        "Solicitação enviada",
        "O RH poderá analisar seu pedido. Acompanhe a decisão no histórico.",
      );
    } catch (e: any) {
      Alert.alert(
        "Solicitação",
        e.response?.data?.message ||
          "Não foi possível enviar. Verifique sua conexão.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function checkBiometrics() {
    if (isExpoGoOnIOS()) {
      Alert.alert(
        "Face ID exige Development Build",
        "Você está executando o Ponto Certo dentro do Expo Go. No iPhone, o Expo Go não possui a permissão NSFaceIDUsageDescription do seu aplicativo e o SecureStore com biometria também não funciona nesse modo. Instale o Development Build gerado pelo EAS e abra o projeto por ele.",
      );
      return null;
    }

    const hardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    const strongStorage = SecureStore.canUseBiometricAuthentication();
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

    if (!hardware) {
      Alert.alert(
        "Biometria necessária",
        "Este aparelho não possui hardware biométrico compatível.",
      );
      return null;
    }
    if (!enrolled) {
      Alert.alert(
        "Biometria necessária",
        "Cadastre Face ID, Touch ID ou impressão digital nas configurações do aparelho.",
      );
      return null;
    }
    if (!strongStorage) {
      Alert.alert(
        "Biometria indisponível",
        "O armazenamento seguro do aparelho não está disponível para proteger a credencial do Ponto Certo.",
      );
      return null;
    }

    return { types: biometricLabels(types), level };
  }

  async function registerDevice() {
    if (!user?.employee_id) return;
    setLoading(true);
    try {
      const requireBiometric = Boolean(
        deviceStatus?.policy?.requireDeviceBiometric,
      );
      let biometricCapable = false;
      let biometricTypes: string[] = [];

      if (requireBiometric) {
        if (Platform.OS === "web") {
          Alert.alert(
            "Biometria no PWA",
            "Sua conta exige biometria nativa, disponível no aplicativo instalado. Utilize o aplicativo nativo ou consulte o RH sobre o acesso autorizado para sua conta. A selfie e o GPS continuam disponíveis no PWA.",
          );
          return;
        }
        const bio = await checkBiometrics();
        if (!bio) return;
        const auth = await LocalAuthentication.authenticateAsync({
          promptMessage: "Confirme sua biometria para vincular este aparelho",
          promptSubtitle: "Ponto Certo",
          disableDeviceFallback: true,
          fallbackLabel: "",
          biometricsSecurityLevel: "strong",
          requireConfirmation: true,
        });
        if (!auth.success) {
          Alert.alert(
            "Biometria não confirmada",
            biometricErrorMessage(auth.error),
          );
          return;
        }
        biometricCapable = true;
        biometricTypes = bio.types;
      } else {
        try {
          const hardware = await LocalAuthentication.hasHardwareAsync();
          const enrolled = await LocalAuthentication.isEnrolledAsync();
          const types =
            await LocalAuthentication.supportedAuthenticationTypesAsync();
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
        biometricTypes,
      });

      await AsyncStorage.setItem(
        uidKey(Number(user.employee_id)),
        data.deviceUid,
      );
      if (Platform.OS === "web") {
        await AsyncStorage.setItem(
          secretKey(Number(user.employee_id)),
          data.deviceSecret,
        );
      } else {
        await SecureStore.setItemAsync(
          secretKey(Number(user.employee_id)),
          data.deviceSecret,
          requireBiometric
            ? {
                requireAuthentication: true,
                authenticationPrompt:
                  "Confirme sua biometria para proteger o Ponto Certo",
              }
            : {},
        );
      }

      setDeviceUid(data.deviceUid);
      Alert.alert(
        "Aparelho vinculado",
        requireBiometric
          ? "A credencial deste dispositivo agora está protegida pela biometria nativa."
          : deviceStatus?.policy?.employeeBiometricExempt
            ? "Aparelho vinculado. A biometria foi dispensada pelo RH para seu cadastro."
            : "Aparelho vinculado sem exigência de biometria.",
      );
      await loadDeviceStatus();
    } catch (e: any) {
      Alert.alert(
        "Vínculo do aparelho",
        e?.response?.data?.message ||
          e?.message ||
          "Não foi possível vincular o aparelho.",
      );
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
        locationMocked: geo.mocked,
      };

      const { data } = await api.post(
        "/time-entries/geofence-preview",
        payload,
      );
      const ref = data.reference;
      const source =
        ref?.source === "WORK_LOCATION"
          ? "Local de trabalho vinculado"
          : ref?.source === "COMPANY_DEFAULT"
            ? "Endereço padrão da empresa"
            : "Sem referência";

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
            : "Se você está no local e a distância continua alta, recalibre as coordenadas da empresa com “Usar localização atual exata” no dashboard.",
        ].join("\n"),
      );
    } catch (e: any) {
      Alert.alert(
        "Diagnóstico GPS",
        e?.response?.data?.message ||
          e?.message ||
          "Não foi possível executar o diagnóstico.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function openSelfieCamera() {
    if (!user?.employee_id || punchLock.current) return;
    punchLock.current = true;
    setLoading(true);
    try {
      if (requestKey.current && (await reconcile())) return;
      const fresh = await refresh();
      if (!fresh) {
        Alert.alert(
          "Atualização necessária",
          "Não foi possível verificar jornada e aparelho. Tente atualizar novamente.",
        );
        return;
      }
      if (fresh.schedule.decision === "BLOCKED" || fresh.schedule.complete) {
        Alert.alert(
          "Jornada",
          fresh.schedule.message ||
            "Todas as marcações previstas foram concluídas.",
        );
        return;
      }
      if (Platform.OS === "web" && fresh.device.policy.requireDeviceBiometric) {
        Alert.alert(
          "Use o aplicativo instalado",
          "Sua conta exige biometria nativa. Abra o Ponto Certo no Android ou consulte o RH.",
        );
        return;
      }
      if (
        (fresh.device.policy.requireRegisteredDevice ||
          fresh.device.policy.requireDeviceBiometric) &&
        !fresh.device.currentDevice
      ) {
        setSetup(true);
        return;
      }
      let granted = cameraPermission?.granted;
      if (!granted) {
        const permission = await requestCameraPermission();
        granted = permission.granted;
      }
      if (!granted) {
        Alert.alert(
          "Permita a câmera",
          "A câmera frontal é necessária para a foto da marcação. Libere o acesso nas configurações.",
          Platform.OS === "web"
            ? undefined
            : [
                {
                  text: "Abrir configurações",
                  onPress: () => {
                    void Linking.openSettings();
                  },
                },
                { text: "Agora não" },
              ],
        );
        return;
      }
      setClockStep("Verificando localização…");
      const geo = await getPunchLocation();
      const { data } = await api.post("/time-entries/geofence-preview", {
        ...geo,
        locationMocked: geo.mocked,
      });
      setGeoPreview(data);
      if (data.decision === "BLOCKED") {
        Alert.alert(
          "Localização",
          data.message || "Você está fora da área autorizada.",
        );
        return;
      }
      pendingGeo.current = { geo, at: Date.now() };
      setSelfieUri(null);
      setCameraOpen(true);
    } catch (e: any) {
      Alert.alert(
        "Preparar registro",
        e.response?.data?.message ||
          e.message ||
          "Não foi possível preparar a marcação.",
      );
    } finally {
      punchLock.current = false;
      setLoading(false);
      setClockStep(null);
    }
  }

  async function captureSelfie() {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.65,
        skipProcessing: false,
      });
      if (photo?.uri) setSelfieUri(photo.uri);
    } catch (e: any) {
      Alert.alert("Foto", e?.message || "Não foi possível capturar a foto.");
    } finally {
      setCapturing(false);
    }
  }

  async function startClock() {
    await openSelfieCamera();
  }

  async function confirmSelfieAndClock() {
    if (!selfieUri || !user?.employee_id || punchLock.current) return;
    punchLock.current = true;
    setLoading(true);
    setClockStep("Obtendo localização...");
    try {
      const geo =
        pendingGeo.current && Date.now() - pendingGeo.current.at < 30000
          ? pendingGeo.current.geo
          : await getPunchLocation();
      setClockStep("Validando segurança...");
      if (geo.mocked) {
        Alert.alert(
          "Localização simulada",
          "Foi detectado GPS simulado. O ponto foi bloqueado.",
        );
        return;
      }
      const maxAccuracy = deviceStatus?.policy?.maxGpsAccuracyMeters || 100;
      if (geo.accuracy != null && geo.accuracy > maxAccuracy) {
        Alert.alert(
          "GPS sem precisão suficiente",
          `Precisão atual: ${Math.round(geo.accuracy)} m. Aguarde até ${maxAccuracy} m ou menos.`,
        );
        return;
      }

      const requireDevice = Boolean(
        deviceStatus?.policy?.requireRegisteredDevice ||
        deviceStatus?.policy?.requireDeviceBiometric,
      );
      const requireBiometric = Boolean(
        deviceStatus?.policy?.requireDeviceBiometric,
      );
      let uid: string | null = null;
      let secret: string | null = null;

      if (requireDevice) {
        uid = await AsyncStorage.getItem(uidKey(Number(user.employee_id)));
        if (!uid) {
          Alert.alert(
            "Aparelho não vinculado",
            "Vincule o dispositivo em Perfil.",
          );
          return;
        }

        if (Platform.OS === "web") {
          if (requireBiometric) {
            Alert.alert(
              "Biometria necessária",
              "Este funcionário está configurado para exigir biometria nativa. Abra o aplicativo nativo para registrar ou consulte o RH sobre o acesso da sua conta.",
            );
            return;
          }
          secret = await AsyncStorage.getItem(
            secretKey(Number(user.employee_id)),
          );
        } else {
          secret = requireBiometric
            ? await SecureStore.getItemAsync(
                secretKey(Number(user.employee_id)),
                {
                  requireAuthentication: true,
                  authenticationPrompt:
                    "Confirme sua biometria para registrar o ponto",
                },
              )
            : await SecureStore.getItemAsync(
                secretKey(Number(user.employee_id)),
              );
        }

        if (!secret) {
          Alert.alert(
            requireBiometric
              ? "Credencial biométrica indisponível"
              : "Credencial do aparelho indisponível",
            requireBiometric
              ? "A biometria do aparelho pode ter sido alterada. Solicite ao RH a revogação deste dispositivo e faça um novo vínculo."
              : "Solicite ao RH a revogação deste dispositivo e faça um novo vínculo.",
          );
          return;
        }
      }

      if (!requestKey.current) {
        requestKey.current = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
        await AsyncStorage.setItem(
          `pc_pending_${user.employee_id}`,
          requestKey.current,
        );
      }
      const form = new FormData();
      form.append("requestKey", requestKey.current);
      form.append("source", Platform.OS === "web" ? "WEB" : "MOBILE");
      form.append("type", String(nextType || "OTHER"));
      form.append("latitude", String(geo.latitude));
      form.append("longitude", String(geo.longitude));
      if (geo.accuracy != null) form.append("accuracy", String(geo.accuracy));
      form.append("locationMocked", geo.mocked ? "true" : "false");
      if (uid) form.append("deviceUid", uid);
      if (secret) form.append("deviceSecret", secret);
      form.append(
        "biometricType",
        requireBiometric ? "DEVICE_BIOMETRIC" : "NOT_REQUIRED",
      );
      setClockStep("Preparando foto...");
      await appendSelfieToForm(form, selfieUri);

      setClockStep("Registrando ponto...");
      const { data } = await api.post("/time-entries/secure", form);

      await acceptReceipt(data);
    } catch (e: any) {
      if (!e.response || e.response.status >= 500) {
        if (await reconcile()) return;
        Alert.alert(
          "Confirmação pendente",
          "A resposta não chegou. Sua tentativa foi preservada. Toque em confirmar novamente para consultar ou reenviar a mesma operação com segurança.",
        );
        return;
      }
      const code = e?.response?.data?.code;
      Alert.alert(
        code === "GEOFENCE_BLOCKED"
          ? "Fora da área permitida"
          : code === "SELFIE_REQUIRED"
            ? "Foto obrigatória"
            : code?.startsWith("SCHEDULE")
              ? "Jornada bloqueada"
              : code?.startsWith("DEVICE")
                ? "Dispositivo bloqueado"
                : "Registro bloqueado",
        e?.response?.data?.message ||
          e?.message ||
          "Não foi possível registrar o ponto.",
      );
    } finally {
      punchLock.current = false;
      setClockStep(null);
      setLoading(false);
    }
  }

  if (!ready)
    return (
      <SafeAreaView style={[s.page, s.center]}>
        <ActivityIndicator />
        <Text style={s.body}>Preparando seu acesso…</Text>
      </SafeAreaView>
    );
  if (!token)
    return (
      <SafeAreaView style={s.page}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.loginContainer}
          >
            <View style={s.login}>
              <View style={s.logo}>
                <Text style={s.logoText}>PC</Text>
              </View>
              <Text accessibilityRole="header" style={s.title}>
                Sua jornada, em dia.
              </Text>
              <Text style={s.body}>
                Entre para registrar e acompanhar seu ponto.
              </Text>
              <Text style={s.label}>E-mail</Text>
              <TextInput
                accessibilityLabel="E-mail"
                autoComplete="email"
                textContentType="username"
                style={s.input}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                placeholder="voce@empresa.com"
              />
              <Text style={s.label}>Senha</Text>
              <TextInput
                accessibilityLabel="Senha"
                autoComplete="current-password"
                textContentType="password"
                style={s.input}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={login}
              />
              <Action
                secondary
                label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                onPress={() => setShowPassword(!showPassword)}
              />
              <Action
                label={loading ? "Entrando…" : "Entrar"}
                disabled={loading}
                onPress={login}
              />
              <Action
                secondary
                label="Preciso recuperar meu acesso"
                onPress={() =>
                  Alert.alert(
                    "Recuperar acesso",
                    "Solicite ao RH ou ao administrador a redefinição da senha. Informe seu e-mail de acesso; nunca envie sua senha.",
                  )
                }
              />
            </View>
            <PwaNotice busy={loading} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  if (!user)
    return (
      <SafeAreaView style={[s.page, s.center]}>
        <Text style={s.title}>Vamos reconectar</Text>
        <Text style={s.body}>{syncError || "Verificando sua sessão…"}</Text>
        <Action label="Tentar novamente" onPress={restoreSession} />
        <Action secondary label="Voltar ao acesso" onPress={logout} />
      </SafeAreaView>
    );
  const groups = history.reduce<Record<string, Entry[]>>((result, entry) => {
    const date = entry.registered_at.slice(0, 10);
    (result[date] ??= []).push(entry);
    return result;
  }, {});
  const refreshControl =
    Platform.OS !== "web" ? (
      <RefreshControl refreshing={syncing} onRefresh={() => void refresh()} />
    ) : undefined;
  function newAdjustment(entry?: Entry) {
    setAdjustment({
      timeEntryId: entry?.id || null,
      requestedTime: entry
        ? entry.registered_at.slice(0, 16).replace(" ", "T")
        : `${dayKey}T08:00`,
      entryType: entry?.entry_type || "CLOCK_IN",
      reason: "",
    });
  }
  return (
    <SafeAreaView style={s.page} edges={["top", "bottom"]}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>PONTO CERTO</Text>
          <Text style={s.hello}>Olá, {user.name?.split(" ")[0]}</Text>
          <Text numberOfLines={1} style={s.caption}>
            {user.company_name || "Sua jornada de trabalho"}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Atualizar dados"
          accessibilityState={{ disabled: syncing || loading }}
          disabled={syncing || loading}
          onPress={() => void refresh()}
          style={s.iconButton}
        >
          {syncing ? (
            <ActivityIndicator />
          ) : (
            <Ionicons name="refresh-outline" size={24} color="#244a7d" />
          )}
        </Pressable>
      </View>
      {!!syncError && (
        <View style={s.errorBanner} accessibilityRole="alert">
          <Text style={s.errorText}>{syncError}</Text>
          <Action
            secondary
            label="Tentar atualizar"
            onPress={() => void refresh()}
            disabled={syncing || loading}
          />
        </View>
      )}
      {tab === "home" && (
        <ScrollView
          refreshControl={refreshControl}
          contentContainerStyle={s.content}
        >
          <PwaNotice busy={loading || cameraOpen} />
          {(mustBind || setup || unsupported) && (
            <View style={s.setupCard}>
              <Text accessibilityRole="header" style={s.cardTitle}>
                Prepare seu primeiro registro
              </Text>
              <Text style={s.body}>
                {unsupported
                  ? "Sua conta exige biometria no aplicativo instalado. Consulte o RH para obter o acesso ao Ponto Certo Android."
                  : "São três cuidados para registrar: permitir câmera e GPS, vincular o aparelho quando exigido e confirmar sua jornada."}
              </Text>
              <Info
                label="1 · Câmera"
                value={
                  cameraPermission?.granted
                    ? "Permitida"
                    : "Autorize para capturar a selfie"
                }
              />
              <Info
                label="2 · Aparelho"
                value={
                  deviceStatus?.currentDevice
                    ? "Vinculado"
                    : mustBind
                      ? "Vínculo necessário"
                      : "Vínculo não exigido"
                }
              />
              <Info
                label="3 · Jornada"
                value={
                  scheduleContext?.scheduleText || "Atualize para consultar"
                }
              />
              {!unsupported && (
                <>
                  <Action
                    secondary
                    label="Permitir câmera"
                    disabled={loading}
                    onPress={async () => {
                      const result = await requestCameraPermission();
                      if (!result.granted)
                        Alert.alert(
                          "Permissão de câmera",
                          "Libere o acesso nas configurações do navegador ou do aparelho.",
                        );
                    }}
                  />
                  {mustBind && (
                    <Action
                      label="Vincular este aparelho"
                      disabled={loading || !contextReady}
                      onPress={registerDevice}
                    />
                  )}
                  <Action
                    secondary
                    label="Verificar localização"
                    disabled={loading || !contextReady}
                    onPress={diagnoseGps}
                  />
                  {!mustBind && (
                    <Action
                      secondary
                      label="Configuração concluída"
                      onPress={() => setSetup(false)}
                    />
                  )}
                </>
              )}
            </View>
          )}
          <View style={s.clockCard}>
            <Text style={s.caption}>
              {now.toLocaleDateString("pt-BR", {
                timeZone: "America/Sao_Paulo",
                weekday: "long",
                day: "2-digit",
                month: "long",
              })}
            </Text>
            <Text style={s.clock}>
              {now.toLocaleTimeString("pt-BR", {
                timeZone: "America/Sao_Paulo",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
            <Text style={s.caption}>
              Referência do aparelho · horário de Brasília
            </Text>
            <View style={s.statusPill}>
              <Text style={s.statusText}>
                {!contextReady
                  ? "Atualização necessária"
                  : scheduleContext?.complete
                    ? "Jornada concluída"
                    : scheduleContext?.decision === "BLOCKED"
                      ? "Fora da janela de registro"
                      : mustBind
                        ? "Conclua a configuração"
                        : "Pronto para iniciar"}
              </Text>
            </View>
            <Text style={s.body}>
              {scheduleContext?.scheduleText ||
                "Consulte a jornada antes de registrar."}
            </Text>
            {scheduleContext?.decision === "BLOCKED" && (
              <Text style={s.errorText}>{scheduleContext.message}</Text>
            )}
            <Action
              icon="finger-print-outline"
              label={
                clockStep ||
                (!contextReady
                  ? "Atualize para registrar"
                  : scheduleContext?.complete
                    ? "Jornada concluída"
                    : actionLabel[nextType] || "Registrar ponto")
              }
              disabled={
                loading ||
                !contextReady ||
                unsupported ||
                scheduleContext?.complete ||
                scheduleContext?.decision === "BLOCKED"
              }
              onPress={startClock}
            />
            <Text style={s.caption}>
              Selfie e localização verificadas no registro. O horário confirmado
              vem do servidor.
            </Text>
            {requestKey.current && (
              <Action
                secondary
                label="Consultar confirmação pendente"
                disabled={loading}
                onPress={async () => {
                  setLoading(true);
                  try {
                    if (!(await reconcile()))
                      Alert.alert(
                        "Confirmação pendente",
                        "Ainda não foi possível confirmar. Sua próxima tentativa usará o mesmo identificador para evitar duplicidade.",
                      );
                  } finally {
                    setLoading(false);
                  }
                }}
              />
            )}
          </View>
          {receipt && (
            <View style={s.receipt} accessibilityLiveRegion="polite">
              <Ionicons name="checkmark-circle" size={32} color="#176847" />
              <Text style={s.cardTitle}>Ponto confirmado</Text>
              <Text style={s.body}>
                {typeLabel[receipt.entry_type]} ·{" "}
                {brDate(receipt.registered_at)} às {time(receipt.registered_at)}
              </Text>
              <Text style={s.caption}>
                Registro #{receipt.id} · horário confirmado pelo servidor
              </Text>
              <Action
                secondary
                label="Ver detalhes"
                onPress={() => setDetail(receipt)}
              />
            </View>
          )}
          <View style={s.card}>
            <Text accessibilityRole="header" style={s.cardTitle}>
              Marcações de hoje
            </Text>
            {entries.length === 0 ? (
              <Text style={s.body}>
                {syncError
                  ? "Sem dados confirmados nesta consulta."
                  : syncing
                    ? "Consultando marcações…"
                    : "Sua primeira marcação aparecerá aqui."}
              </Text>
            ) : (
              entries.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  onPress={() => setDetail(entry)}
                />
              ))
            )}
            <Action
              secondary
              label="Consultar histórico"
              onPress={() => navigate("history")}
            />
          </View>
          {geoPreview && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Última verificação de local</Text>
              <Text style={s.body}>
                {geoPreview.reference?.name || "Local da empresa"}
              </Text>
              <Text style={s.caption}>
                {geoPreview.distanceMeters != null
                  ? `${Math.round(geoPreview.distanceMeters)} m do centro autorizado. `
                  : ""}
                Nova validação ocorre ao registrar.
              </Text>
            </View>
          )}
          {lastSync && (
            <Text style={s.caption}>
              Última consulta: {new Date(lastSync).toLocaleString("pt-BR")}
            </Text>
          )}
        </ScrollView>
      )}
      {tab === "history" && (
        <ScrollView
          refreshControl={refreshControl}
          contentContainerStyle={s.content}
        >
          <Text accessibilityRole="header" style={s.title}>
            Seu histórico
          </Text>
          <Text style={s.body}>
            Confira os registros e acompanhe pedidos de ajuste.
          </Text>
          <View style={s.segment}>
            {[7, 15, 30, 60].map((days) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: days === historyDays }}
                key={days}
                onPress={() => setHistoryDays(days)}
                style={[
                  s.segmentButton,
                  days === historyDays && s.segmentActive,
                ]}
              >
                <Text style={days === historyDays ? s.white : s.label}>
                  {days} dias
                </Text>
              </Pressable>
            ))}
          </View>
          <Action
            secondary
            label="Solicitar marcação ausente"
            onPress={() => newAdjustment()}
          />
          {Object.entries(groups).map(([day, items]) => (
            <View key={day} style={s.card}>
              <Text style={s.cardTitle}>
                {brDate(day)} · {items.length} marcações
              </Text>
              {items.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  onPress={() => setDetail(entry)}
                />
              ))}
            </View>
          ))}
          {history.length === 0 && (
            <Text style={s.body}>
              {syncError
                ? "Não foi possível consultar os registros."
                : syncing
                  ? "Carregando histórico…"
                  : "Nenhum registro neste período."}
            </Text>
          )}
          <View style={s.card}>
            <Text style={s.cardTitle}>Suas solicitações</Text>
            {!!adjustmentsError && (
              <Text style={s.errorText}>{adjustmentsError}</Text>
            )}
            {adjustments.length === 0 ? (
              <Text style={s.body}>
                Você ainda não tem solicitações carregadas.
              </Text>
            ) : (
              adjustments.map((item) => (
                <View key={item.id} style={s.info}>
                  <Text style={s.label}>
                    {brDate(item.requested_time)} às {time(item.requested_time)}{" "}
                    ·{" "}
                    {item.status === "PENDING"
                      ? "Em análise"
                      : item.status === "APPROVED"
                        ? "Aprovada"
                        : "Rejeitada"}
                  </Text>
                  <Text style={s.body}>{item.reason}</Text>
                  {item.review_note && (
                    <Text style={s.caption}>
                      Resposta do RH: {item.review_note}
                    </Text>
                  )}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
      {tab === "profile" && (
        <ScrollView contentContainerStyle={s.content}>
          <Text accessibilityRole="header" style={s.title}>
            Seu perfil
          </Text>
          <View style={s.card}>
            <Info label="Nome" value={user.name} />
            <Info label="Empresa" value={user.company_name} />
            <Info label="Matrícula" value={user.registration_number} />
            <Info label="Cargo" value={user.position_name} />
            <Info label="E-mail" value={user.email} />
          </View>
          <View style={s.card}>
            <Text style={s.cardTitle}>Aparelho e permissões</Text>
            <Info
              label="Vínculo"
              value={
                deviceStatus?.currentDevice
                  ? "Este aparelho está vinculado"
                  : "Sem vínculo confirmado"
              }
            />
            <Info
              label="Biometria"
              value={
                deviceStatus?.policy.requireDeviceBiometric
                  ? "Exigida no aplicativo nativo"
                  : "Não exigida para este cadastro"
              }
            />
            {mustBind && (
              <Action
                label="Vincular este aparelho"
                disabled={loading || !contextReady}
                onPress={registerDevice}
              />
            )}
            <Action
              secondary
              label="Revisar configuração inicial"
              onPress={() => {
                setSetup(true);
                navigate("home");
              }}
            />
            {Platform.OS !== "web" && (
              <Action
                secondary
                label="Abrir permissões do aparelho"
                onPress={() => Linking.openSettings()}
              />
            )}
            <Text style={s.caption}>
              Sua impressão digital e seu rosto biométrico ficam no sistema do
              aparelho. A selfie é uma foto separada, enviada como evidência da
              marcação.
            </Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardTitle}>Local e jornada</Text>
            <Info
              label="Endereço da empresa"
              value={
                deviceStatus?.policy.address ||
                "Consulte os locais autorizados com o RH"
              }
            />
            <Info
              label="Raio padrão da empresa"
              value={
                deviceStatus
                  ? `${deviceStatus.policy.punchRadiusMeters} m`
                  : "Aguardando consulta"
              }
            />
            <Info
              label="Jornada"
              value={scheduleContext?.scheduleText || "Não consultada"}
            />
            <Text style={s.caption}>
              Locais vinculados ao funcionário podem ter prioridade sobre o
              endereço padrão.
            </Text>
            <Action
              secondary
              label="Verificar GPS e local autorizado"
              disabled={loading || !contextReady}
              onPress={diagnoseGps}
            />
          </View>
          <Action
            secondary
            label="Ajuda com meu acesso"
            onPress={() =>
              Alert.alert(
                "Ajuda com o acesso",
                "Para trocar sua senha ou vincular um novo aparelho, solicite ao RH a atualização do seu cadastro. Nunca compartilhe sua senha.",
              )
            }
          />
          <Action
            secondary
            label="Sair da conta"
            disabled={loading}
            onPress={logout}
          />
        </ScrollView>
      )}
      <View style={s.tabs} accessibilityRole="tablist">
        {(
          [
            { id: "home", label: "Ponto", icon: "time-outline" },
            { id: "history", label: "Histórico", icon: "calendar-outline" },
            { id: "profile", label: "Perfil", icon: "person-outline" },
          ] as const
        ).map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{
              selected: tab === item.id,
              disabled: loading,
            }}
            disabled={loading}
            style={s.tab}
            onPress={() => navigate(item.id)}
          >
            <Ionicons
              name={item.icon}
              size={24}
              color={tab === item.id ? "#244a7d" : "#65748a"}
            />
            <Text style={[s.tabText, tab === item.id && s.tabActive]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Modal
        visible={cameraOpen}
        animationType="slide"
        onRequestClose={() => {
          if (!loading && !capturing) {
            setCameraOpen(false);
            setSelfieUri(null);
          }
        }}
      >
        <SafeAreaView style={s.cameraPage}>
          <View style={s.cameraHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.cameraTitle}>
                {selfieUri ? "Confira sua foto" : "Foto para o registro"}
              </Text>
              <Text style={s.cameraSub}>
                {selfieUri
                  ? "Confirme para validar e registrar sua marcação."
                  : "Enquadre seu rosto em um local bem iluminado."}
              </Text>
            </View>
            <Pressable
              disabled={loading || capturing}
              accessibilityRole="button"
              accessibilityLabel="Cancelar foto"
              style={s.iconButton}
              onPress={() => {
                setCameraOpen(false);
                setSelfieUri(null);
              }}
            >
              <Ionicons name="close" size={28} color="white" />
            </Pressable>
          </View>
          <View style={s.cameraWrap}>
            {selfieUri ? (
              <Image
                source={{ uri: selfieUri }}
                style={{ flex: 1 }}
                resizeMode="contain"
                accessibilityLabel="Prévia da selfie"
              />
            ) : (
              <>
                <CameraView
                  ref={cameraRef}
                  style={{ flex: 1 }}
                  facing="front"
                  mirror
                />
                <View pointerEvents="none" style={s.faceGuide}>
                  <View style={s.faceOval} />
                </View>
              </>
            )}
          </View>
          <View style={s.cameraActions}>
            {selfieUri ? (
              <>
                <Action
                  secondary
                  label="Tirar outra foto"
                  disabled={loading}
                  onPress={() => setSelfieUri(null)}
                />
                <Action
                  label={clockStep || "Confirmar e registrar ponto"}
                  disabled={loading}
                  onPress={confirmSelfieAndClock}
                />
              </>
            ) : (
              <Action
                icon="camera-outline"
                label={capturing ? "Capturando…" : "Tirar foto"}
                disabled={capturing}
                onPress={captureSelfie}
              />
            )}
          </View>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={!!detail}
        animationType="slide"
        onRequestClose={() => setDetail(null)}
      >
        <SafeAreaView style={s.page}>
          <ScrollView contentContainerStyle={s.content}>
            <Text style={s.title}>Detalhes do registro</Text>
            {detail && (
              <View style={s.card}>
                <Info label="Identificador" value={`#${detail.id}`} />
                <Info label="Marcação" value={typeLabel[detail.entry_type]} />
                <Info
                  label="Horário confirmado"
                  value={`${brDate(detail.registered_at)} às ${time(detail.registered_at)}`}
                />
                <Info
                  label="Origem"
                  value={
                    detail.manually_adjusted
                      ? "Ajuste identificado pelo RH"
                      : detail.source === "WEB"
                        ? "Navegador"
                        : "Aplicativo"
                  }
                />
                <Info
                  label="Selfie"
                  value={
                    detail.has_selfie
                      ? "Foto vinculada à marcação"
                      : "Consulte as evidências com o RH"
                  }
                />
                <Action
                  secondary
                  label="Solicitar ajuste deste registro"
                  onPress={() => {
                    newAdjustment(detail);
                    setDetail(null);
                  }}
                />
              </View>
            )}
            <Action label="Voltar" onPress={() => setDetail(null)} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={!!adjustment}
        animationType="slide"
        onRequestClose={() => {
          if (!loading) setAdjustment(null);
        }}
      >
        <SafeAreaView style={s.page}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={s.content}
            >
              <Text style={s.title}>Solicitar ajuste</Text>
              <Text style={s.body}>
                Explique o que precisa ser corrigido. O RH analisará antes de
                alterar o ponto.
              </Text>
              {adjustment && (
                <>
                  <DateTimeField
                    value={adjustment.requestedTime}
                    onChange={(requestedTime) =>
                      setAdjustment({ ...adjustment, requestedTime })
                    }
                  />
                  <Text style={s.label}>Tipo da marcação</Text>
                  <View style={s.segment}>
                    {Object.entries(typeLabel)
                      .filter(([key]) => key !== "OTHER")
                      .map(([key, label]) => (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{
                            selected: key === adjustment.entryType,
                          }}
                          key={key}
                          style={[
                            s.segmentButton,
                            key === adjustment.entryType && s.segmentActive,
                          ]}
                          onPress={() =>
                            setAdjustment({ ...adjustment, entryType: key })
                          }
                        >
                          <Text
                            style={
                              key === adjustment.entryType ? s.white : s.label
                            }
                          >
                            {label}
                          </Text>
                        </Pressable>
                      ))}
                  </View>
                  <Text style={s.label}>Justificativa</Text>
                  <TextInput
                    accessibilityLabel="Justificativa do ajuste"
                    multiline
                    maxLength={500}
                    style={[
                      s.input,
                      { minHeight: 120, textAlignVertical: "top" },
                    ]}
                    value={adjustment.reason}
                    onChangeText={(reason) =>
                      setAdjustment({ ...adjustment, reason })
                    }
                    placeholder="Descreva o motivo do ajuste"
                  />
                  <Action
                    label={loading ? "Enviando…" : "Enviar ao RH"}
                    disabled={loading}
                    onPress={saveAdjustment}
                  />
                  <Action
                    secondary
                    label="Cancelar"
                    disabled={loading}
                    onPress={() => setAdjustment(null)}
                  />
                </>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
function Action({
  label,
  onPress,
  disabled = false,
  secondary = false,
  icon,
}: {
  label: string;
  onPress: () => unknown;
  disabled?: boolean;
  secondary?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.action,
        secondary ? s.secondary : s.primary,
        disabled && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
      ]}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={24}
          color={secondary ? "#244a7d" : "white"}
        />
      )}
      <Text style={[s.actionText, secondary ? { color: "#244a7d" } : s.white]}>
        {label}
      </Text>
    </Pressable>
  );
}
function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={s.info}>
      <Text style={s.caption}>{label}</Text>
      <Text style={s.label}>{value || "Não informado"}</Text>
    </View>
  );
}
function EntryRow({ entry, onPress }: { entry: Entry; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${typeLabel[entry.entry_type]}, ${time(entry.registered_at)}. Ver detalhes`}
      style={s.entry}
      onPress={onPress}
    >
      <Ionicons name="checkmark-circle-outline" size={24} color="#176847" />
      <View style={{ flex: 1 }}>
        <Text style={s.label}>{typeLabel[entry.entry_type] || "Marcação"}</Text>
        <Text style={s.caption}>
          {entry.manually_adjusted ? "Ajustado pelo RH" : "Registro confirmado"}
        </Text>
      </View>
      <Text style={s.entryTime}>{time(entry.registered_at)}</Text>
      <Ionicons name="chevron-forward" size={18} color="#65748a" />
    </Pressable>
  );
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f4f7fb" },
  center: { justifyContent: "center", padding: 24, gap: 18 },
  content: {
    padding: 20,
    gap: 16,
    paddingBottom: 28,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  loginContainer: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
    gap: 16,
  },
  login: {
    backgroundColor: "white",
    borderRadius: 24,
    padding: 24,
    gap: 12,
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
  },
  logo: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: "#244a7d",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  logoText: { color: "white", fontSize: 22, fontWeight: "900" },
  title: { fontSize: 28, fontWeight: "800", color: "#172033" },
  body: { fontSize: 16, lineHeight: 24, color: "#43536a" },
  label: { fontSize: 15, lineHeight: 22, fontWeight: "600", color: "#263b56" },
  caption: { fontSize: 13, lineHeight: 20, color: "#596b82" },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: "#526681",
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#bccbdd",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: "#172033",
    backgroundColor: "white",
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  hello: {
    fontSize: 22,
    fontWeight: "800",
    color: "#172033",
    marginVertical: 3,
  },
  iconButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  errorBanner: { backgroundColor: "#fff0df", padding: 14, gap: 8 },
  errorText: { fontSize: 14, lineHeight: 21, color: "#913b26" },
  setupCard: {
    backgroundColor: "#eaf1fc",
    borderWidth: 1,
    borderColor: "#cadcf3",
    borderRadius: 20,
    padding: 20,
    gap: 10,
  },
  cardTitle: { fontSize: 19, fontWeight: "800", color: "#172033" },
  clockCard: {
    backgroundColor: "white",
    borderRadius: 24,
    padding: 24,
    gap: 12,
    borderWidth: 1,
    borderColor: "#e0e7f1",
  },
  clock: {
    fontSize: 56,
    fontWeight: "800",
    color: "#172033",
    fontVariant: ["tabular-nums"],
  },
  statusPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#edf3fb",
  },
  statusText: { fontSize: 13, color: "#244a7d", fontWeight: "700" },
  action: {
    minHeight: 52,
    borderRadius: 13,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  primary: { backgroundColor: "#244a7d" },
  secondary: {
    backgroundColor: "#edf3fb",
    borderWidth: 1,
    borderColor: "#d0def0",
  },
  actionText: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    flexShrink: 1,
  },
  white: { color: "white", fontWeight: "700" },
  receipt: {
    backgroundColor: "#e9f7ef",
    borderColor: "#b9ddc9",
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    gap: 10,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: "#e0e7f1",
  },
  info: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e8edf4",
    gap: 3,
  },
  entry: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e8edf4",
    paddingVertical: 12,
  },
  entryTime: { fontSize: 19, fontWeight: "800", color: "#172033" },
  segment: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  segmentButton: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#e6edf7",
    justifyContent: "center",
  },
  segmentActive: { backgroundColor: "#244a7d" },
  tabs: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#dce5f0",
    backgroundColor: "white",
    paddingVertical: 8,
  },
  tab: {
    flex: 1,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  tabText: { fontSize: 13, color: "#596b82" },
  tabActive: { fontWeight: "800", color: "#244a7d" },
  cameraPage: { flex: 1, backgroundColor: "#101c30" },
  cameraHeader: { padding: 18, flexDirection: "row", gap: 10 },
  cameraTitle: { fontSize: 23, fontWeight: "800", color: "white" },
  cameraSub: { fontSize: 14, lineHeight: 20, color: "#c9d7e9", marginTop: 6 },
  cameraWrap: {
    flex: 1,
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#080d16",
    minHeight: 100,
  },
  faceGuide: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  faceOval: {
    width: "65%",
    height: "75%",
    maxHeight: 340,
    maxWidth: 260,
    borderRadius: 160,
    borderWidth: 2,
    borderColor: "white",
  },
  cameraActions: { padding: 18, gap: 10 },
});
