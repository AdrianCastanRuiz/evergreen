---
title: 'Mobile Story 1.11 — Logout & session-expiry handling (issue #19)'
type: 'feature'
created: '2026-08-23'
status: 'done'
baseline_commit: '52bb3a84351a7d7890c422ca8a3d8a57d752a827'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-18-password-reset-activation.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-17-login-refresh-splash.md'
---

## Intent

**Problem:** The mobile app can log in (spec-17) but has no way to log out, and when a refresh token becomes invalid/expired the transition to login is silent (no message) and uncoordinated across concurrent in-flight requests — violating FR9 and UX-DR27 ("Your session ended. Please log in again.", never silent, single-fire).

**Approach:** Add a "Log out" button in home that clears the keychain (the real logout, FR9) after a fire-and-forget `POST /auth/logout`; and route session-expiry through the existing single-flight `refreshTokens()` so the AuthProvider transitions to login exactly ONCE with the UX-DR27 message. 429 and network loss stay transient (session intact, screen preserved).

## Boundaries & Constraints

**Always:**
- Local keychain clear via `AuthProvider.signOut()` is what actually logs out (JWT stateless); `POST /auth/logout` is public, fire-and-forget, 204 — never awaited for navigation, never blocks the transition.
- Session-expiry is detected ONLY where a genuine refresh failure occurs: inside `doRefresh` when `POST /auth/refresh` returns 401/403 → `SessionExpiredError`. A "no tokens in keychain" (first launch) does NOT count as expiry. Detection fires the notifier once per expiry event because `refreshTokens()` is single-flight; a status-ref guard in AuthProvider suppresses any later cascade from slow in-flight 401s.
- The Stack tree stays STABLE (`_layout.tsx`); only AuthProvider state changes. `signOut` clears the React Query cache (`queryClient.clear()`) so no persisted/stale data from the previous session bleeds into a re-auth — the app has no write-queue today, so the AC3 guarantee is satisfied defensively with no auto-execution after re-auth.
- 429 on refresh → `ApiError(429)` propagates to the caller, session tokens KEPT, screen intact, no auto-retry loop (NFR10/AD-8). Network loss on refresh → `NetworkError` propagates, tokens KEPT, retry on next user action; the session is never destroyed by a transient blip.
- Message copy verbatim: "Your session ended. Please log in again." Shown as an inline banner on login, mirroring the `reset=success` banner pattern.
- Types from `@evergreen/shared-types` (AD-2); no new dependency (no NetInfo — retry is user-action-driven, consistent with NFR10).

**Ask First:** none — no new dependency, no navigation-architecture change, no backend change (logout/refresh already exist).

**Never:**
- No silent session-expiry redirect. Every expiry lands on login with the UX-DR27 message.
- No destroying the session on 429 or a single network failure.
- No auto-retry loops on 429/5xx in the auth paths (re-triggering the rate limit).
- No changes to `api.ts` refresh single-flight semantics, `authedRequest` retry-once, or the stable Stack guards.
- No React Compiler changes, no new font weights, no reuse of `font-medium`/`font-semibold` over custom fonts.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| LOGOUT_OK | tap "Log out" in home | POST /auth/logout (204) fire-and-forget; keychain cleared; re-auth → login | logout POST failing is ignored; local clear still logs out |
| EXPIRY_IDLE_RESOLVE | /auth/me on launch, refresh 401/403 | login shows "Your session ended. Please log in again." once | tokens cleared, query cache cleared |
| EXPIRY_ACTIVE | in-flight authed call 401 → refresh 401/403 | login + message once; concurrent duplicate 401s do not re-fire | status-ref guard suppresses the cascade |
| REFRESH_429 | refresh throttled (20/min) | ApiError(429) to caller; screen intact, tokens kept | no logout, retry on next request/action |
| REFRESH_NETWORK | offline/timeout during refresh | NetworkError to caller; screen intact, tokens kept | retry when user acts again; no session destruction |
| NO_TOKENS_LAUNCH | fresh install, empty keychain | login with NO session message | not treated as expiry |

## Code Map

- `apps/mobile/src/lib/api.ts` -- add module-level `expiredListeners` set + `onSessionExpired()` subscription; fire it in `doRefresh`'s 401/403 branch (single-flight guarantees once per expiry)
- `apps/mobile/src/lib/auth.tsx` -- AuthProvider: subscribe to expiry, expose `sessionEndReason`; on expiry clear tokens+cache, set message, -> unauthenticated exactly once (status-ref guard); `signOut()` now also calls `POST /auth/logout` fire-and-forget and clears the query cache
- `apps/mobile/src/app/home.tsx` -- add "Log out" button calling `signOut`
- `apps/mobile/src/app/login.tsx` -- read `sessionEndReason` and show the UX-DR27 banner; clear the reason when the screen unmounts

## Tasks & Acceptance

**Execution:**
- [x] `apps/mobile/src/lib/api.ts` -- add `expiredListeners` + `onSessionExpired(cb): () => void`; in `doRefresh`'s catch, when `err` is `SessionExpiredError` (refresh 401/403), notify listeners exactly once before rethrow -- single integration point for expiry
- [x] `apps/mobile/src/lib/auth.tsx` -- maintain a ref mirroring `status`; in an effect, subscribe `onSessionExpired` → if the ref is `authenticated` or `resolving`, clear tokens + `queryClient.clear()`, set `sessionEndReason="expired"`, set `status="unauthenticated"` (guarded so a later 401 from a stale in-flight request is ignored)
- [x] `apps/mobile/src/lib/auth.tsx` -- `signOut`: fire-and-forget `request<void>("/auth/logout", { method: "POST" })`, `clearTokens()`, `queryClient.clear()`, clear `sessionEndReason`, set user/post `unauthenticated` -- FR9
- [x] `apps/mobile/src/app/home.tsx` -- "Log out" `Button` (variant outline) calling `signOut` with a submitting guard -- entry point, no button-text bug (don't pass className to buttonTextVariants)
- [x] `apps/mobile/src/app/login.tsx` -- when `sessionEndReason === "expired"`, render the verbatim UX-DR27 banner; clear the reason on unmount -- FR7/UX-DR27

**Acceptance Criteria:**
- Given an authenticated user in home, when they tap "Log out", then keychain tokens are cleared and the app lands on login.
- Given a session whose refresh token is invalid/expired, when a refresh is attempted (idle resolve or active call), then login shows "Your session ended. Please log in again." exactly once.
- Given concurrent in-flight authenticated requests all 401, when refresh fails, then only one session-expiry transition happens (no cascade of duplicate redirects).
- Given a 429 on refresh, when it occurs, then no logout happens, the current screen stays intact, and the retry is deferred.
- Given a network loss during refresh, when it occurs, then the current screen stays intact with preserved data and the session is not destroyed.
- Given a fresh launch with empty keychain, when the app resolves, then login shows without the session-expiry message.

## Spec Change Log

## Design Notes

**Why a notifier in `api.ts` and not just a thrown error.** The screens that call `authedRequest` are not the right owner of the session-expiry UI: many callers can independently receive a `SessionExpiredError` from the same single-flight refresh, and none of them knows whether this is the first transit. `refreshTokens()` is the one choke point where a genuine refresh failure is known exactly once per expiry, so it is the correct place to emit the event; `AuthProvider` owns the single transition (guarded by a status ref so a late in-flight 401 after we already went unauthenticated is a no-op).

**Why no NetInfo dependency.** A "retry on connectivity return" can be satisfied without a connectivity probe: the retry simply happens on the next user action / next request, and `request()` already surfaces a `NetworkError` with an inline retryable message. Adding `@react-native-community/netinfo` for this would be scope creep (the issue itself flags it Ask-First); the AC is met by not destroying the session or the screen.

**Why `signOut` clears the query cache.** TanStack Query persists a day-long cache (spec-17). Leaving it across a logout/session-expiry would let a re-auth render stale screens and, for any future mutation, could replay a stale write-queue entry. Clearing on both logout and expiry guarantees the post-re-auth state starts clean, satisfying AC3 without enqueuing any write.

## Verification

**Commands:**
- `pnpm --filter @evergreen/mobile run typecheck` -- expected: passes
- `pnpm --filter @evergreen/mobile run lint` -- expected: passes
- `pnpm --filter @evergreen/mobile run build` (with `TMP`/`TEMP` redirected to `.tmp-build`) -- expected: succeeds

**Manual checks (if no CLI):**
- On-device in Expo Go: sign in as `dev@evergreen.test` → home shows **Log out** → tap → login (no message). Corrupt the refresh token in the keychain (or shorten its TTL in `apps/api/src/auth/auth.service.ts`), relaunch → login shows "Your session ended. Please log in again.". Confirm a 429 on refresh leaves the current screen intact with no logout.

## Suggested Review Order

**Session-expiry single-flight bus**

- The one choke point where a genuine refresh failure is known; emits once per expiry
  [`api.ts:205`](../../apps/mobile/src/lib/api.ts#L205)

- Subscription API that lets AuthProvider own the single transition
  [`api.ts:160`](../../apps/mobile/src/lib/api.ts#L160)

**AuthProvider transition owner**

- Status-ref guard ensures the expiry transition fires exactly once, ignoring stale 401s
  [`auth.tsx:53`](../../apps/mobile/src/lib/auth.tsx#L53)

- The single session-expiry handler: clear tokens + query cache, set message, go unauthenticated
  [`auth.tsx:88`](../../apps/mobile/src/lib/auth.tsx#L88)

- Logout: fire-and-forget POST + keychain clear + cache clear = the real logout
  [`auth.tsx:121`](../../apps/mobile/src/lib/auth.tsx#L121)

**UI binding**

- "Log out" button with submitting guard (no button-text regression)
  [`home.tsx:13`](../../apps/mobile/src/app/home.tsx#L13)

- Expiry message shown verbatim, cleared on unmount (heard once)
  [`login.tsx:114`](../../apps/mobile/src/app/login.tsx#L114)