// Central API client.
//
// Every request carries the anonymous device id (for guest/simulated-trading
// continuity) and, once a real account exists, the Bearer session token too —
// the backend accepts either. Centralizing this means no component crafts its
// own fetch/headers, so auth upgrades happen in exactly one place.

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://stock-pulse-vzuy.onrender.com";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("sp_device_id");
  if (!id) {
    id = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    localStorage.setItem("sp_device_id", id);
  }
  return id;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("sp_token");
}

export function setSession(opts: { token?: string; deviceId?: string; username?: string | null }) {
  if (typeof window === "undefined") return;
  if (opts.token) localStorage.setItem("sp_token", opts.token);
  if (opts.deviceId) localStorage.setItem("sp_device_id", opts.deviceId);
  if (opts.username !== undefined) {
    if (opts.username) localStorage.setItem("sp_username", opts.username);
    else localStorage.removeItem("sp_username");
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("sp_token");
  localStorage.removeItem("sp_username");
}

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "x-device-id": getDeviceId(),
    ...(init.body && !(init.headers as Record<string, string> | undefined)?.["Content-Type"] ? { "Content-Type": "application/json" } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiRequestError(res.status, data?.error ?? `Request failed (${res.status})`, data?.code);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "POST", body: body != null ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PUT", body: body != null ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PATCH", body: body != null ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
