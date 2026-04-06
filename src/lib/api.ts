import Cookies from "js-cookie";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

interface ApiOptions extends Omit<RequestInit, "signal"> {
  timeout?: number;
  /** Skip attaching the auth Bearer token (for public endpoints). */
  skipAuth?: boolean;
}

/**
 * Get the stored auth token from cookies.
 */
function getAuthToken(): string | undefined {
  return Cookies.get("auth_token");
}

/**
 * Centralized API client with automatic timeout, error handling, and auth.
 * Usage: const data = await api<MyType>("/endpoint", { method: "POST", body: ... });
 */
export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { timeout = 30_000, skipAuth = false, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Inject auth header if token exists
  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string>),
  };
  if (!skipAuth) {
    const token = getAuthToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      // Auto-logout on 401
      if (res.status === 401 && !skipAuth) {
        Cookies.remove("auth_token");
        Cookies.remove("auth_user");
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/signin")) {
          sessionStorage.setItem("session_expired", "Session expired, please login again!");
          window.location.href = "/signin";
        }
      }
      const body = await res.json().catch(() => ({ detail: res.statusText }));
      throw new ApiError(res.status, body.detail || res.statusText);
    }

    const text = await res.text();
    return text ? JSON.parse(text) : ({} as T);
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof ApiError) throw e;
    if ((e as Error).name === "AbortError") {
      throw new ApiError(408, "Request timed out. Please try again.");
    }
    throw new ApiError(0, (e as Error).message || "Network error");
  }
}

/**
 * Shorthand for POST with JSON body.
 */
export async function apiPost<T = unknown>(path: string, body: unknown, options: ApiOptions = {}): Promise<T> {
  return api<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...options.headers as Record<string, string> },
    body: JSON.stringify(body),
    ...options,
  });
}

/**
 * POST with FormData (for file uploads).
 */
export async function apiUpload<T = unknown>(path: string, formData: FormData, options: ApiOptions = {}): Promise<T> {
  return api<T>(path, {
    method: "POST",
    body: formData,
    timeout: 120_000, // 2 min for uploads
    ...options,
  });
}

export { API_BASE };
