import { describe, expect, it } from "vitest";
import {
  consolidateOvertimeAlertMessage,
  receiptState,
  retryDelaySeconds,
  WHATSAPP_MAX_MESSAGES_PER_HOUR,
  WHATSAPP_MIN_RECIPIENT_INTERVAL_SECONDS,
} from "../apps/api/src/services/whatsapp-delivery-rules";

describe("regras de entrega do WhatsApp", () => {
  it("consolida 50, 100 e OVER em uma única mensagem", () => {
    const base =
      "PontoCerto — Horas extras\nEmpresa: Empresa Demo\nFuncionário: Funcionário Demo\nGrupo: Sem grupo\nCompetência: 2026-09\nAcumulado: 1h59 de 1h00 (198%)";
    const message = consolidateOvertimeAlertMessage([
      { threshold_key: "50", message_text: `${base}\nMarco de 50% atingido. O registro de ponto permanece liberado.` },
      { threshold_key: "100", message_text: `${base}\nMarco de 100% atingido. O registro de ponto permanece liberado.` },
      { threshold_key: "OVER", message_text: `${base}\nReferência ultrapassada. O registro de ponto permanece liberado.` },
    ]);
    expect(message).toContain("Marcos atingidos nesta atualização: 50%, 100% e referência ultrapassada.");
    expect(message.match(/PontoCerto — Horas extras/g)).toHaveLength(1);
  });

  it("mantém a mensagem original quando existe um único marco", () => {
    const text = "PontoCerto — Horas extras\nMarco de 50% atingido.";
    expect(
      consolidateOvertimeAlertMessage([
        { threshold_key: "50", message_text: text },
      ]),
    ).toBe(text);
  });

  it("interpreta recibo de entrega e leitura", () => {
    expect(receiptState({ receiptTimestamp: 123 })).toBe("DELIVERED");
    expect(receiptState({ readTimestamp: 456 })).toBe("READ");
    expect(receiptState({})).toBeNull();
  });

  it("aplica backoff crescente e limitado", () => {
    expect(retryDelaySeconds(0)).toBe(30);
    expect(retryDelaySeconds(1)).toBe(120);
    expect(retryDelaySeconds(2)).toBe(300);
    expect(retryDelaySeconds(10)).toBe(900);
  });

  it("mantém os limites conservadores definidos para o worker", () => {
    expect(WHATSAPP_MIN_RECIPIENT_INTERVAL_SECONDS).toBe(30);
    expect(WHATSAPP_MAX_MESSAGES_PER_HOUR).toBe(10);
  });
});
