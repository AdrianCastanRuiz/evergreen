import type { LoginResponse, RefreshRequest } from "@evergreen/shared-types";

import { loadTokens, saveTokens } from "@/lib/keychain";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * Typed client error raised for any non-2xx HTTP response. `code`/`message`
 * come from the API's `{ error: { code, message, details? } }` envelope
 * (Consistency Conventions in ARCHITECTURE-SPINE.md) or, when the backend
 * responds with NestJS's native `{ statusCode, message }` shape (it does for
 * login/refresh/me today), from those top-level fields. `status` is the raw
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

/**
 * Raised when the refresh token is gone or no longer valid (401/403 on
 * POST /auth/refresh). The session cannot be recovered: `AuthProvider`
 * clears the keychain and flips to `unauthenticated`. The explicit
 * session-expiry UI is Story 1.11; here it only means "no token survives".
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

// Every request gets a bounded timeout. Without one, a hung connection (dead
// API process, firewall silently dropping SYN, flaky Wi-Fi) would leave the
// caller awaiting forever — which stranded the splash in "resolving" forever
// on the device. A timeout is a connectivity failure, surfaced as NetworkError
// so callers show the inline connection error (Story 1.6 AC).
const REQUEST_TIMEOUT_MS = 15_000;

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

  // Timeout + optional caller signal: whichever fires first aborts the fetch.
  // A caller-provided signal (user cancel) must keep propagating as an
  // AbortError; the internal timeout becomes a NetworkError (timeout = a
  // connectivity problem for the caller's error mapping).
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
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    // The internal timeout fired — a real connectivity failure, not a user
    // cancel, so surface it as NetworkError (inline connection error).
    if (timedOut) throw new NetworkError("Request timed out");
    // AbortError from the caller's own signal (user cancel) is not a
    // connectivity problem.
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
      // Accepts both the shared-types envelope ({ error: { code, message } })
      // and NestJS's native error body ({ statusCode, message }), which is
      // what login/refresh/me actually return.
      const body = (await response.json()) as {
        error?: { code?: string; message?: string; details?: unknown };
        code?: string;
        message?: string | string[];
      };
      const envelope = body?.error;
      if (envelope?.code) code = envelope.code;
      else if (body?.code) code = body.code;
      if (envelope?.message) message = envelope.message;
      else if (typeof body?.message === "string") message = body.message;
      if (envelope?.details !== undefined) details = envelope.details;
    } catch {
      // Non-JSON error body — keep the statusText fallback.
    }
    throw new ApiError(response.status, code, message, details);
  }

  // 204 No Content (e.g. POST /auth/logout, /auth/password-reset).
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

/**
 * Session-expiry bus. The single integration point for a genuinely unrecoverable
 * session (refresh token invalid/expired). AuthProvider subscribes and owns the
 * single UI transition (UX-DR27, Story 1.11). Fired from inside doRefresh, which
 * is single-flight, so a distinct expiry event produces exactly one notification
 * even when several screens receive the same SessionExpiredError.
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

let refreshPromise: Promise<string> | null = null;

/**
 * Single-flight token refresh: POST /auth/refresh with the keychain's refresh
 * token, then persist the fresh pair. Concurrent callers (multiple 401s from
 * parallel screens) all await the SAME in-flight request instead of minting
 * several pairs that would race on the keychain writes.
 *
 * - 401/403 on refresh → throws SessionExpiredError (caller clears the session).
 * - 429 on refresh → throws ApiError; the session is NOT destroyed and the
 *   caller defers the retry (NFR10/AD-8). No auto-retry loop here.
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
  const tokens = await loadTokens();
  if (!tokens?.refreshToken) throw new SessionExpiredError();

  let pair: LoginResponse;
  try {
    pair = await request<LoginResponse>("/auth/refresh", {
      method: "POST",
      body: { refreshToken: tokens.refreshToken } satisfies RefreshRequest,
    });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      // Genuine session expiry (not a "no tokens" launch, not a transient
      // 429/network blip): emit exactly once so AuthProvider can surface the
      // UX-DR27 "session ended" message and single transition.
      notifySessionExpired();
      throw new SessionExpiredError(err.message);
    }
    // 429 (rate limit) or 5xx / NetworkError: keep the session intact and
    // propagate so the caller decides whether to defer.
    throw err;
  }

  await saveTokens(pair);
  return pair.accessToken;
}

/**
 * Authenticated request with transparent refresh (FR6). Attaches the current
 * access token from the keychain; on a 401 it performs exactly ONE refresh
 * and retries the original request once with the fresh token. The retry is
 * not looped — a second 401 propagates.
 *
 * - refresh succeeds → original request retried, screen unchanged.
 * - refresh 401/403 → SessionExpiredError (session cleared upstream).
 * - refresh 429 → ApiError with status 429 (screen stays intact, caller
 *   defers the retry; the session is not destroyed on the spot).
 */
export async function authedRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const tokens = await loadTokens();
  if (!tokens?.accessToken) throw new SessionExpiredError();

  try {
    return await request<T>(path, { ...options, token: tokens.accessToken });
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;

    const freshAccessToken = await refreshTokens();
    return request<T>(path, { ...options, token: freshAccessToken });
  }
}
