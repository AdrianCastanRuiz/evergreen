---
title: 'Story 1.7 — Password reset & invited-account activation via email link'
type: 'feature'
created: '2026-08-05'
status: 'done'
context: []
baseline_commit: '3a7048858ceecd8bc604e95f0d3db1b0e1cf2791'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Users have no way to regain access after forgetting a password, and invited staff/home-admin/super_admin accounts (Story 1.3/1.5, pending: `passwordHash = null`, `isActive = false`) have no way to set their first password and become active. Both need a single-use, time-limited, emailed link.

**Approach:** One shared mechanism (the existing `PasswordResetToken` model) backs both flows. `POST /auth/password-reset` issues a token for any account matching the email (silently no-ops for unknown emails) and emails a link via Resend. `POST /auth/password-reset/confirm` validates the token, sets the new password, flips `isActive` to `true`, marks the token used, and invalidates the user's other outstanding unused tokens. Email sending is fire-and-forget from the request thread, with the NFR15 retry backoff (60s → 5min → 30min) run in-process.

## Boundaries & Constraints

**Always:**
- `POST /auth/password-reset` returns an identical `204` regardless of whether the email exists — never reveal account existence (same principle as `AuthService.login`'s dummy-hash compare).
- Raw tokens are never persisted — only `sha256(rawToken)` goes into `tokenHash`; the raw token exists only in the emailed link and the confirm request body.
- Token expiry (1h) and single-use are enforced at consumption time in the DB query itself (`expiresAt > now`, `usedAt IS NULL`), not just checked in application code after fetch, to avoid a race between two concurrent confirms.
- Both endpoints are `@Public()` and `@Throttle()`-limited per NFR10/AD-8.
- `RESEND_API_KEY` follows the existing `SENTRY_DSN` convention in `env.validation.ts`: optional, service no-ops (logs instead of sending) when unset, so local dev/CI need no real key.
- New email-sending code lives in `apps/api/src/notifications/` (matches the folder the architecture spine already names for "transactional email via Resend (AD-14)"), scoped today to only what this story needs — no push-notification scaffolding.
- Email subject/body copy (the reset/activation link email) is written in English — matches `document_output_language` and the product's content language; not localized per-user.

**Ask First:** none anticipated — no schema change, no new architectural decision beyond what AD-8/AD-14 already dictate.

**Never:**
- Do not build a job queue (BullMQ/Redis) for the retry backoff — no queue infra exists yet (docker-compose only runs Postgres); in-process `setTimeout` retries are the accepted V1 tradeoff (document as deferred work: a retry is lost if the process restarts mid-backoff).
- Do not auto-login (return a token pair) from the confirm endpoint — the AC says the user "can log in", not that they're logged in automatically; client navigates to login after success.
- Do not touch Stories 1.3/1.5 (invite creation) — out of scope; this story only builds the token-consumption side. Pending users for testing are seeded directly.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Request for existing active user | valid email, user exists | `204`; token row created; email sent | N/A |
| Request for unknown email | email not in DB | `204`; no token row created; no email sent | N/A |
| Request for pending (invited) user | email exists, `isActive=false` | `204`; token created; email sent (this is the activation path) | N/A |
| Confirm with valid unexpired token | correct token + new password | `200`; `passwordHash` set, `isActive=true`, `usedAt` set, other unused tokens for user invalidated | N/A |
| Confirm with expired token | `expiresAt < now` | rejected | `410 Gone` or `400` with "This link has expired" |
| Confirm with already-used token | `usedAt` set | rejected | same as expired — generic "invalid or expired" message |
| Confirm with unknown/malformed token | random string | rejected | same generic message (no distinction from expired/used — avoid oracle) |
| Resend transient failure | Resend API throws | retried at 60s → 5min → 30min, then logged to Sentry and dropped | N/A (never surfaces to the HTTP caller — already responded) |

</frozen-after-approval>

## Code Map

- `apps/api/src/notifications/notifications.module.ts` -- new module hosting `MailService`
- `apps/api/src/notifications/mail.service.ts` -- Resend client wrapper + retry backoff + `sendPasswordResetEmail()`
- `apps/api/src/auth/password-reset.service.ts` -- new: `requestReset(email)`, `confirmReset(token, newPassword)`
- `apps/api/src/auth/dto/request-password-reset.dto.ts`, `confirm-password-reset.dto.ts` -- new DTOs
- `apps/api/src/auth/auth.controller.ts` -- add the two endpoints
- `apps/api/src/auth/auth.module.ts` -- register `PasswordResetService`, import `NotificationsModule`
- `apps/api/src/config/env.validation.ts` -- add `RESEND_API_KEY`, `MAIL_FROM`, `RESET_PASSWORD_URL`
- `apps/api/.env.example` -- document the new vars
- `apps/api/package.json` -- add `resend` dependency
- `apps/api/src/auth/password-reset.service.spec.ts` -- new unit tests (mirrors `auth.service.spec.ts` mocking style)

## Tasks & Acceptance

**Execution:**
- [x] `apps/api/src/config/env.validation.ts` -- add `RESEND_API_KEY` (optional, Sentry-style), `MAIL_FROM` (optional, required-in-prod convention not enforced here), `RESET_PASSWORD_URL` (required string/uri) -- lets `MailService` build the link and no-op cleanly in dev/CI
- [x] `apps/api/src/notifications/mail.service.ts` -- `sendPasswordResetEmail(email, rawToken)`: builds `${RESET_PASSWORD_URL}?token=...`, calls Resend, on throw schedules retries at 60s/5min/30min via `setTimeout`, final failure logs via Sentry -- NFR15
- [x] `apps/api/src/auth/password-reset.service.ts` -- `requestReset`: normalize email, look up user, if found create `PasswordResetToken` (hash+expiry 1h) and fire-and-forget `mailService.sendPasswordResetEmail`; always resolves void. `confirmReset`: atomic lookup-and-validate by `tokenHash` with `expiresAt > now AND usedAt IS NULL`, hash new password, set `isActive = true`, mark token used, invalidate user's other unused tokens, in one transaction
- [x] `apps/api/src/auth/dto/*.ts` -- `RequestPasswordResetDto{email}`, `ConfirmPasswordResetDto{token, newPassword: 8-128 chars}`
- [x] `apps/api/src/auth/auth.controller.ts` -- `POST /auth/password-reset` (`@Public`, `@Throttle 5/min`, `204`), `POST /auth/password-reset/confirm` (`@Public`, `@Throttle 10/min`, `200`)
- [x] `apps/api/src/auth/password-reset.service.spec.ts` -- cover the I/O matrix above with mocked Prisma + mocked `MailService`
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- append the in-process-retry-is-not-durable tradeoff

**Acceptance Criteria:**
- Given a registered email, when `/auth/password-reset` is called, then a `PasswordResetToken` is created with `expiresAt` 1h out and an email is sent via Resend
- Given an expired token, when confirm is called, then it is rejected with a clear expired-link message
- Given a valid unexpired token, when confirm sets a new password, then the token is marked used and cannot be consumed again
- Given a pending invited account's token, when confirm succeeds, then the account transitions to active and can log in
- Given a transient Resend failure, when sending, then it retries at 60s → 5min → 30min before giving up

## Design Notes

Token comparison is a direct unique-index lookup on `sha256(rawToken)`, not `bcrypt` — reset tokens are single-use, high-entropy (32 random bytes), and discarded after one use, so there's no brute-force-by-repeated-guessing surface bcrypt's cost factor defends against; a fast hash keeps the lookup cheap. This mirrors why `PasswordService` (bcrypt) is only used for user-chosen, reused passwords.

`requestReset` never awaits the Resend call — only the DB write — so response timing can't leak whether the email exists, and the endpoint doesn't block on network I/O to a third party.

## Verification

**Commands:**
- `pnpm --filter @evergreen/api run test` -- expected: all suites pass including new `password-reset.service.spec.ts`
- `pnpm --filter @evergreen/api run build` -- expected: compiles clean
- `pnpm --filter @evergreen/api run lint` -- expected: no errors

## Suggested Review Order

**Token lifecycle & the single-use race fix**

- Entry point: request a token, never revealing whether the email exists.
  [`password-reset.service.ts:26`](../../apps/api/src/auth/password-reset.service.ts#L26)

- The atomic claim — `usedAt: null` in the *update's* WHERE clause is what actually prevents double-use; the pre-check above it is just a fast-fail.
  [`password-reset.service.ts:75`](../../apps/api/src/auth/password-reset.service.ts#L75)

- Review-loop finding: two concurrent confirms could both pass the initial lookup before either committed. Test proving the claim now rejects the loser.
  [`password-reset.service.spec.ts:220`](../../apps/api/src/auth/password-reset.service.spec.ts#L220)

**Email delivery — Resend + in-process retry**

- Fire-and-forget from the request thread; response timing can't leak account existence.
  [`mail.service.ts:43`](../../apps/api/src/notifications/mail.service.ts#L43)

- Backoff schedule (60s → 5min → 30min, NFR15) and final give-up → Sentry.
  [`mail.service.ts:76`](../../apps/api/src/notifications/mail.service.ts#L76)

- Review-loop finding: a set key but unset `MAIL_FROM` silently falls back to Resend's sandbox address, which won't deliver to real users — now a boot-time warning.
  [`mail.service.ts:36`](../../apps/api/src/notifications/mail.service.ts#L36)

**HTTP surface**

- The two new endpoints — note the asymmetric throttle (5/min request vs 10/min confirm) and that confirm never returns a token pair.
  [`auth.controller.ts:65`](../../apps/api/src/auth/auth.controller.ts#L65)

**Config — the CI regression this loop caught**

- `RESET_PASSWORD_URL` is required at boot; review-loop finding: CI's env block didn't set it, breaking `test:e2e`. Fixed here, reproduced-then-verified locally against CI's exact env.
  [`ci.yml:35`](../../.github/workflows/ci.yml#L35)

**Peripherals**

- New required/optional env vars.
  [`env.validation.ts:19`](../../apps/api/src/config/env.validation.ts#L19)

- Module wiring: `AuthModule` now imports `NotificationsModule`.
  [`auth.module.ts:1`](../../apps/api/src/auth/auth.module.ts#L1)

- New dependency.
  [`package.json:42`](../../apps/api/package.json#L42)
