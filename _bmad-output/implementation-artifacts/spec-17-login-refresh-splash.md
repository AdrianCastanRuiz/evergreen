---
title: 'Mobile Story 1.6 — Login, refresh automático de token y resolución de splash screen (issue #17)'
type: 'feature'
created: '2026-08-11'
status: 'done'
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
baseline_commit: '78fc7a72d48b6ff22c24d4ac25fd963470f1356a'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Expo scaffold (spec-16) has no auth: the app always shows a placeholder root, cannot log in, never refreshes the 15-minute access token, and has no splash-screen resolution — so a registered user can't use the app across sessions.

**Approach:** Add an in-memory `AuthProvider` (status: `resolving | authenticated | unauthenticated`) backed by the keychain; a login screen with inline errors (401 invalid credentials, 429 rate limit, network); an automatic single-flight token refresh on 401 via `POST /auth/refresh` that transparently retries the original request; and a splash that resolves auth state via `GET /auth/me` and routes to login / onboarding placeholder / home placeholder by role. Load DESIGN.md fonts (deferred from scaffold).

## Boundaries & Constraints

**Always:**
- Tokens live ONLY in the platform keychain via `src/lib/keychain.ts` (NFR8, AD-8); the in-memory auth state never touches AsyncStorage/plain storage.
- All request/response types from `@evergreen/shared-types` (AD-2): `LoginRequest/LoginResponse`, `RefreshRequest`, `MeResponse`.
- 429 on login → clear human message ("Too many attempts. Please wait a minute and try again."), NEVER auto-retry or retry-loop — only explicit user action (NFR10, AD-8).
- 429 on refresh → the current screen stays intact and the session is NOT destroyed; wait and retry the refresh later, falling to session-expiry only if refresh keeps failing (NFR10, AD-8).
- Network loss/timeout on login → inline connection error, email/password preserved, no crash, no token.
- Refresh is single-flight: concurrent 401s share ONE `POST /auth/refresh`, then each caller retries once.
- Login greeting uses `{typography.hero}` (Roboto 600/34px, `font-hero`).
- `saveTokens` must be rollback-safe (fix spec-16 deferred item) since Story 1.6 now stores a real token pair.
- The client must parse BOTH the shared-types envelope AND NestJS's native error body (`message` at top level) so 401 shows the real message.

**Ask First:**
- Which font source/weights to bundle for Roboto/Oswald/Open Sans/Raleway (e.g. `@expo-google-fonts/*` vs local `.ttf` assets) — this adds dependencies beyond the frozen scaffold set; HALT before installing.

**Never:**
- No logout button, no explicit "Your session ended" messaging, no session-expiry screen — those are Story 1.11.
- No real role-based navigation or per-role home screens — Story 1.10. A single placeholder home route suffices.
- No resident-linking onboarding flow — Story 1.8. Family routes to a placeholder onboarding screen for now.
- No plain-text token storage anywhere, even temporarily; no silent no-op on 429; no retry loops.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_LOGIN | valid email/password | tokens stored in keychain, `AuthProvider` → authenticated, splash resolves to role route | N/A |
| INVALID_CREDENTIALS | wrong password | inline "Invalid email or password", no token issued, inputs preserved | 401 parsed from NestJS `message` fallback |
| LOGIN_RATE_LIMIT | 5+ failed logins/min | inline "Too many attempts. Please wait a minute and try again." | 429 → human message, NO auto-retry |
| LOGIN_NETWORK_LOSS | offline/timeout | inline connection error, email/password preserved | `NetworkError`, no crash, no token |
| REFRESH_OK | expired access token | 401 intercepted → refresh succeeds → original request retried transparently, screen unchanged | N/A |
| REFRESH_INVALID | refresh token expired/invalid | tokens cleared, `AuthProvider` → unauthenticated, routed to login (full session-expiry messaging is 1.11) | 401 from refresh |
| REFRESH_RATE_LIMIT | 20+ refreshes/min | current screen intact, session NOT destroyed, refresh deferred/retried later | 429 → no session reset, no loop |
| LAUNCH_WITH_SESSION | valid tokens in keychain | splash → `/auth/me` 200 → authenticated → role route (family → onboarding placeholder, else home placeholder) | N/A |
| LAUNCH_NO_SESSION | no tokens in keychain | splash → unauthenticated → login | N/A |
| CONCURRENT_401 | two requests hit 401 together | one refresh call, both original requests retried successfully | single-flight |
| ME_UNAUTHORIZED | stale access token at launch | splash attempts refresh; on success re-calls `/auth/me`; on failure clears tokens → login | 401 handled |

</frozen-after-approval>

## Code Map

- `apps/mobile/src/lib/auth.tsx` -- NEW `AuthProvider` + `useAuth`: status/user state, `signIn(email,password)`, `resolveSession()` (keychain → `/auth/me` → refresh → retry `/me`), in-memory token store
- `apps/mobile/src/lib/api.ts` -- fix error-message fallback (NestJS shape); add `authedRequest` (attach bearer, 401 → refresh single-flight → retry once); `refreshTokens()` + `SessionExpiredError`
- `apps/mobile/src/lib/keychain.ts` -- rollback-safe `saveTokens` (sequential writes + cleanup on failure)
- `apps/mobile/src/app/_layout.tsx` -- wrap with `AuthProvider`; `useFonts` for DESIGN.md fonts; keep Stack
- `apps/mobile/src/app/index.tsx` -- becomes the splash/auth-resolution screen (shows until resolution completes)
- `apps/mobile/src/app/login.tsx` -- NEW login screen: hero greeting, email/password, inline errors, preserves inputs on network error
- `apps/mobile/src/app/onboarding.tsx` -- NEW placeholder (family landing; Story 1.8 fills it)
- `apps/mobile/src/app/home.tsx` -- NEW placeholder (role-appropriate home; Story 1.10 fills it)
- `apps/mobile/package.json` -- font dependency (Ask First before adding)

## Tasks & Acceptance

**Execution:**
- [x] `apps/mobile/src/lib/api.ts` -- add top-level `message` fallback in the non-2xx parse (NestJS `{ statusCode, message }`) so 401 login shows the real backend message -- otherwise the login screen shows "Unauthorized"
- [x] `apps/mobile/src/lib/keychain.ts` -- make `saveTokens` rollback-safe (sequential `setItemAsync`, delete both on failure) -- fixes deferred item; a real token pair must never be half-written
- [x] `apps/mobile/src/lib/auth.tsx` -- `AuthProvider`: `resolving/authenticated/unauthenticated`; `resolveSession()` and `signIn()`; expose `user`, `status`, `signIn`, `signOut`; hold tokens in memory only -- auth-state lifecycle for splash (FR8)
- [x] `apps/mobile/src/lib/api.ts` -- `refreshTokens()` (single-flight promise) + `authedRequest<T>()` (bearer attach, 401 → refresh → retry once, `SessionExpiredError` when refresh fails, defer on 429) -- automatic transparent refresh (FR6)
- [x] `apps/mobile/src/app/index.tsx` -- splash/auth-resolution screen rendering the splash while `resolving`, redirecting on resolution -- FR8 entry point
- [x] `apps/mobile/src/app/login.tsx` -- login form: `font-hero` greeting, email/password inputs, submit → `signIn`, inline 401/429/network errors, inputs preserved on network failure -- FR2 + ACs
- [x] `apps/mobile/src/app/onboarding.tsx` + `apps/mobile/src/app/home.tsx` -- minimal placeholder screens for resolution targets -- 1.8/1.10 fill later
- [x] `apps/mobile/src/app/_layout.tsx` -- mount `AuthProvider` before screens -- context wiring (fonts: pending Ask-First decision, see Design Notes)
- [ ] `apps/mobile/package.json` + font assets -- load Roboto/Oswald/Open Sans/Raleway per DESIGN.md (Ask First on source) -- `{typography.hero}` renders real Roboto

**Acceptance Criteria:**
- Given valid credentials, when I submit login, then the token pair lands in the keychain, `AuthProvider` is authenticated, and the splash resolves to the role route.
- Given invalid credentials, when I submit login, then an inline error appears and no token is stored.
- Given a 429 on login, when it arrives, then the user sees the human rate-limit message and the request is not auto-retried.
- Given a 429 on refresh, when it arrives, then the current screen stays intact, the session is not destroyed, and refresh is deferred rather than looped.
- Given a network failure on login, when it occurs, then the user sees an inline connection error and email/password remain filled.
- Given an expired access token during normal use, when a request 401s, then a single refresh happens and the original request retries transparently with no screen interruption.
- Given the app launches with tokens, when splash resolves, then family lands on the onboarding placeholder and other roles on the home placeholder; without tokens, on login.
- Given the login screen, when it renders, then the greeting uses the hero typography token.
- Given any flow, when a token must be persisted, then it reaches storage only through `keychain.ts` — never AsyncStorage or plain state.
- Given the splash resolution, when `/auth/me` 401s and refresh also fails, then tokens are cleared and the user is routed to login.

## Spec Change Log

## Design Notes

**Refresh on 401 must be single-flight.** If two screens fire requests while the access token is expired, both get 401. Two parallel refreshes would mint two pairs and race on keychain writes. Hold a module-level `refreshPromise`; all callers `await` the same one.

**Where refresh decisions live.** `request<T>` stays transport-only (spec-16 boundary). `authedRequest` wraps it and owns the 401→refresh→retry policy. 429 on refresh is NOT thrown as a session kill: it returns a typed "deferred" signal so the caller keeps its UI; the retry-later window is driven by the next user action or a bounded timer (no loop).

**Session-expiry boundary is explicit.** When refresh returns 401/403, `authedRequest` clears the keychain and flips `AuthProvider` to `unauthenticated` — that routes to login. The explicit "Your session ended" screen and logout button are Story 1.11; this spec only ensures no token survives and no stale queued action re-runs after re-auth.

## Verification

**Commands:**
- `pnpm --filter @evergreen/mobile run typecheck` -- expected: passes
- `pnpm --filter @evergreen/mobile run lint` -- expected: passes
- `pnpm --filter @evergreen/mobile run build` (expo export) -- expected: succeeds

**Manual checks (if no CLI):**
- `src/lib/keychain.ts` is the only module importing `expo-secure-store`.
- 429-on-login path shows the human message and never calls fetch again automatically.
- Login screen greeting renders with the hero token (`font-hero`).

## Suggested Review Order

**Auth state lifecycle — entry point**

- AuthProvider owns resolving/authenticated/unauthenticated; 429/network keep tokens, only SessionExpired clears them
  [`auth.tsx:33`](../../apps/mobile/src/lib/auth.tsx#L33)

- signIn stores the pair then resolves /me best-effort; failures before storage reach the form
  [`auth.tsx:62`](../../apps/mobile/src/lib/auth.tsx#L62)

**Token refresh machinery**

- Single-flight refresh: concurrent 401s await one POST /auth/refresh, reset in finally
  [`api.ts:134`](../../apps/mobile/src/lib/api.ts#L134)

- Refresh maps 401/403 → SessionExpiredError; 429 propagates intact (no session kill)
  [`api.ts:143`](../../apps/mobile/src/lib/api.ts#L143)

- authedRequest attaches bearer and retries once after refresh; never loops
  [`api.ts:177`](../../apps/mobile/src/lib/api.ts#L177)

- Non-2xx parse accepts both shared-types envelope and NestJS native body
  [`api.ts:91`](../../apps/mobile/src/lib/api.ts#L91)

**Splash resolution & routing**

- Splash renders while resolving; redirects by role after resolution (FR8)
  [`index.tsx:11`](../../apps/mobile/src/app/index.tsx#L11)

**Login screen**

- Hero greeting, inline 401/429/network errors, inputs preserved, no auto-retry
  [`login.tsx:21`](../../apps/mobile/src/app/login.tsx#L21)

**Keychain integrity**

- Rollback-safe sequential save: full pair or nothing, never half-written
  [`keychain.ts:19`](../../apps/mobile/src/lib/keychain.ts#L19)

**Wiring & placeholders (peripherals)**

- AuthProvider mounted above the Stack; fonts deferred pending Ask-First decision
  [`_layout.tsx:34`](../../apps/mobile/src/app/_layout.tsx#L34)

- Placeholder landing targets for 1.8 (onboarding) and 1.10 (home)
  [`onboarding.tsx:6`](../../apps/mobile/src/app/onboarding.tsx#L6) · [`home.tsx:6`](../../apps/mobile/src/app/home.tsx#L6)
