---
title: 'Mobile Story 1.11 — Logout y manejo de expiración de sesión (issue #19)'
type: 'feature'
created: '2026-08-16'
status: 'ready-for-dev'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-17-login-refresh-splash.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `AuthProvider`/`api.ts` (spec-17) already clear the keychain and flip to `unauthenticated` when a session can't be recovered, but silently — there is no logout action, and a forced session-expiry looks identical to a normal no-session launch, violating FR7/UX-DR27's "never a silent redirect."

**Approach:** Add a real `signOut` (best-effort `POST /auth/logout` then clear keychain) reachable from the home placeholder; make the forced-expiry path (refresh 401/403, or any `authedRequest` 401) carry an explicit one-shot reason to `login`, distinct from deliberate logout, and fire it exactly once even under concurrent 401s; add connectivity-triggered retry for refresh failures caused by network loss, leaving the existing 429-deferral behavior from spec-17 untouched.

## Boundaries & Constraints

**Always:**
- Logout calls `POST /auth/logout` via `authedRequest` best-effort (stateless per `deferred-work.md` — nothing server-side to revoke); its failure/timeout must NOT block clearing the local session (FR9).
- Forced session-expiry (refresh 401/403, or any `authedRequest` 401) shows "Your session ended. Please log in again." on login exactly once, even if multiple concurrent `authedRequest` calls hit 401 at the same time — single-fire, on top of spec-17's existing single-flight refresh dedupe.
- Deliberate logout (AC1) routes to login with NO expiry message — two distinct UI states, never conflated.
- 429 on refresh stays exactly as spec-17 built it: current screen intact, no logout, retried later (NFR10, AD-8) — do not touch that path.
- Network loss on refresh: current screen intact, session kept, refresh auto-retried once connectivity returns (new).
- No feature in this codebase queues offline write-actions yet (see Design Notes) — this spec adds no replay logic, only the constraint that a LATER story introducing one must gate replay on explicit re-confirmation after a session-expiry re-auth.

**Ask First:**
- Adding a connectivity-detection dependency (e.g. `@react-native-community/netinfo`) — nothing in the app today observes network state; HALT before installing.

**Never:**
- No backend changes — `POST /auth/logout` and `/auth/refresh` already exist (issue #10); this story is mobile-only.
- No refresh-token revocation/denylist — out of scope, the stateless design in `deferred-work.md` stands.
- No retry loop — connectivity-triggered retry fires once per regained-connectivity event, never polls.
- No changes to login/reset-password/request-password-reset flows beyond the new expiry banner.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| LOGOUT_OK | authenticated, taps "Log out" | `POST /auth/logout` fires, keychain cleared, routed to login with NO expiry message | logout call failure ignored, local clear proceeds regardless |
| REFRESH_INVALID | refresh token expired/invalid (401/403) | keychain cleared, routed to login WITH "Your session ended..." shown once | `SessionExpiredError` → single-fire expiry flag |
| CONCURRENT_401_EXPIRY | 2+ `authedRequest` calls 401 concurrently, refresh also fails | ONE expiry redirect/message, not N | refresh call already deduped (spec-17); the resulting navigation needs its own single-fire guard |
| REFRESH_429 | refresh throttled | current screen intact, no logout, deferred retry later | unchanged from spec-17 |
| REFRESH_NETWORK_LOSS | offline during refresh attempt | current screen intact, session kept, auto-retry once connectivity returns | `NetworkError` caught, no immediate logout, listener-driven retry |
| DIRECT_401_THEN_REFRESH_OK | `authedRequest` 401s but refresh itself succeeds | transparent retry (spec-17 behavior, unchanged) — NOT an expiry event | N/A |

</frozen-after-approval>

## Code Map

- `apps/mobile/src/lib/auth.tsx` -- `signOut()`: best-effort `authedRequest("/auth/logout", { method: "POST" })` then `clearTokens()`; distinguish forced-expiry from deliberate signOut and expose a one-shot reason
- `apps/mobile/src/lib/api.ts` -- connectivity-aware retry hook for refresh `NetworkError` (Ask-First gated); `SessionExpiredError` already exists and is unchanged
- `apps/mobile/src/app/login.tsx` -- read an expiry flag/param, render "Your session ended. Please log in again." once, mirroring the existing `reset=success` banner pattern
- `apps/mobile/src/app/home.tsx` -- add a "Log out" action calling `useAuth().signOut()` (the only authenticated screen today)
- `apps/mobile/package.json` -- Ask-First: connectivity-detection dependency

## Tasks & Acceptance

**Execution:**
- [ ] `apps/mobile/src/lib/auth.tsx` -- `signOut()` calls `/auth/logout` best-effort then clears keychain and flips to `unauthenticated` -- AC1 (FR9)
- [ ] `apps/mobile/src/lib/auth.tsx` -- forced-expiry path (from `resolveSession`'s `SessionExpiredError`) sets a one-shot expiry reason instead of failing silently -- AC2/AC6 (FR7, UX-DR27)
- [ ] `apps/mobile/src/lib/auth.tsx` -- guard so concurrent `authedRequest` 401s that each resolve to `SessionExpiredError` only trigger the expiry navigation/message once -- AC6
- [ ] `apps/mobile/src/app/login.tsx` -- consume the expiry reason, show the message once, clear it after first render -- AC2
- [ ] `apps/mobile/src/app/home.tsx` -- "Log out" button wired to `signOut()` -- AC1 entry point
- [ ] `apps/mobile/src/lib/api.ts` -- (Ask-First gated) connectivity-triggered retry for refresh `NetworkError` -- AC5
- [ ] cover the I/O matrix edge cases (429, network loss, concurrent 401, logout, forced expiry) with unit/manual checks

**Acceptance Criteria:**
- Given I am logged in, when I select "Log out", then my local session is cleared and I return to login (FR9).
- Given my refresh token is invalid/expired, when the app attempts to refresh, then I'm redirected to login with "Your session ended. Please log in again." — never silently (FR7, UX-DR27).
- Given I land on login after a session-expiry redirect, then no stale queued write-action executes without my explicit re-confirmation.
- Given a 429 on refresh, then I am not logged out — the app treats it as transient, keeps my screen, and retries later (NFR10, AD-8).
- Given a network failure during refresh, then my screen stays intact with no data loss, and the app retries once connectivity returns.
- Given any authenticated call 401s (not a refresh attempt), then the session-expiry flow fires once — no cascade of duplicate redirects from concurrent in-flight requests (FR7, UX-DR27).

## Spec Change Log

## Design Notes

**Why no mutation-queue work here.** TanStack Query is wired only for query-cache persistence (`query-client.ts`, `AsyncStorage`) — no mutation anywhere in this codebase uses offline pause/resume yet (Stories 1.1–1.7 are read/auth-only). AC3 is satisfied vacuously today: there is nothing to replay. This spec's job is to state the constraint for whichever later story (1.5+) first adds a mutation, not to build replay logic now.

**Single-fire expiry vs. spec-17's single-flight refresh.** spec-17 already dedupes the refresh *call* (one `POST /auth/refresh` for N concurrent 401s). This spec adds a second dedupe layer: even with one refresh call, several callers independently catch the resulting `SessionExpiredError` and could each try to redirect/show the message — that fan-out needs its own single-fire guard, separate from the refresh promise itself.

## Verification

**Commands:**
- `pnpm --filter @evergreen/mobile run typecheck` -- expected: passes
- `pnpm --filter @evergreen/mobile run lint` -- expected: passes
- `pnpm --filter @evergreen/mobile run build` (expo export) -- expected: succeeds

**Manual checks (if no CLI):**
- On-device: force an invalid refresh token, confirm the expiry message shows exactly once on login.
- Toggle airplane mode mid-refresh, confirm the current screen stays intact and refresh retries automatically on reconnect.
- Tap "Log out" from home, confirm no expiry message appears and the backend receives the `/auth/logout` call.
- Fire two authenticated calls concurrently against an expired session, confirm only one redirect/message occurs.
