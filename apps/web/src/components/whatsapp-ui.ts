const disconnectableStates = new Set([
  "CONNECTING",
  "QR",
  "CONNECTED",
  "RECONNECTING",
  "ERROR",
  "AUTH_ERROR",
]);

export function whatsappActionVisibility(state: string, ready: boolean) {
  if (!ready) return { showConnect: false, showDisconnect: false };
  return {
    showConnect: ["DISCONNECTED", "LOGGED_OUT"].includes(state),
    showDisconnect: disconnectableStates.has(state),
  };
}
