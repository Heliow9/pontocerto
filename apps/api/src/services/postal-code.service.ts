export type PostalCodeAddress = {
  zipCode: string;
  street: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  ibge: string | null;
  source: "VIACEP" | "BRASILAPI";
};

type CacheEntry = { value: PostalCodeAddress; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

function httpError(status: number, message: string) {
  const error: any = new Error(message);
  error.status = status;
  return error;
}

export function normalizePostalCode(value: string) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!/^\d{8}$/.test(digits)) throw httpError(400, "Informe um CEP válido com 8 dígitos.");
  return digits;
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fromViaCep(cep: string): Promise<PostalCodeAddress | null> {
  const data: any = await fetchJson(`https://viacep.com.br/ws/${cep}/json/`);
  if (data?.erro) return null;
  return {
    zipCode: String(data?.cep || cep),
    street: String(data?.logradouro || ""),
    complement: String(data?.complemento || ""),
    district: String(data?.bairro || ""),
    city: String(data?.localidade || ""),
    state: String(data?.uf || "").toUpperCase().slice(0, 2),
    ibge: data?.ibge ? String(data.ibge) : null,
    source: "VIACEP",
  };
}

async function fromBrasilApi(cep: string): Promise<PostalCodeAddress | null> {
  try {
    const data: any = await fetchJson(`https://brasilapi.com.br/api/cep/v2/${cep}`);
    return {
      zipCode: String(data?.cep || cep),
      street: String(data?.street || ""),
      complement: "",
      district: String(data?.neighborhood || ""),
      city: String(data?.city || ""),
      state: String(data?.state || "").toUpperCase().slice(0, 2),
      ibge: null,
      source: "BRASILAPI",
    };
  } catch (error: any) {
    if (String(error?.message || "").includes("HTTP 404")) return null;
    throw error;
  }
}

function remember(cep: string, value: PostalCodeAddress) {
  if (cache.size >= 500) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(cep, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function lookupPostalCode(rawCep: string): Promise<PostalCodeAddress> {
  const cep = normalizePostalCode(rawCep);
  const cached = cache.get(cep);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) cache.delete(cep);

  let viaCepUnavailable = false;
  try {
    const result = await fromViaCep(cep);
    if (result) {
      remember(cep, result);
      return result;
    }
  } catch {
    viaCepUnavailable = true;
  }

  try {
    const fallback = await fromBrasilApi(cep);
    if (fallback) {
      remember(cep, fallback);
      return fallback;
    }
  } catch {
    if (viaCepUnavailable) throw httpError(502, "Serviço de consulta de CEP temporariamente indisponível. Tente novamente em instantes.");
  }

  throw httpError(404, "CEP não encontrado.");
}
