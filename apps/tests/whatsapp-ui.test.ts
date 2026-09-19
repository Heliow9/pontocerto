import { describe, expect, it } from "vitest";
import { whatsappActionVisibility } from "../apps/web/src/components/whatsapp-ui";

describe("WhatsApp action visibility", () => {
  it("shows only disconnect when already connected", () => {
    expect(whatsappActionVisibility("CONNECTED", true)).toEqual({
      showConnect: false,
      showDisconnect: true,
    });
  });

  it("shows only connect when disconnected", () => {
    expect(whatsappActionVisibility("DISCONNECTED", true)).toEqual({
      showConnect: true,
      showDisconnect: false,
    });
  });

  it("does not offer a second connect while pairing or reconnecting", () => {
    for (const state of ["CONNECTING", "QR", "RECONNECTING"] as const) {
      expect(whatsappActionVisibility(state, true)).toEqual({
        showConnect: false,
        showDisconnect: true,
      });
    }
  });

  it("shows no actions while the service is not ready", () => {
    expect(whatsappActionVisibility("CONNECTED", false)).toEqual({
      showConnect: false,
      showDisconnect: false,
    });
  });
});
