import { randomBytes } from "node:crypto";
import {
  hashControlIdSecret,
  normalizeControlIdSerial,
  readBearerToken,
} from "./control-id-core.js";

export type ControlIdTerminalChannel = "PUSH" | "MONITOR";

export type StoredControlIdTerminal = {
  id: number;
  tenantId: number;
  companyId: number;
  companyName?: string;
  name: string;
  serialNumber: string;
  vendorDeviceId: string;
  credentialHash: string;
  status: string;
  active: boolean;
};

export type ControlIdTerminalStore = {
  findCompany(
    tenantId: number,
    companyId: number,
  ): Promise<{ id: number; active: boolean; name: string } | null>;
  findActiveByCompany(
    tenantId: number,
    companyId: number,
  ): Promise<StoredControlIdTerminal | null>;
  insertTerminal(input: {
    tenantId: number;
    companyId: number;
    name: string;
    serialNumber: string;
    vendorDeviceId: string;
    credentialHash: string;
    status: "PENDING";
    actorUserId: number;
  }): Promise<StoredControlIdTerminal>;
  findByCredentialHash(hash: string): Promise<StoredControlIdTerminal | null>;
  touchTerminal(id: number, channel: ControlIdTerminalChannel): Promise<void>;
};

function failure(message: string, status: number, code: string) {
  return Object.assign(new Error(message), { status, code });
}

function normalizeDeviceId(value: unknown) {
  const id = String(value ?? "").trim();
  if (!/^\d{1,20}$/.test(id))
    throw failure("Identificador do equipamento inválido.", 400, "CONTROL_ID_DEVICE_INVALID");
  return id;
}

export async function createControlIdTerminal(args: {
  store: ControlIdTerminalStore;
  tenantId: number;
  actorUserId: number;
  companyId: number;
  name: string;
  serialNumber: string;
  vendorDeviceId: string;
  pepper: string;
  createSecret?: () => string;
}) {
  const company = await args.store.findCompany(args.tenantId, args.companyId);
  if (!company?.active)
    throw failure("Empresa não encontrada ou inativa.", 404, "CONTROL_ID_COMPANY_NOT_FOUND");
  if (await args.store.findActiveByCompany(args.tenantId, args.companyId))
    throw failure(
      "Esta empresa já possui um equipamento Control iD ativo.",
      409,
      "CONTROL_ID_TERMINAL_EXISTS",
    );
  const name = args.name.trim();
  if (name.length < 2 || name.length > 120)
    throw failure("Informe um nome válido para o equipamento.", 400, "CONTROL_ID_NAME_INVALID");
  const serialNumber = normalizeControlIdSerial(args.serialNumber);
  const vendorDeviceId = normalizeDeviceId(args.vendorDeviceId);
  const credential = (args.createSecret ?? (() => randomBytes(32).toString("hex")))();
  if (!/^[a-f0-9]{64}$/i.test(credential))
    throw failure("Falha ao gerar credencial do equipamento.", 500, "CONTROL_ID_SECRET_INVALID");
  const stored = await args.store.insertTerminal({
    tenantId: args.tenantId,
    companyId: args.companyId,
    name,
    serialNumber,
    vendorDeviceId,
    credentialHash: hashControlIdSecret(credential.toLowerCase(), args.pepper),
    status: "PENDING",
    actorUserId: args.actorUserId,
  });
  return {
    credential: credential.toLowerCase(),
    terminal: {
      id: stored.id,
      companyId: args.companyId,
      companyName: company.name,
      name,
      serialNumber,
      vendorDeviceId,
      status: "PENDING" as const,
    },
  };
}

export async function resolveControlIdTerminal(args: {
  store: ControlIdTerminalStore;
  authorization: unknown;
  vendorDeviceId: unknown;
  pepper: string;
  channel: ControlIdTerminalChannel;
}) {
  const token = readBearerToken(args.authorization);
  if (!token)
    throw failure("Credencial do equipamento inválida.", 401, "CONTROL_ID_UNAUTHORIZED");
  const terminal = await args.store.findByCredentialHash(
    hashControlIdSecret(token, args.pepper),
  );
  if (!terminal?.active)
    throw failure("Equipamento desativado ou não encontrado.", 401, "CONTROL_ID_UNAUTHORIZED");
  const vendorDeviceId = normalizeDeviceId(args.vendorDeviceId);
  if (terminal.vendorDeviceId !== vendorDeviceId)
    throw failure(
      "A credencial não pertence ao equipamento configurado.",
      403,
      "CONTROL_ID_DEVICE_MISMATCH",
    );
  await args.store.touchTerminal(terminal.id, args.channel);
  return terminal;
}
