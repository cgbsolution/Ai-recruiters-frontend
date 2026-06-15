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

/* ── Candidate interview session token ─────────────────────────────────────
 * Minted by the backend at register/verify/login and required (as the
 * X-Session-Token header, or ?st= for sendBeacon) on every
 * /interview/sessions/{id}/* call. Kept in sessionStorage so a mid-interview
 * page refresh (the resume flow) doesn't lose it. */
let _sessionToken: string | null = null;

export function setSessionToken(token: string | null): void {
  _sessionToken = token;
  try {
    if (token) sessionStorage.setItem("interview_session_token", token);
    else sessionStorage.removeItem("interview_session_token");
  } catch {
    // sessionStorage unavailable (private mode) — in-memory only
  }
}

export function getSessionToken(): string | null {
  if (_sessionToken) return _sessionToken;
  try {
    _sessionToken = sessionStorage.getItem("interview_session_token");
  } catch {
    // ignore
  }
  return _sessionToken;
}

/** Header object for raw fetch() callers; empty when no token is held. */
export function sessionTokenHeader(): Record<string, string> {
  const t = getSessionToken();
  return t ? { "X-Session-Token": t } : {};
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
  {
    const st = getSessionToken();
    if (st) headers["X-Session-Token"] = st;
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

/**
 * GET a file as a Blob with auth attached (for downloads). Unlike a plain
 * <a href> / window.open, this sends the Bearer token, so it works with
 * authenticated endpoints. Throws ApiError on a non-2xx response.
 */
export async function apiDownload(path: string, options: ApiOptions = {}): Promise<Blob> {
  const { timeout = 600_000, skipAuth = false, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const headers: Record<string, string> = { ...(fetchOptions.headers as Record<string, string>) };
  if (!skipAuth) {
    const token = getAuthToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  {
    const st = getSessionToken();
    if (st) headers["X-Session-Token"] = st;
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, { ...fetchOptions, headers, signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }));
      throw new ApiError(res.status, body.detail || res.statusText);
    }
    return await res.blob();
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof ApiError) throw e;
    if ((e as Error).name === "AbortError") throw new ApiError(408, "Download timed out. Please try again.");
    throw new ApiError(0, (e as Error).message || "Network error");
  }
}

/** Trigger a browser "Save As" for a Blob. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after a tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export { API_BASE };
