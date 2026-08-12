---
title: 'Mobile Story 1.7 — Password reset & invited-account activation via email link (issue #18)'
type: 'feature'
created: '2026-08-11'
status: 'done'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-7-password-reset-activation.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-17-login-refresh-splash.md'
baseline_commit: 'ee11755c24209a22f834a9db193fc9e4ea9c257b'
---

## Intent

**Problem:** The mobile app (spec-16/17 done) has no way to recover a forgotten password or activate an invited (pending) account, yet the backend (issue #12, `c7f55c6`) already exposes both public endpoints.

**Approach:** Two public screens wired into the stable auth Stack: `request-password-reset` (email → `POST /auth/password-reset`, always 204, generic "check your email" copy) and `reset-password` (reads `?token=` from the deep link → `POST /auth/password-reset/confirm` with `{ token, newPassword }` → navigates to login on success). Confirm never returns a token pair (frozen spec boundary).

## Boundaries & Constraints

**Always:**
- Both endpoints are public — call through transport-only `request<T>` (15s timeout, no auth header), never `authedRequest`; the keychain is not touched in this flow.
- Types from `@evergreen/shared-types` (AD-2): `RequestPasswordResetRequest`, `ConfirmPasswordResetRequest` — already exported.
- 429 on request (5/min) and confirm (10/min) → clear human throttling message, NEVER auto-retry (NFR10, AD-8). Only explicit user action.
- 400 on confirm → backend's "This link is invalid or has expired..." message shown verbatim + explicit "request a new link" path (NFR9/AD-8: one generic message for expired/used/unknown, no oracle).
- Network loss/timeout on either screen → inline connection error, inputs preserved, no crash.
- The Stack tree stays STABLE — same screens/order on every render; only `Stack.Protected` guards change (the spec-17 splash-freeze bug must not resurface). `reset-password` reachable during `resolving` so a cold-start from the email link works.
- `reset-password` success → `router.replace("/login?reset=success")`; login shows a short confirmation when that param is present.
- Success copy is generic ("If that email is registered...") — never reveal account existence (NFR9/AD-8).

**Ask First:** none — no new dependency, no scheme change (`evergreen` in `app.json`), no navigation architecture change.

**Never:**
- No auto-login from confirm (frozen boundary); success always → login.
- No logging/echoing the raw reset token anywhere client-side — it is a bearer credential.
- No AsyncStorage for tokens; no keychain writes in this flow.
- No prod universal-link / AASA / intent-filter infra — out of scope; the token is consumed via `useLocalSearchParams`, which works for `evergreen://` and Expo Go `exp://.../--/` URLs alike.
- No changes to the backend spec-1-7 or backend code.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| REQUEST_OK | valid-looking email | 204; generic success message + back-to-login | N/A |
| REQUEST_429 | 5+ requests/min | inline "Too many attempts. Please wait a minute and try again." | 429 → human message, no auto-retry |
| REQUEST_NETWORK_LOSS | offline/timeout | inline connection error, email preserved | `NetworkError`, no crash |
| CONFIRM_OK | valid token + strong password | `200 { success: true }`; `router.replace('/login?reset=success')` | N/A |
| CONFIRM_BAD_TOKEN | expired/used/unknown/missing token | inline: backend message verbatim + "request a new link" → `/request-password-reset` | 400 or missing `?token=` → shown inline, no redirect away from the token screen |
| CONFIRM_429 | 10+ confirms/min | inline throttling message | 429 → human message, no auto-retry |
| CONFIRM_NETWORK_LOSS | offline/timeout | inline connection error, password fields preserved | `NetworkError`, no crash |
| RESET_WEAK_PASSWORD | < 8 chars or mismatch | inline validation error, no request sent | on-device validation before submit (backend also enforces 8-128) |

## Code Map

- `apps/mobile/src/app/request-password-reset.tsx` -- NEW public screen: email input, submit → `request<T>("/auth/password-reset")`, generic success state, inline 429/network errors, back-to-login
- `apps/mobile/src/app/reset-password.tsx` -- NEW public screen: `useLocalSearchParams` token, password + confirm inputs, submit → `request<T>("/auth/password-reset/confirm")`, success → replace `/login?reset=success`, inline 400/429/network errors, missing-token state
- `apps/mobile/src/app/_layout.tsx` -- add the two screens to the stable Stack with `Stack.Protected` guards (unauthenticated for request; `status !== "authenticated"` for reset so cold-start deep links resolve while `resolving`), keeping `login` as the unauthenticated anchor
- `apps/mobile/src/app/login.tsx` -- add "Forgot your password?" link → push `/request-password-reset`; read `?reset=success` to show a confirmation banner

## Tasks & Acceptance

**Execution:**
- [x] `apps/mobile/src/app/_layout.tsx` -- register `request-password-reset` (guard `status === "unauthenticated"`) and `reset-password` (guard `status !== "authenticated"`) AFTER `login` so the unauthenticated anchor stays `login` and cold-start deep links resolve while `resolving`
- [x] `apps/mobile/src/app/request-password-reset.tsx` -- email input + submit calling `request<undefined>("/auth/password-reset", { method: "POST", body: { email } })`; generic success copy; inline 429/network errors; email preserved; back-to-login -- FR3/NFR9 ACs
- [x] `apps/mobile/src/app/reset-password.tsx` -- read `token` via `useLocalSearchParams`; on-device validation (≥8 chars, match); submit calling `request<{ success: true }>("/auth/password-reset/confirm", { method: "POST", body: { token, newPassword } })`; success → `router.replace("/login?reset=success")`; inline backend/429/network errors + "request a new link" path -- NFR9/AD-8 ACs
- [x] `apps/mobile/src/app/login.tsx` -- "Forgot your password?" link (push to request screen) and `reset=success` banner via `useLocalSearchParams` -- entry point + post-confirm confirmation
- [x] regenerate typed routes so `typecheck` sees the two new routes (dev server or `expo customize` regenerates `.expo/types/router.d.ts`)

**Acceptance Criteria:**
- Given the request-reset screen, when I submit a registered email, then a generic success message shows and no account-existence detail leaks.
- Given a 429 on request-reset, when it arrives, then a clear throttling message shows and the request is not auto-retried.
- Given the reset-password screen with a valid token, when I submit matching passwords ≥8 chars, then confirm succeeds and the app replaces to login showing a confirmation.
- Given an expired/used/unknown token, when I submit, then the backend message shows inline with a path to request a new link.
- Given a 429 on confirm, when it arrives, then a clear throttling message shows and there is no auto-retry.
- Given a network failure on either screen, when it occurs, then an inline connection error shows and inputs are preserved.
- Given the app cold-starts from the email link, when the token URL resolves, then `reset-password` renders even while auth is still `resolving`.
- Given the login screen, when I tap "Forgot your password?", then it navigates to the request screen and can return.

## Spec Change Log

## Design Notes

**Why the reset guard is `status !== "authenticated"`.** A cold start from the email link mounts `AuthProvider` in `resolving` before `/auth/me` settles. If `reset-password` only had the `unauthenticated` guard, the link would be unreachable until resolution finished — the redirect target is the anchor, not the pending deep link. Allowing it during `resolving` (never while a session is active) keeps the deep link working.

**Why `login` must stay the unauthenticated anchor.** `Stack.Protected` redirects to the first available screen. Registering the new screens before `login` would silently move the anchor and break "sign out → login". Declare them AFTER `login` in the Stack so no-session launches still land on login; the new screens are reached only by explicit navigation (request) or deep link (reset).

**Dev on-device testing without Resend.** `MailService` no-ops (logs) when `RESEND_API_KEY` is unset and doesn't log the raw link. To exercise confirm on-device: insert a `PasswordResetToken` row directly (raw token + its `sha256` hex as `tokenHash`, `expiresAt = now+1h`) for `dev@evergreen.test`, then open in Expo Go `exp://<lan-ip>:8081/--/reset-password?token=<raw>` — the same URL shape `evergreen://` builds receive.

## Verification

**Commands:**
- `pnpm --filter @evergreen/mobile run typecheck` -- expected: passes (new routes present in generated router types)
- `pnpm --filter @evergreen/mobile run lint` -- expected: passes
- `pnpm --filter @evergreen/mobile run build` (expo export) -- expected: succeeds

**Manual checks (if no CLI):**
- On-device in Expo Go: request-reset with `dev@evergreen.test` shows generic success; deep link to `/reset-password?token=<raw>` shows the form; a wrong token shows the inline invalid/expired message with a "request a new link" path; a successful confirm replaces to login with the confirmation banner.
- `login` remains the screen reached after sign-out / no-session launch (anchor unchanged).
- The Stack tree (`_layout.tsx`) has the same screens in the same order before and after any auth-state change.

## Suggested Review Order

**Navigation wiring — stable Stack**

- Two screens registered after `login` so the unauthenticated anchor never shifts
  [`_layout.tsx:49`](../../apps/mobile/src/app/_layout.tsx#L49)

- Reset guard allows `resolving` (cold-start deep link) but never an active session
  [`_layout.tsx:55`](../../apps/mobile/src/app/_layout.tsx#L55)

**Request-reset screen**

- Public call, generic success, 429/network inline without auto-retry
  [`request-password-reset.tsx:27`](../../apps/mobile/src/app/request-password-reset.tsx#L27)

- Fire-and-forget POST, 204 treated as void, email preserved on failure
  [`request-password-reset.tsx:36`](../../apps/mobile/src/app/request-password-reset.tsx#L36)

**Set-password screen**

- Token rejection flag unifies missing/expired/used token handling into one invalid-link state
  [`reset-password.tsx:29`](../../apps/mobile/src/app/reset-password.tsx#L29)

- Confirm POST and the no-token-pair success replace to login
  [`reset-password.tsx:50`](../../apps/mobile/src/app/reset-password.tsx#L50)

- Invalid/expired state shows backend message verbatim plus a "request a new link" path
  [`reset-password.tsx:95`](../../apps/mobile/src/app/reset-password.tsx#L95)

**Login entry point**

- Post-confirm confirmation banner driven by the route param
  [`login.tsx:101`](../../apps/mobile/src/app/login.tsx#L101)

- "Forgot your password?" entry point into the request screen
  [`login.tsx:128`](../../apps/mobile/src/app/login.tsx#L128)
