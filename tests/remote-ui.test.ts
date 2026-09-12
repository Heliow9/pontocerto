import { describe, expect, it } from "vitest";
import { remoteClockVisibility } from "../apps/mobile/src/remote-ui";

describe("remote clock visibility", () => {
  it("hides the offline card while online when there are no pending punches", () => {
    expect(
      remoteClockVisibility({
        online: true,
        policyEnabled: true,
        offlineEnabled: true,
        pendingCount: 0,
      }),
    ).toEqual({ showCard: false, showCapture: false });
  });

  it("shows offline capture only when internet is absent and offline is enabled", () => {
    expect(
      remoteClockVisibility({
        online: false,
        policyEnabled: true,
        offlineEnabled: true,
        pendingCount: 0,
      }),
    ).toEqual({ showCard: true, showCapture: true });
  });

  it("keeps pending queue status visible online without exposing capture", () => {
    expect(
      remoteClockVisibility({
        online: true,
        policyEnabled: true,
        offlineEnabled: true,
        pendingCount: 1,
      }),
    ).toEqual({ showCard: true, showCapture: false });
  });
});
