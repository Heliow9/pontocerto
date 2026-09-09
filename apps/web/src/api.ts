import axios from "axios";

export const api = axios.create({
  timeout: 30000,
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3333",
});

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
    return Promise.reject(e);
  },
);
