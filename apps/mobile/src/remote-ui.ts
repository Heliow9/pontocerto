export type RemoteClockVisibilityInput = {
  online: boolean;
  policyEnabled: boolean;
  offlineEnabled: boolean;
  pendingCount: number;
};

export function remoteClockVisibility({
  online,
  policyEnabled,
  offlineEnabled,
  pendingCount,
}: RemoteClockVisibilityInput) {
  const showCapture = !online && policyEnabled && offlineEnabled;
  const showCard = pendingCount > 0 || (!online && policyEnabled);
  return { showCard, showCapture };
}
