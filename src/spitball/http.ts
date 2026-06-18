import type { AuthState } from "./types";

export function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

export function authHeaders(auth: AuthState | null): Record<string, string> {
  if (!auth) return {};
  if (auth.mode === "external_api_key" && auth.apiKey) return { "X-Llama-Manager-Key": auth.apiKey };
  if (auth.mode === "llama_pack_business" && auth.businessToken) return { Authorization: `Bearer ${auth.businessToken}` };
  return {};
}

export async function requestJson<T>(baseUrl: string, path: string, options: RequestInit = {}, auth: AuthState | null = null): Promise<T> {
  const response = await fetch(joinUrl(baseUrl, path), {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(auth),
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
  return response.json() as Promise<T>;
}
