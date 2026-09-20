import axios from "axios";
import { createRequestDeduper } from "./request-deduper";

export const api = axios.create({
  timeout: 30000,
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3333",
});

const transport = axios.getAdapter(api.defaults.adapter);
const reads = createRequestDeduper<Awaited<ReturnType<typeof transport>>>();
api.defaults.adapter = (config) => {
  if (config.method !== "get") {
    reads.clear();
    return transport(config).finally(() => reads.clear());
  }
  // Independently cancellable requests and downloads keep their own transport.
  if (config.signal || config.cancelToken || config.responseType === "blob")
    return transport(config);
  const key = JSON.stringify([
    config.headers.Authorization,
    api.getUri(config),
    config.responseType,
    config.headers.Accept,
  ]);
  return reads.run(key, () => transport(config));
};

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("pc_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (e) => {
    if (e.response?.status === 401 && !e.config?.url?.includes("/auth/login"))
      window.dispatchEvent(new Event("pc:unauthorized"));
    if (e.response?.status === 402 && e.response?.data?.code === "FINANCIAL_BLOCKED")
      window.dispatchEvent(new CustomEvent("pc:financial-blocked", { detail: e.response.data }));
    return Promise.reject(e);
  },
);
