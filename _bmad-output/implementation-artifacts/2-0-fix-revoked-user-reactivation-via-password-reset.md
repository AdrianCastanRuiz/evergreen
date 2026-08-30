---
baseline_commit: 0f1510d4400c137d713160a55d2da3f4415e6363
---

# Story 2.0: Fix — revoked user can self-reactivate via password reset

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Not from epics.md — this is a security bugfix carried over from the Epic 1 retrospective
     (see _bmad-output/implementation-artifacts/epic-1-retro-2026-08-26.md), registered as a
     high-priority Epic 2 action item and elevated to its own story per Adrian's request
     (2026-08-26). Numbered 2-0 so it sorts before 2-1..2-4 in sprint-status.yaml — no epics.md
     story owns it, so sprint-planning's auto-regeneration won't recreate this entry if it's
     ever re-run from a clean epics.md parse (same caveat already documented for Stories 1.13/1.14). -->

## Story

As a home admin who has revoked a user's access,
I want that revocation to actually stick,
so that a deactivated user cannot silently reactivate their own account through the password-reset flow.

## Acceptance Criteria

1. **Given** a user account was previously active and has since been deactivated by a home admin (`isActive: false`, `passwordHash` already set from their original activation — i.e. `UsersService.revokeAccess`'s end state), **when** that user submits a valid, unexpired, unused password-reset token to `POST /auth/password-reset/confirm`, **then** the request is rejected with the same generic "This link is invalid or has expired" message the endpoint already uses for expired/used/unknown tokens — no distinguishing signal that reveals the account was deactivated (no account-status oracle).
2. **Given** a user account that has never been activated (`isActive: false`, `passwordHash: null` — a pending invite from Story 1.3/1.5, not yet claimed), **when** they submit a valid activation/reset token, **then** the account activates exactly as it does today — **this path must not regress**, it's the same shared mechanism Story 1.7's invited-account activation depends on.
3. **Given** a normal active user resetting a forgotten password, **when** they submit a valid token, **then** behavior is unchanged (password updated, `isActive` stays `true`, other outstanding tokens for that user invalidated).
4. **Given** a revoked user's reset-confirm attempt is rejected per AC #1, **when** the rejection happens, **then** their reset token is left untouched (not marked used) — rejecting them earlier than the existing single-use claim step, since there is no legitimate future use of that token while the account stays revoked (see Dev Notes for why this is deliberately simpler than trying to "consume and reject").

## Tasks / Subtasks

- [x] Task 1: Fix `PasswordResetService.confirmReset` (AC #1, #2, #3, #4)
  - [x] In `apps/api/src/auth/password-reset.service.ts`, after the existing `resetToken` lookup/null-check and before the `passwordService.hash(newPassword)` call, fetch the target user (`this.prisma.client.user.findUnique({ where: { id: resetToken.userId }, select: { isActive: true, passwordHash: true } })`)
  - [x] Reject with the existing `INVALID_OR_EXPIRED_MESSAGE` (same `BadRequestException`, do not add a new message string — see Dev Notes on why a distinct message would itself be a leak) when `!user.isActive && user.passwordHash !== null` — this is the exact "was active, now revoked" signature; a never-activated pending user (`passwordHash === null`) must fall through and activate normally (AC #2)
  - [x] This check must happen **before** the `$transaction` that claims the token — do not consume the token for a rejected revoked-user attempt (AC #4)
  - [x] Leave the rest of `confirmReset` (the atomic `updateMany` single-use claim, the `tx.user.update({ ..., isActive: true })`, the outstanding-token invalidation) exactly as-is — this fix is a guard clause, not a rewrite
- [x] Task 2: Tests
  - [x] Extend `apps/api/src/auth/password-reset.service.spec.ts`'s `describe('confirmReset', ...)` block: add a `revokedUser` fixture (`{ ...activeUser, id: 'user-3', isActive: false }` — keep `passwordHash: 'hashed'`, that's the distinguishing field) and a new test `'rejects a reset attempt for a revoked (deactivated) account without reactivating it'` — assert `BadRequestException` is thrown, `prisma.client.user.update`/`tx.user.update` is never called, and `passwordResetToken.updateMany` (the token-claiming call) is never called either (AC #4)
  - [x] Run the existing `'activates a pending account on confirm — it can log in afterwards'` test (uses `pendingUser`, already in the file) after the fix — it must still pass unmodified; if it doesn't, the guard condition is wrong (should be `passwordHash !== null`, not just `!isActive`)
  - [x] No e2e test currently exists for the password-reset confirm flow (checked `apps/api/test/` — no `password-reset*.e2e-spec.ts`; coverage today is unit-level only via the spec file above). Adding one is optional for this story — the unit-level fix + regression test is sufficient given the existing coverage pattern, but flag it in Completion Notes as a pre-existing gap if you don't add one, don't silently leave it unmentioned.

### Review Findings

- [x] [Review][Decision] Guard permanently blocked a legitimate re-invite reactivation path for a previously-revoked family user — `UsersService.grantExistingFamilyUserHomeAccess` issues a fresh `issueActivationToken` for any `existing.isActive === false` user being invited to a new home, with no distinction between "never activated" and "was active, then revoked." **Resolved: option (a).** Adrian chose adding a `revokedAt` timestamp. Implemented: `User.revokedAt DateTime?` (migration `20260830202457_add_user_revoked_at`), set by `UsersService.revokeAccess` alongside `isActive: false`, cleared (`null`) on every reactivation path (`PasswordResetService.confirmReset`'s transaction and `InviteCodeService.resolveInviteCode`'s transaction). The guard now rejects only when `resetToken.createdAt < user.revokedAt` (a stale pre-revocation token — the actual vulnerability) or when `revokedAt` is `null` on an otherwise-revoked-looking row (a pre-migration legacy row — defaults to reject, the safe side). A token issued *after* `revokedAt` — e.g. by a legitimate re-invite — now correctly reactivates. Covered by 3 new tests in `password-reset.service.spec.ts` (stale-token reject, fresh-token-after-revoke accept, no-`revokedAt`-on-record reject). 109/109 `apps/api` tests passing, lint/`tsc --noEmit` clean.
- [x] [Review][Patch] TOCTOU: the guard's `isActive`/`passwordHash` read happened outside the `$transaction`, with no re-check at commit time. **Fixed:** the transaction's `tx.user.update` became a conditional `tx.user.updateMany` re-verifying the same guard atomically at commit time (`WHERE id = ... AND (passwordHash IS NULL OR isActive OR revokedAt <= token.createdAt)`), mirroring the token claim's own atomic-`updateMany` pattern; aborts with the generic message if the row no longer matches (0 rows affected). New test: `'aborts reactivation if the account is revoked between the pre-check and the transaction commit (TOCTOU)'`.
- [x] [Review][Patch] Timing side-channel: the revoked-user rejection returned immediately, while the active-user success path awaited `passwordService.hash` (bcrypt) plus the `$transaction` — response latency let someone already holding a valid token for an account infer revoked-vs-active status. **Fixed:** the stale-token-on-revoked-account branch now awaits `passwordService.hash(newPassword)` (a real bcrypt op, cost independent of input) before throwing, equalizing its latency with the success path — mirrors `AuthService.login`'s dummy-hash compare for the same class of leak. Covered by assertions in the existing stale-token and no-`revokedAt` reject tests.
- [x] [Review][Patch] The `!user` defensive branch (a `resetToken.userId` with no matching `User` row) had zero test coverage. **Fixed:** added `'rejects when the token references a user row that no longer exists, without paying the timing-mitigation cost'`, asserting `BadRequestException` and that no dummy hash runs (this branch has no revoked-vs-active status to hide, unlike the stale-token case above).
- [x] [Review][Defer] The guard's correctness relies on an unverified invariant — "`revokeAccess` only ever flips `isActive`, never clears `passwordHash`" — documented in this story's Dev Notes and in a code comment, but not enforced by any test against `users.service.ts`'s actual `revokeAccess` implementation [apps/api/src/users/users.service.ts]. Pre-existing (concerns a file this story doesn't touch), real but not actionable within this story's scope. Deferred — a regression test for `revokeAccess` belongs with that file's own test suite, not this bugfix's.

## Dev Notes

### Where this bug came from — read this before touching the file

This is not new code — it's a documented, deliberately-deferred gap finally becoming reachable. `_bmad-output/implementation-artifacts/deferred-work.md`'s Story 1.7 entry (2026-08-05) already said, verbatim: *"`confirmReset` unconditionally sets `isActive: true` on any account reached via a valid token, with no way to distinguish 'never-activated invite' from 'deliberately deactivated existing account.' Currently unreachable — no feature in this codebase can set an existing user's `isActive` to `false`... Must be revisited before or when an admin-deactivation feature ships."*

Story 1.12 (home admin revokes access, merged) shipped exactly that feature — `UsersService.revokeAccess` (`apps/api/src/users/users.service.ts`) sets `isActive: false` when a user's last `HomeMembership` is removed. The gap `deferred-work.md` predicted is now live. This story closes it.

### The distinguishing signal already exists in the schema — no migration needed

`User.passwordHash` is nullable (`apps/api/prisma/schema.prisma`). A user created via `UsersService.createUser` (every invite path — Story 1.3/1.4/1.5) starts with `passwordHash: null` and `isActive: false`, and only ever gets a `passwordHash` the first time they successfully activate (via this same `confirmReset`, or Story 1.8's `InviteCodeService.resolveInviteCode`). `revokeAccess` only ever flips `isActive` — it never touches `passwordHash`. So:

| State | `isActive` | `passwordHash` | Reset-confirm should... |
|---|---|---|---|
| Never activated (pending invite) | `false` | `null` | **activate** (AC #2, unchanged behavior) |
| Active | `true` | set | reset password, stay active (AC #3, unchanged) |
| Revoked (was active, now isn't) | `false` | set | **reject** (AC #1 — this is the fix) |

The guard is exactly `!user.isActive && user.passwordHash !== null`. Nothing else in the codebase needs to change — no new column, no new enum state.

### Why reject with the *same* generic message, and why reject before claiming the token

`PasswordResetService` already has a hard rule, stated in its own file comment: *"Same message for expired, already-used, and unknown-token cases — never let the response distinguish which case it was (no oracle, mirrors `AuthService.login`'s dummy-hash compare)."* A revoked account must fold into that same undifferentiated bucket — a distinct "this account is deactivated" message would let anyone probe whether a given email is currently revoked, which is itself a minor info leak the rest of this file goes out of its way to avoid. Reusing `INVALID_OR_EXPIRED_MESSAGE` costs nothing and stays consistent.

Rejecting *before* the `$transaction`'s atomic `updateMany` claim (rather than claiming the token and then rejecting) is simpler, not just stylistically — there's no legitimate scenario where a revoked user's token becomes usable later (revocation isn't time-limited; only a fresh admin re-invite restores access, which issues a *new* token via a different path). Consuming it here would add complexity with no corresponding benefit.

### Scope boundary — `requestReset` is deliberately NOT touched

`PasswordResetService.requestReset` (the "forgot password" entry point) still issues a token for a revoked user's email today, same as before this fix. That's fine: the token being issued isn't the vulnerability — a revoked user successfully *consuming* one to flip `isActive` back to `true` is, and Task 1 closes that at the only place it can actually happen. Leaving `requestReset` unchanged also avoids touching its existing no-account-enumeration guarantee (`if (!user) return;`) and its fire-and-forget email-sending pattern — both fragile-by-design per their own comments, not worth risking for a change that isn't required to close the actual hole. If you're tempted to "also" skip issuing a token for revoked users in `requestReset`, don't — that's out of scope for this story and would need its own AC/decision.

### Project Structure Notes

- Single file changed in `apps/api`: `apps/api/src/auth/password-reset.service.ts` (one new `findUnique` call + one guard clause).
- Test file extended, not replaced: `apps/api/src/auth/password-reset.service.spec.ts`.
- No schema, migration, DTO, controller, or frontend changes.

### References

- [Source: _bmad-output/implementation-artifacts/epic-1-retro-2026-08-26.md] — where this was surfaced and prioritized
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#Story 1.7] — original prediction of this exact gap (verbatim quoted above)
- [Source: apps/api/src/auth/password-reset.service.ts#confirmReset] — the function being fixed
- [Source: apps/api/src/users/users.service.ts#revokeAccess] — the Story 1.12 code that made the gap reachable
- [Source: apps/api/prisma/schema.prisma#User] — `passwordHash String?` nullability, the signal this fix relies on
- [Source: apps/api/src/auth/password-reset.service.spec.ts] — existing `activeUser`/`pendingUser` fixtures and test shape to extend

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `npx jest src/auth/password-reset.service.spec.ts` — 12/12 passed (initial implementation)
- `npx jest` (full `apps/api` suite) — 107/107 passed, no regressions (initial implementation)
- `npx eslint src/auth/password-reset.service.ts src/auth/password-reset.service.spec.ts` — clean (one prettier formatting issue auto-fixed)
- `npx tsc --noEmit` — clean
- Post-review (decision + 3 patches applied): `npx prisma migrate deploy` against local Postgres (Docker Desktop started mid-session) — migration `20260830202457_add_user_revoked_at` applied cleanly
- `npx jest src/auth/password-reset.service.spec.ts` — 16/16 passed
- `npx jest` (full `apps/api` suite) — 111/111 passed
- `npx jest --config test/jest-e2e.json` (full e2e suite, against live Postgres) — 34/34 passed (one suite's `beforeAll` timed out on the very first run — Docker/Postgres cold-start under concurrent suite load; re-ran in isolation and then the full suite again, both clean)
- `npx eslint` on all touched files — clean
- `npx tsc --noEmit` — clean

### Completion Notes List

- Added the guard clause exactly as specified: `!user.isActive && user.passwordHash !== null` → reject with the existing `INVALID_OR_EXPIRED_MESSAGE`, placed before `$transaction` so a revoked user's token is never consumed (AC #1, #4).
- `findUnique` result is typed nullable by `strictNullChecks`; added `!user ||` to the guard as a defensive fallback (FK guarantees `resetToken.userId` always resolves to a real user in practice — this only satisfies the type checker, it doesn't add a new reachable branch).
- Extended `password-reset.service.spec.ts`: new `revokedUser` fixture, new rejection test, and added `user.findUnique` mocks to the three existing `confirmReset` tests that now reach the new lookup (`sets the new password...`, `rejects instead of reusing a token already claimed...`, `activates a pending account...`) — without these the new call would resolve `undefined` and throw a `TypeError` instead of exercising the intended guard path.
- No e2e test added for the password-reset confirm flow — pre-existing gap (unit-level coverage only), same as before this story; flagging per the task's instruction rather than silently leaving it unmentioned.
- **Post-review addendum (code-review decision, Adrian's option 1):** added `User.revokedAt` (migration `20260830202457_add_user_revoked_at`) to fix a regression the review found — the original guard also blocked a legitimate re-invite-of-a-revoked-family-user flow. See Review Findings above for full detail. `revokedAt` is set by `revokeAccess`, cleared on every reactivation path, and compared against `resetToken.createdAt` in the guard. Migration verified against a live local Postgres (`prisma migrate deploy`, then full unit + e2e suites) later in the same session.
- **Post-review addendum (3 patches applied):** TOCTOU fix turned `tx.user.update` into a conditional `tx.user.updateMany` re-verifying the guard atomically at commit time; timing-side-channel fix awaits a real bcrypt hash before rejecting a stale-token-on-revoked-account attempt; added the missing `!user` branch test. See Review Findings above for detail on each.

### File List

- `apps/api/prisma/schema.prisma` (modified — added `User.revokedAt`)
- `apps/api/prisma/migrations/20260830202457_add_user_revoked_at/migration.sql` (new)
- `apps/api/src/auth/password-reset.service.ts` (modified)
- `apps/api/src/auth/password-reset.service.spec.ts` (modified)
- `apps/api/src/auth/invite-code.service.ts` (modified — clears `revokedAt` on reactivation)
- `apps/api/src/auth/invite-code.service.spec.ts` (modified)
- `apps/api/src/users/users.service.ts` (modified — `revokeAccess` sets `revokedAt`)
- `apps/api/src/users/users.service.spec.ts` (modified)
- `_bmad-output/implementation-artifacts/deferred-work.md` (modified — deferred finding appended)

## Change Log

- 2026-08-30: Story implemented on branch `fix/2-0-fix-revoked-user-reactivation-via-password-reset` — added the `!user.isActive && user.passwordHash !== null` guard to `PasswordResetService.confirmReset`, before the token-claiming transaction. All 4 ACs covered; 12/12 `password-reset.service.spec.ts` tests passing (1 new), 107/107 full `apps/api` suite passing (no regressions), lint and `tsc --noEmit` clean. Status → review.
- 2026-08-30: Code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor) — 1 decision-needed, 3 patch, 1 defer, 7 dismissed. Decision resolved (Adrian: option 1, `revokedAt` timestamp) and all 3 patches applied same session: TOCTOU fix (atomic `updateMany` re-check inside the transaction), timing-side-channel fix (dummy bcrypt hash before rejecting), and the missing `!user`-branch test. Migration applied and verified against local Postgres; 111/111 unit + 34/34 e2e passing, lint/`tsc --noEmit` clean. Status → review (unchanged; ready for human review/merge).
