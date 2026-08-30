# Story 2.0: Fix — revoked user can self-reactivate via password reset

Status: ready-for-dev

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

- [ ] Task 1: Fix `PasswordResetService.confirmReset` (AC #1, #2, #3, #4)
  - [ ] In `apps/api/src/auth/password-reset.service.ts`, after the existing `resetToken` lookup/null-check and before the `passwordService.hash(newPassword)` call, fetch the target user (`this.prisma.client.user.findUnique({ where: { id: resetToken.userId }, select: { isActive: true, passwordHash: true } })`)
  - [ ] Reject with the existing `INVALID_OR_EXPIRED_MESSAGE` (same `BadRequestException`, do not add a new message string — see Dev Notes on why a distinct message would itself be a leak) when `!user.isActive && user.passwordHash !== null` — this is the exact "was active, now revoked" signature; a never-activated pending user (`passwordHash === null`) must fall through and activate normally (AC #2)
  - [ ] This check must happen **before** the `$transaction` that claims the token — do not consume the token for a rejected revoked-user attempt (AC #4)
  - [ ] Leave the rest of `confirmReset` (the atomic `updateMany` single-use claim, the `tx.user.update({ ..., isActive: true })`, the outstanding-token invalidation) exactly as-is — this fix is a guard clause, not a rewrite
- [ ] Task 2: Tests
  - [ ] Extend `apps/api/src/auth/password-reset.service.spec.ts`'s `describe('confirmReset', ...)` block: add a `revokedUser` fixture (`{ ...activeUser, id: 'user-3', isActive: false }` — keep `passwordHash: 'hashed'`, that's the distinguishing field) and a new test `'rejects a reset attempt for a revoked (deactivated) account without reactivating it'` — assert `BadRequestException` is thrown, `prisma.client.user.update`/`tx.user.update` is never called, and `passwordResetToken.updateMany` (the token-claiming call) is never called either (AC #4)
  - [ ] Run the existing `'activates a pending account on confirm — it can log in afterwards'` test (uses `pendingUser`, already in the file) after the fix — it must still pass unmodified; if it doesn't, the guard condition is wrong (should be `passwordHash !== null`, not just `!isActive`)
  - [ ] No e2e test currently exists for the password-reset confirm flow (checked `apps/api/test/` — no `password-reset*.e2e-spec.ts`; coverage today is unit-level only via the spec file above). Adding one is optional for this story — the unit-level fix + regression test is sufficient given the existing coverage pattern, but flag it in Completion Notes as a pre-existing gap if you don't add one, don't silently leave it unmentioned.

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

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
