/**
 * Web port of apps/mobile/src/lib/api.ts (Story 1.6/1.11). Same error-envelope
 * handling and timeout behavior — the API returns identical shapes to every
 * client. Differences, all from Story 1.14's token-storage decision:
 * - `credentials: "include"` on every fetch (sends/receives the httpOnly
 *   refresh_token cookie cross-origin) — mobile has no cookie jar.
 * - No keychain: the access token is passed in by the caller (AuthProvider's
 *   in-memory ref), never read from device storage.
 * - Refresh sends no body — the cookie carries the refresh token — and only
 *   ever returns the fresh accessToken; the response's refreshToken field is
 *   discarded here, never assigned to anything that outlives this call.
 */
import type { LoginResponse } from "@evergreen/shared-types";

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:3000";

/**
 * Typed client error raised for any non-2xx HTTP response. `code`/`message`
 * come from the API's `{ error: { code, message, details? } }` envelope or,
 * when the backend responds with NestJS's native `{ statusCode, message }`
 * shape (it does for login/refresh/me today), from those top-level fields.
 * `status` is the raw HTTP status so callers can branch on 429/401 without
 * string-matching.
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

/**
 * Raised when the refresh token is gone or no longer valid (401/403 on
 * POST /auth/refresh, or no refresh_token cookie at all). The session cannot
 * be recovered: AuthProvider clears its in-memory access token and flips to
 * "unauthenticated".
 */
export class SessionExpiredError extends Error {
  constructor(message = "Your session has expired") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

// Same bounded-timeout rationale as apps/mobile/src/lib/api.ts: without one,
// a hung connection would leave the caller awaiting forever.
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Minimal fetch wrapper. Typed by @evergreen/shared-types request/response
 * types (AD-2). Normalizes non-2xx into ApiError and transport failures into
 * NetworkError. Deliberately does NOT auto-retry on 429 — the caller decides
 * retry policy (NFR10/AD-8).
 */
export async function request<T>(
  path: string,
  { method = "GET", body, token, headers, signal }: RequestOptions = {},
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: "include", // sends/receives the httpOnly refresh_token cookie (Story 1.14)
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (timedOut) throw new NetworkError("Request timed out");
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new NetworkError();
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let code = "unknown_error";
    let message = response.statusText;
    let details: unknown;
    try {
      const errorBody = (await response.json()) as {
        error?: { code?: string; message?: string; details?: unknown };
        code?: string;
        message?: string | string[];
      };
      const envelope = errorBody?.error;
      if (envelope?.code) code = envelope.code;
      else if (errorBody?.code) code = errorBody.code;
      if (envelope?.message) message = envelope.message;
      else if (typeof errorBody?.message === "string") message = errorBody.message;
      if (envelope?.details !== undefined) details = envelope.details;
    } catch {
      // Non-JSON error body — keep the statusText fallback.
    }
    throw new ApiError(response.status, code, message, details);
  }

  // Empty body on an otherwise-successful response — 204 No Content (e.g.
  // POST /auth/logout) is the explicit convention, but a 201/200 with no
  // body (e.g. POST /residents/:residentId/family-links, a Promise<void>
  // route) is equally valid and must not attempt response.json() on it:
  // that throws "Unexpected end of JSON input" on an empty string, which
  // surfaced a successful link/unlink as a generic client-side failure
  // (bug found via manual browser verification of Story 2.2 — the mutation
  // had actually already succeeded server-side when this fired).
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/**
 * Session-expiry bus. AuthProvider subscribes and owns the single UI
 * transition (UX-DR27, mirrors Story 1.11). Fired from inside doRefresh,
 * which is single-flight, so a distinct expiry event produces exactly one
 * notification even when several call sites receive the same
 * SessionExpiredError.
 */
type SessionExpiredListener = () => void;
const expiredListeners = new Set<SessionExpiredListener>();

export function onSessionExpired(listener: SessionExpiredListener): () => void {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
}

function notifySessionExpired(): void {
  expiredListeners.forEach((listener) => listener());
}

/**
 * The in-memory-only access token (Story 1.14's token-storage decision) —
 * module-scoped state, never React state and never persisted. This is the
 * single source of truth authedRequest reads from and writes back to after
 * a transparent refresh, so every call site stays in sync without having to
 * thread a token value through props/context on every render. AuthProvider
 * is the only caller of the setter (on sign-in/sign-out); everything else
 * only ever reads it indirectly via authedRequest.
 */
let currentAccessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  currentAccessToken = token;
}

let refreshPromise: Promise<string> | null = null;

/**
 * Single-flight token refresh: POST /auth/refresh with no body (the browser
 * attaches the refresh_token cookie automatically), then returns the fresh
 * access token. Concurrent callers (multiple 401s from parallel components)
 * all await the SAME in-flight request.
 *
 * - 401/403 on refresh → throws SessionExpiredError.
 * - 429 on refresh → throws ApiError; the session is NOT destroyed, caller
 *   defers the retry (NFR10/AD-8). No auto-retry loop here.
 */
export function refreshTokens(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function doRefresh(): Promise<string> {
  let pair: LoginResponse;
  try {
    pair = await request<LoginResponse>("/auth/refresh", { method: "POST" });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      notifySessionExpired();
      throw new SessionExpiredError(err.message);
    }
    throw err;
  }

  // Deliberately never touches pair.refreshToken — the httpOnly cookie is
  // the only refresh-token persistence for this client (Story 1.14 Dev
  // Notes on the login/refresh response body tradeoff).
  setAccessToken(pair.accessToken);
  return pair.accessToken;
}

/**
 * Authenticated request with transparent refresh (FR6). Unlike mobile
 * (keychain persists across launches), a browser reload always starts with
 * `currentAccessToken === null` even when a valid refresh_token cookie
 * exists — so with no token yet, this refreshes proactively before the
 * first real request (may throw SessionExpiredError/ApiError/NetworkError,
 * same as any other refresh failure). With a token already in hand, it
 * behaves exactly like mobile's version: on a 401 it performs exactly ONE
 * refresh (updating the shared token for every other call site too) and
 * retries the original request once. Not looped — a second 401 propagates.
 */
export async function authedRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  if (!currentAccessToken) {
    await refreshTokens();
  }

  try {
    return await request<T>(path, { ...options, token: currentAccessToken });
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;

    const freshAccessToken = await refreshTokens();
    return request<T>(path, { ...options, token: freshAccessToken });
  }
}
