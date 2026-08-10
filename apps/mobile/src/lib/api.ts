import type { ApiErrorBody } from "@evergreen/shared-types";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * Typed client error raised for any non-2xx HTTP response. `code`/`message`
 * come from the API's `{ error: { code, message, details? } }` envelope
 * (Consistency Conventions in ARCHITECTURE-SPINE.md); `status` is the raw
 * HTTP status so callers can branch on 429/401 without string-matching.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Raised when the request fails before an HTTP response arrives (offline,
 * timeout, DNS). Distinct from ApiError so screens can show a connection
 * message without conflating it with a server error. */
export class NetworkError extends Error {
  constructor(message = "No network connection") {
    super(message);
    this.name = "NetworkError";
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Minimal fetch wrapper. Typed by @evergreen/shared-types request/response
 * types (AD-2). Normalizes non-2xx into ApiError and transport failures into
 * NetworkError. Deliberately does NOT auto-retry on 429 — Stories 1.6/1.11
 * decide retry policy at the call site (NFR10/AD-8).
 */
export async function request<T>(
  path: string,
  { method = "GET", body, token, headers, signal }: RequestOptions = {},
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    // AbortError (timeout/user cancel) is not a connectivity problem.
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new NetworkError();
  }

  if (!response.ok) {
    let errorBody: ApiErrorBody | undefined;
    try {
      errorBody = (await response.json()) as ApiErrorBody;
    } catch {
      // Non-JSON error body — fall back to the status text.
    }
    throw new ApiError(
      response.status,
      errorBody?.error.code ?? "unknown_error",
      errorBody?.error.message ?? response.statusText,
      errorBody?.error.details,
    );
  }

  // 204 No Content (e.g. POST /auth/logout, /auth/password-reset).
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}
