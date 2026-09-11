import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { api } from "./api";

export async function pushDeviceKey() {
  let key = await AsyncStorage.getItem("pc_push_device");
  if (!key) {
    key = `push-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    await AsyncStorage.setItem("pc_push_device", key);
  }
  return key;
}
function webSupported() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}
export async function reminderStatus() {
  const { data } = await api.get("/notifications/settings");
  const key = await pushDeviceKey();
  let permitted = false,
    supported = true;
  if (Platform.OS === "web") {
    supported = webSupported();
    permitted = supported && Notification.permission === "granted";
  } else {
    const notifications = await import("expo-notifications");
    permitted = (await notifications.getPermissionsAsync()).granted;
  }
  const serverEnabled = Boolean(
    data.subscriptions.find((s: any) => s.device_key === key && s.enabled),
  );
  return {
    enabled: permitted && serverEnabled,
    serverEnabled,
    supported,
    ready: Platform.OS === "web" ? data.webReady : data.workerEnabled,
    publicKey: data.publicKey,
  };
}
export async function enableReminders() {
  const permissionPromise =
    Platform.OS === "web" && webSupported()
      ? Notification.requestPermission()
      : null;
  const key = await pushDeviceKey();
  if (Platform.OS === "web") {
    if (!webSupported())
      throw new Error(
        "Este navegador não oferece notificações aqui. Use uma conexão HTTPS; no iPhone, instale o PWA na tela inicial e abra por ela.",
      );
    // Request permission directly from the user's button gesture.
    const permission = await permissionPromise;
    if (permission !== "granted")
      throw new Error(
        "Permita as notificações nas configurações deste site e tente novamente.",
      );
    const { data } = await api.get("/notifications/settings");
    if (!data.webReady || !data.publicKey)
      throw new Error(
        "O servidor ainda precisa habilitar os lembretes. Avise o responsável pelo sistema.",
      );
    await navigator.serviceWorker.register("/sw.js");
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                "Atualize o aplicativo e tente habilitar os lembretes novamente.",
              ),
            ),
          15000,
        ),
      ),
    ]);
    const normalized = data.publicKey.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(
      atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4)),
      (c) => c.charCodeAt(0),
    );
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription)
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytes,
      });
    await api.put("/notifications/subscription", {
      deviceKey: key,
      kind: "WEB",
      subscription: subscription.toJSON(),
    });
  } else {
    const notifications = await import("expo-notifications");
    if (Platform.OS === "android")
      await notifications.setNotificationChannelAsync("ponto-reminders", {
        name: "Lembretes de ponto",
        importance: notifications.AndroidImportance.HIGH,
        sound: "default",
        vibrationPattern: [0, 200, 100, 200],
      });
    const permission = await notifications.requestPermissionsAsync();
    if (!permission.granted)
      throw new Error(
        "Permita notificações para o Ponto Certo nas configurações do aparelho.",
      );
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId;
    if (!projectId)
      throw new Error(
        "Este aplicativo precisa de uma atualização para receber lembretes. Solicite ao RH a versão com notificações.",
      );
    const token = await notifications.getExpoPushTokenAsync({ projectId });
    await api.put("/notifications/subscription", {
      deviceKey: key,
      kind: "EXPO",
      token: token.data,
    });
  }
}
export async function disableReminders(timeout = 30000) {
  const key = await pushDeviceKey();
  if (Platform.OS === "web" && webSupported()) {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  }
  await api.delete(`/notifications/subscription/${key}`, { timeout });
}
export async function listenToReminders(onOpen: () => void) {
  if (Platform.OS === "web") return () => {};
  const notifications = await import("expo-notifications");
  notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const fresh =
        Number(notification.request.content.data?.expiresAt || 0) > Date.now();
      return {
        shouldPlaySound: fresh,
        shouldSetBadge: false,
        shouldShowBanner: fresh,
        shouldShowList: fresh,
      };
    },
  });
  const listener = notifications.addNotificationResponseReceivedListener(() =>
    onOpen(),
  );
  if (await notifications.getLastNotificationResponseAsync()) {
    onOpen();
    await notifications.clearLastNotificationResponseAsync();
  }
  return () => listener.remove();
}
