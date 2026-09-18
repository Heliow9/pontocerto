import fs from "node:fs";
import https from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import path from "node:path";
import { X509Certificate } from "node:crypto";
import { env } from "../config/env.js";
import {
  buildInterIssuePayload,
  extractInterChargeDetails,
  interTokenReusable,
  redactedInterConfig,
  type InterIssueInput,
} from "./inter-billing-core.js";

const BILLING_SCOPE = "boleto-cobranca.read boleto-cobranca.write";
const BILLING_PATH = "/cobranca/v3/cobrancas";

type TokenCache = { accessToken: string; expiresAtMs: number } | null;
let tokenCache: TokenCache = null;
let tokenRequest: Promise<TokenCache> | null = null;
let materialCache: { certPath: string; keyPath: string; cert: Buffer; key: Buffer } | null = null;

export class InterApiError extends Error {
  status: number;
  code: string;
  details: unknown;
  constructor(message: string, status = 502, code = "INTER_API_ERROR", details?: unknown) {
    super(message);
    this.name = "InterApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function config() {
  return {
    enabled: env.INTER_ENABLED === "1",
    environment: env.INTER_ENV,
    clientId: env.INTER_CLIENT_ID,
    clientSecret: env.INTER_CLIENT_SECRET,
    certPath: env.INTER_CERT_PATH,
    keyPath: env.INTER_KEY_PATH,
    account: env.INTER_ACCOUNT,
    webhookUrl: env.INTER_WEBHOOK_URL,
  } as const;
}

function baseUrl() {
  return env.INTER_ENV === "sandbox"
    ? "https://cdpj-sandbox.partners.uatinter.co"
    : "https://cdpj.partners.bancointer.com.br";
}

function requireConfig() {
  const c = config();
  if (!c.enabled) throw new InterApiError("Integração Banco Inter está desativada.", 503, "INTER_DISABLED");
  const missing: string[] = [];
  if (!c.clientId) missing.push("INTER_CLIENT_ID");
  if (!c.clientSecret) missing.push("INTER_CLIENT_SECRET");
  if (!c.certPath) missing.push("INTER_CERT_PATH");
  if (!c.keyPath) missing.push("INTER_KEY_PATH");
  if (missing.length) throw new InterApiError(`Integração Banco Inter incompleta: ${missing.join(", ")}.`, 503, "INTER_NOT_CONFIGURED");
  return c as typeof c & { clientId: string; clientSecret: string; certPath: string; keyPath: string };
}

function tlsMaterial() {
  const c = requireConfig();
  if (materialCache && materialCache.certPath === c.certPath && materialCache.keyPath === c.keyPath) return materialCache;
  try {
    materialCache = {
      certPath: c.certPath,
      keyPath: c.keyPath,
      cert: fs.readFileSync(c.certPath),
      key: fs.readFileSync(c.keyPath),
    };
    return materialCache;
  } catch {
    throw new InterApiError("Não foi possível carregar o certificado/chave do Banco Inter.", 503, "INTER_CERTIFICATE_UNAVAILABLE");
  }
}

function safeJson(buffer: Buffer): any {
  if (!buffer.length) return null;
  const text = buffer.toString("utf8");
  try { return JSON.parse(text); } catch { return { message: text.slice(0, 500) }; }
}

function errorMessage(payload: any, status: number) {
  const candidate = payload?.detail || payload?.detalhe || payload?.message || payload?.mensagem || payload?.title || payload?.titulo;
  return candidate ? `Banco Inter: ${String(candidate).slice(0, 300)}` : `Banco Inter retornou HTTP ${status}.`;
}

async function request(options: {
  method: string;
  pathname: string;
  token?: string;
  body?: string | Buffer;
  contentType?: string;
  accept?: string;
  binary?: boolean;
}): Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer; json: any }> {
  const c = requireConfig();
  const material = tlsMaterial();
  const url = new URL(options.pathname, baseUrl());
  const headers: Record<string, string | number> = {
    Accept: options.accept || "application/json",
    "User-Agent": "PontoCerto-Financeiro/1.0",
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (c.account) headers["x-conta-corrente"] = c.account;
  if (options.body !== undefined) {
    headers["Content-Type"] = options.contentType || "application/json";
    headers["Content-Length"] = Buffer.byteLength(options.body);
  }
  return new Promise((resolve, reject) => {
    const req = https.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: options.method,
      cert: material.cert,
      key: material.key,
      minVersion: "TLSv1.2",
      timeout: 25_000,
      headers,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        const body = Buffer.concat(chunks);
        const status = res.statusCode || 0;
        const json = options.binary ? null : safeJson(body);
        if (status < 200 || status >= 300) return reject(new InterApiError(errorMessage(json, status), status >= 400 && status < 500 ? status : 502, "INTER_HTTP_ERROR", json));
        resolve({ status, headers: res.headers, body, json });
      });
    });
    req.on("timeout", () => req.destroy(new InterApiError("Tempo esgotado ao comunicar com o Banco Inter.", 504, "INTER_TIMEOUT")));
    req.on("error", (error) => reject(error instanceof InterApiError ? error : new InterApiError("Falha de comunicação com o Banco Inter.", 502, "INTER_CONNECTION_ERROR")));
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

async function fetchToken() {
  const c = requireConfig();
  const body = new URLSearchParams({
    client_id: c.clientId,
    client_secret: c.clientSecret,
    scope: BILLING_SCOPE,
    grant_type: "client_credentials",
  }).toString();
  const response = await request({ method: "POST", pathname: "/oauth/v2/token", body, contentType: "application/x-www-form-urlencoded" });
  const accessToken = response.json?.access_token;
  const expiresIn = Number(response.json?.expires_in || 3600);
  if (!accessToken) throw new InterApiError("Banco Inter não retornou token de acesso.", 502, "INTER_TOKEN_INVALID");
  tokenCache = { accessToken, expiresAtMs: Date.now() + Math.max(60, expiresIn) * 1000 };
  return tokenCache;
}

async function getToken() {
  if (tokenCache && interTokenReusable(tokenCache.expiresAtMs)) return tokenCache.accessToken;
  if (!tokenRequest) tokenRequest = fetchToken().finally(() => { tokenRequest = null; });
  const token = await tokenRequest;
  return token!.accessToken;
}

async function authorizedRequest(options: Omit<Parameters<typeof request>[0], "token">) {
  let token = await getToken();
  try {
    return await request({ ...options, token });
  } catch (error: any) {
    if (error instanceof InterApiError && error.status === 401) {
      tokenCache = null;
      token = await getToken();
      return request({ ...options, token });
    }
    throw error;
  }
}

export function getInterConnectionStatus() {
  const c = config();
  let certificateValidTo: string | null = null;
  let certificateSubject: string | null = null;
  let certExists = false;
  let keyExists = false;
  try {
    certExists = Boolean(c.certPath && fs.existsSync(c.certPath));
    keyExists = Boolean(c.keyPath && fs.existsSync(c.keyPath));
    if (certExists && c.certPath) {
      const x509 = new X509Certificate(fs.readFileSync(c.certPath));
      certificateValidTo = x509.validTo || null;
      certificateSubject = x509.subject || null;
    }
  } catch {
    certificateValidTo = null;
  }
  return {
    ...redactedInterConfig(c),
    certExists,
    keyExists,
    certificateValidTo,
    certificateSubject,
    certificateFilename: c.certPath ? path.basename(c.certPath) : null,
    connected: false,
  };
}

export async function testInterConnection() {
  const accessToken = await getToken();
  return { ok: Boolean(accessToken), testedAt: new Date().toISOString(), ...getInterConnectionStatus(), connected: true };
}

export async function issueInterCharge(input: InterIssueInput) {
  const payload = buildInterIssuePayload(input);
  const response = await authorizedRequest({ method: "POST", pathname: BILLING_PATH, body: JSON.stringify(payload) });
  const providerChargeId = response.json?.codigoSolicitacao;
  if (!providerChargeId) throw new InterApiError("Banco Inter aceitou a emissão, mas não retornou o código da solicitação.", 502, "INTER_ISSUE_WITHOUT_ID", response.json);
  return { providerChargeId: String(providerChargeId), response: response.json, request: payload };
}

export async function getInterCharge(providerChargeId: string) {
  const response = await authorizedRequest({ method: "GET", pathname: `${BILLING_PATH}/${encodeURIComponent(providerChargeId)}` });
  return extractInterChargeDetails(response.json);
}


export async function findInterChargeByYourNumber(yourNumber: string, dueDate: string) {
  const query = new URLSearchParams({
    dataInicial: dueDate,
    dataFinal: dueDate,
    filtrarDataPor: "VENCIMENTO",
    seuNumero: yourNumber,
    "paginacao.itensPorPagina": "20",
    "paginacao.paginaAtual": "0",
  });
  const response = await authorizedRequest({ method: "GET", pathname: `${BILLING_PATH}?${query.toString()}` });
  const rows = Array.isArray(response.json?.cobrancas) ? response.json.cobrancas : [];
  const row = rows.find((item: any) => String(item?.seuNumero || "") === yourNumber);
  return row ? extractInterChargeDetails(row) : null;
}

export async function getInterChargePdf(providerChargeId: string) {
  const response = await authorizedRequest({ method: "GET", pathname: `${BILLING_PATH}/${encodeURIComponent(providerChargeId)}/pdf`, accept: "application/pdf", binary: true });
  return response.body;
}

export async function cancelInterCharge(providerChargeId: string, reason = "APEDIDODOCLIENTE") {
  const response = await authorizedRequest({ method: "POST", pathname: `${BILLING_PATH}/${encodeURIComponent(providerChargeId)}/cancelar`, body: JSON.stringify({ motivoCancelamento: reason }) });
  return response.json || { ok: true };
}

export async function configureInterWebhook(webhookUrl: string) {
  if (!/^https:\/\//i.test(webhookUrl)) throw new InterApiError("O webhook do Inter deve usar HTTPS.", 400, "INTER_WEBHOOK_HTTPS_REQUIRED");
  const response = await authorizedRequest({ method: "PUT", pathname: `${BILLING_PATH}/webhook`, body: JSON.stringify({ webhookUrl }) });
  return response.json || { ok: true, webhookUrl };
}

export async function getInterWebhook() {
  const response = await authorizedRequest({ method: "GET", pathname: `${BILLING_PATH}/webhook` });
  return response.json || null;
}

export async function deleteInterWebhook() {
  const response = await authorizedRequest({ method: "DELETE", pathname: `${BILLING_PATH}/webhook` });
  return response.json || { ok: true };
}
