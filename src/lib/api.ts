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
}

/**
 * Centralized API client with automatic timeout and error handling.
 * Usage: const data = await api<MyType>("/endpoint", { method: "POST", body: ... });
 */
export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { timeout = 30_000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
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
