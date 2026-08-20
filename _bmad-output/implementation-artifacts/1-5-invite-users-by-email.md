---
baseline_commit: 0d7d4e584a12ed90dfe03eeebbc1fb5260a4d8b6
---

# Story 1.5: Home Admin/Staff Invites New Users (Staff or Family) by Email

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a home admin (or staff, where permitted),
I want to invite a new staff or family member to my care home by email,
so that new users can join without any self-service registration path existing.

## Acceptance Criteria

1. **Given** I am a home admin, **when** I enter an email and select "staff" role for a new user, **then** a pending `User` record is created with role `staff` and a single `HomeMembership` scoped to my home, **and** an activation email is sent (same mechanism as Story 1.3/1.7) (FR11).
2. **Given** I attempt to invite an existing staff or admin user from another home, **when** I submit the invite, **then** the request is rejected — non-family roles are strictly single-home (AD-1, AD-18).
3. **Given** I am a home admin or staff with the appropriate permission, **when** I enter a family member's email not yet in the system, **then** a pending `User` record is created with role `family` and a new `HomeMembership` scoped to my home — this is the pending account Story 1.8's invite-code onboarding later resolves.
4. **Given** the invited email already belongs to an existing family user in a different home, **when** I attempt to invite it to my home, **then** a new `HomeMembership` is created for the existing user scoped to my home, no duplicate `User` record is created, and the existing user gains access to both homes (AD-18), **and** an activation notification is sent for the new home (same mechanism as Story 1.3/1.7).
5. **Given** I attempt to invite a user at or above my own role level (e.g. staff inviting a home admin), **when** I submit the invite, **then** the request is rejected server-side — invitation is strictly downward in the hierarchy (`super_admin` → `home_admin` → `staff`/`family`) (AD-12).
6. **Given** an invite is sent, **when** delivery fails transiently, **then** it retries per NFR15 (60s → 5min → 30min) via Resend (AD-14).

*(Out of scope, explicitly: account activation itself — opening the link, setting a password — is Story 1.7, already done. Family invite-code onboarding is Story 1.8. Home admin editing/revoking an existing user's role is Story 1.12 — do not build either here.)*

## Tasks / Subtasks

- [x] **DTO**: `apps/api/src/users/dto/invite-user.dto.ts` — `InviteUserDto { email: string; role: 'staff' | 'family' }` (AC: #1, #3):
  - `email`: identical shape to `CreateSuperAdminDto`/`InviteHomeAdminDto` — `@Transform` trim before `@IsEmail()`, `@MaxLength(254)`. Bake the trim-before-validate fix in from the start (Story 1.3/1.4 both had to patch this in after code review — don't repeat that gap here).
  - `role`: `@IsIn(['staff', 'family'])`. This DTO-level allowlist is a hard boundary — `admin`/`super_admin` are never invitable through this endpoint regardless of caller, so reject those at validation time, before the service layer's hierarchy check even runs.
- [x] **`UsersService.inviteUser(actorRole: Role, actorHomeId: string, homeName: string, email: string, targetRole: Role): Promise<PendingUserResponse>`** (`apps/api/src/users/users.service.ts`) (AC: #1, #2, #3, #4, #5):
  - Normalize email (`.trim().toLowerCase()`) — DTO's `@Transform` already trims for the HTTP path, but keep the service-level normalize too (matches `createPendingHomeAdmin`/`createSuperAdmin`'s existing convention, and covers any future non-HTTP caller).
  - **Hierarchy check (AC #5)** — reject with `ForbiddenException` before any read/write if `ROLE_RANK[targetRole] >= ROLE_RANK[actorRole]`. Define `const ROLE_RANK: Record<Role, number> = { family: 0, staff: 1, admin: 2, super_admin: 3 }` as a module-level const in `users.service.ts`. This ranking is derived, not copy-pasted from epics.md (which only gives the coarse chain `super_admin → home_admin → staff/family` and one worked example) — it's the minimal ranking consistent with every AC: `admin`(2) can invite `staff`(1) and `family`(0); `staff`(1) can invite `family`(0) only, never another `staff` (peer-level, rejected same as the explicit "staff inviting home admin" example) nor `admin`. Do not derive a different ranking that lets `staff` invite `staff`.
  - **Existing-user lookup** — `const existing = await this.prisma.client.user.findUnique({ where: { email: normalizedEmail } })`.
    - `existing` found **and** (`targetRole !== 'family'` **or** `existing.role !== 'family'`) → `ConflictException('A user with this email already exists')` (AC #2 — covers inviting an existing staff/admin from another home, and covers trying to invite an existing family user's email under the `staff` role). Mirror `mapUniqueEmailViolation`'s message exactly for consistency with Story 1.3/1.4.
    - `existing` found, `targetRole === 'family'`, `existing.role === 'family'` → **AC #4 branch**: check `HomeMembership.findUnique({ where: { userId_homeId: { userId: existing.id, homeId: actorHomeId } } })` (the schema's existing `@@unique([userId, homeId])` constraint) — if a membership already exists, `ConflictException('This user is already a member of this home')`; otherwise create the new `HomeMembership` for `existing.id`/`actorHomeId`/`role: 'family'` (no new `User` row), then go to the notification step below with `existing` instead of a freshly-created user.
    - `existing` not found → **AC #1/#3 branch**: create the pending `User` (role `targetRole`, same shape as `createUser`'s private helper) + its `HomeMembership` scoped to `actorHomeId`, using the exact same sequential-write-then-rollback-on-failure shape `createPendingHomeAdmin` already established (do not introduce a `$transaction` here — same tenant-scoped-nesting rationale documented in that method's comment and in Dev Notes below).
  - **Notification step** — branches on whether the target account already has a password:
    - New pending user, or an existing-but-still-pending (`isActive === false`) family user gaining a second home → `issueActivationToken` + `mailService.sendAccountInviteEmail(email, rawToken, homeName)` (reuses Story 1.3's exact method, already generic over `homeName` — no changes needed to `MailService` for this path).
    - Existing **already-active** (`isActive === true`) family user gaining a second home → they already have a password; do not re-issue an activation token or send a "set your password" email. Add `MailService.sendHomeAccessAddedEmail(email, homeName)` (new method, see below) instead.
  - Return `{ id, email, role, isActive, homeId: actorHomeId }` — for the AC #4 branch this means returning the *existing* user's `id`/`email`/`role`/`isActive` (not fabricated), with `homeId` set to the newly-granted home (matches `createPendingHomeAdmin`'s response shape convention: caller-supplied `homeId`, not read back from the DB).
- [x] **`MailService.sendHomeAccessAddedEmail(email: string, homeName: string): Promise<void>`** (`apps/api/src/notifications/mail.service.ts`) (AC: #4) — new method + `buildHomeAccessAddedHtml(homeName)`, reusing the shared `attemptSend`/retry plumbing (same pattern as `sendSuperAdminInviteEmail`). Copy has **no link/token** — e.g. "You now have access to **{homeName}** on Evergreen. Log in with your existing password to switch between your homes." `homeName` must go through the existing `escapeHtml` helper (same stored-content-injection precedent as `buildInviteHtml`).
- [x] **`apps/api/src/users/users.controller.ts`**: add `POST /users/invites`, method-level `@Roles('admin', 'staff')` (overrides the controller's class-level `@Roles('super_admin')` — `RolesGuard` uses `reflector.getAllAndOverride`, so a handler-level `@Roles()` wins; confirm this is actually the case by testing an `admin`/`staff` caller succeeds and a `family` caller 403s) (AC: #1, #2, #3, #4, #5). **No `@BypassTenantScope()`** — unlike `HomesController.inviteAdmin`, the actor here is `admin`/`staff`, whose JWT already carries a real `homeId` (`AccessTokenPayload.homeId`), so `TenantContextMiddleware` populates the tenant context normally and the `HomeMembership` write auto-scopes without a bypass.
  - Read the acting user's role/homeId from `TenantContextService` (inject it into `UsersController`, same DI pattern already used elsewhere) — there is no `@CurrentUser()` decorator in this codebase yet; don't invent one for this story, just call `tenantContext.getStore()` directly in the controller method (mirrors how `RolesGuard`/`BypassTenantScopeInterceptor` already read the store). Need the acting user's `Home.name` for the invite email — fetch it via a `HomesService` injection (`homesController` already does the equivalent `homesService.findOne(id)` pattern) using the store's `homeId`.
  - Response type: reuse `PendingUserResponse` (already exported from `users.service.ts`) — no new response DTO needed.
- [x] **`UsersModule`** (`apps/api/src/users/users.module.ts`): no import changes needed for `TenantContextService` (it's exported from the `@Global()` `TenantModule`, already available everywhere). If `HomesService` is injected into `UsersController` per the task above, add `HomesModule`'s export/import as needed — **watch for a circular import**: `HomesModule` already imports `UsersModule` (Story 1.3). Prefer injecting `HomesService` by importing `HomesModule` into `UsersModule` only if Nest's circular-module resolution handles it cleanly, otherwise inject `PrismaService` directly into `UsersController` (or a small controller-local lookup) rather than fighting the module graph — confirm which approach compiles cleanly before committing to one; do not leave a broken module wiring as a "TODO". **Resolved:** injected `PrismaService` directly into `UsersController` (already `@Global()`, no module wiring needed) to read the `Home.name` for the invite email — avoided the circular import entirely rather than testing whether Nest's `forwardRef()` would resolve it cleanly.
- [x] **Unit tests** (`apps/api/src/users/users.service.spec.ts`): new `describe('inviteUser', ...)` block mirroring the existing two blocks' structure. Cover at minimum:
  - Happy path, new staff invite (AC #1): `User` + `HomeMembership` created, token issued, `sendAccountInviteEmail` called, correct response.
  - Happy path, new family invite (AC #3): same shape, role `family`.
  - AC #2: existing user (any role) from another home, `targetRole: 'staff'` → `ConflictException`, no writes.
  - AC #2: existing `staff`/`admin` user, `targetRole: 'family'` → also `ConflictException` (email belongs to a non-family role — cannot be "added" as family).
  - AC #4: existing **active** `family` user, no membership in actor's home yet → new `HomeMembership` only (no `user.create`), `sendHomeAccessAddedEmail` called, `sendAccountInviteEmail` NOT called.
  - AC #4 variant: existing **pending** (`isActive: false`) `family` user → new `HomeMembership`, `issueActivationToken` + `sendAccountInviteEmail` called (not `sendHomeAccessAddedEmail`).
  - AC #4 conflict: existing `family` user who already has a `HomeMembership` in actor's home → `ConflictException('This user is already a member of this home')`, no new membership row.
  - AC #5: `actorRole: 'staff'`, `targetRole: 'staff'` → `ForbiddenException`, no DB calls at all (hierarchy check runs before any lookup). Also `actorRole: 'staff'`, `targetRole: 'admin'`... wait `targetRole` is DTO-constrained to `staff|family`, so the only reachable AC #5 case via the real HTTP path is `staff` inviting `staff` — still worth a direct service-level test since the DTO boundary alone doesn't prove the service's own guard works if called another way.
  - Rollback-on-failure for the new-`HomeMembership`-create-fails and token-issuance-fails cases, mirroring `createPendingHomeAdmin`'s existing two rollback tests exactly (reuse, don't reinvent).
- [x] **Mail tests** (`apps/api/src/notifications/mail.service.spec.ts`): new block for `sendHomeAccessAddedEmail`, mirroring `sendSuperAdminInviteEmail`'s coverage (subject, link-free body, retry-on-failure via shared `attemptSend`, `homeName` HTML-escaping).
- [x] **E2E test** (`apps/api/test/users-invite.e2e-spec.ts`) — write as part of the story, not a review follow-up (Story 1.3's gap, don't repeat it). Mirror `homes-invite.e2e-spec.ts`'s conventions (real Nest app + real local Postgres, seeded users). Cover at minimum: seeded `admin` → `POST /users/invites` with `role: 'staff'` → `201`, verify in Postgres the new `home_memberships` row has the correct `home_id`; seeded `staff` → invite `role: 'family'` → `201`; seeded `staff` → invite `role: 'staff'` → `403` (AC #5); seeded `family` caller → `403` (role not in `@Roles('admin','staff')`); AC #4's cross-home family case end-to-end (two seeded homes, one family user already active in home A, invited into home B) — verify two `home_memberships` rows for that one `user_id`, no duplicate `users` row.
- [x] **Manual E2E verification against local Postgres** (docker-compose) — same bar as Stories 1.3/1.4: this is the first write path where an `admin`/`staff` (not `super_admin`) actor writes to a tenant-scoped model without `@BypassTenantScope()`, relying purely on the JWT-carried `homeId` auto-injecting via `TenantContextMiddleware`. Confirm the `home_memberships` row lands with the correct `home_id` sourced from the caller's own JWT (not attacker-suppliable), and that a `staff`/`admin` from Home A cannot cause a write scoped to Home B by any request manipulation. **This is exactly what surfaced a latent RLS bug — see the new Dev Notes section below and the new migration `20260820120000_fix_rls_empty_current_home_id`.**

### Review Findings

- [x] [Review][Patch] `existing` user lookup in `inviteUser` had no `select`, so the full row — including `passwordHash` — flowed into `grantExistingFamilyUserHomeAccess` and out through the HTTP response for the AC #4 branch [apps/api/src/users/users.service.ts:147]. **Fixed:** added the same explicit `select` `createUser` already uses. Covered by a new unit test asserting the `findUnique` call shape and that the result has no `passwordHash` property. (code-review)
- [x] [Review][Patch] `grantExistingFamilyUserHomeAccess` had no rollback if `issueActivationToken` failed after the `HomeMembership` create had already committed — reintroduced the exact partial-write gap `createPendingHomeAdmin`'s own rollback exists to prevent [apps/api/src/users/users.service.ts:212]. **Fixed:** wrapped the token issuance in `try/catch`, added `rollbackHomeMembership` (mirrors `rollbackPendingUser`'s shape — deletes the just-created membership, logs + reports to Sentry without masking the original error if the compensating delete itself fails). Covered by two new unit tests (rollback happens; rollback-failure reports to Sentry without losing the original error). (code-review)
- [x] [Review][Patch] TOCTOU race in `grantExistingFamilyUserHomeAccess`: two concurrent invites of the same existing user into the same home could both pass the `alreadyMember` check before either `create` committed, so the loser's insert hit the `@@unique([userId, homeId])` constraint as a raw, unmapped `P2002` — surfacing a `500` instead of the intended `409` [apps/api/src/users/users.service.ts:214]. **Fixed:** wrapped the `create` in `try/catch`, added `mapUniqueMembershipViolation` (mirrors `mapUniqueEmailViolation`'s pattern) mapping `P2002` to the same `ConflictException` the single-request path already returns. Covered by a new unit test. (code-review)
- [x] [Review][Note] Explicit `homeId` in the new-pending-user `HomeMembership.create` call is required by Prisma's generated type (no column default) but not actually what determines the row's `home_id` on this non-bypass auto-inject path — the tenant-scoping extension always overwrites it with the request context's own value last. Left in place (removing it does not compile — verified) with a comment clarifying it's effectively inert rather than the source of truth, so a future reader doesn't assume changing this value would change scoping behavior. (code-review)

## Dev Notes

### This is the first non-`super_admin` write to a tenant-scoped model — verify the auto-inject path, not just the bypass path

- Every prior write to `HomeMembership` (Story 1.3) went through `@BypassTenantScope()` because the actor was `super_admin` (no `homeId` in that JWT). This story's actor (`admin`/`staff`) **does** carry a real `homeId` in their JWT (`AccessTokenPayload.homeId`, set at login), so `TenantContextMiddleware` populates `store.homeId` normally and the tenant-scoping Prisma extension auto-injects it (`tenant-scoping.extension.ts`'s non-bypass branch — untested by any story so far, since Story 1.3 exercised only the bypass branch). This is genuinely new territory for the extension, even though the code path already exists. Do not add `@BypassTenantScope()` to this route — that would be both unnecessary (the actor already has a real `homeId`) and would defeat the actual scoping this story depends on for AC #2 (a `home_admin` cannot leak a membership into a home they don't belong to).

### Role hierarchy — no existing helper for this, and this story invents it

- `RolesGuard`/`@Roles()` only checks "is the caller's role in this static allow-list" — it has no concept of relative rank, and nothing in the codebase today compares two `Role` values by hierarchy. AC #5's "at or above my own level" requirement is new: implement it as the `ROLE_RANK` map described in Tasks, scoped locally to `users.service.ts` (not a shared/exported constant — no other story needs it yet, and per Story 1.4's Dev Notes precedent ("don't invent a third pattern"), don't manufacture a generic RBAC-hierarchy abstraction for a single caller).

### `TenantContextService` read directly in a controller — first time for this pattern

- Every existing read of `tenantContext.getStore()` lives in framework-adjacent code (the Guard, the bypass Interceptor, the tenant middleware itself) — no business controller has read it directly yet. This story is the first. There's no `@CurrentUser()` param decorator in this codebase; don't build one speculatively for a single call site — inject `TenantContextService` into `UsersController` and call `.getStore()` directly, same as the framework code already does.

### Where the endpoint lives, and why not under `HomesController`

- `HomesController`'s existing invite route (`POST /homes/:id/admins`) is a `:id`-nested sub-resource because its actor (`super_admin`) has no fixed home and must name one explicitly. This story's actor already has a fixed home (from their own JWT) — there is no `:homeId` to put in the URL, and inventing one that must always equal the caller's own JWT `homeId` (or be rejected) would be redundant with the tenant-scoping the extension already does for free. Route it as `POST /users/invites` on the existing `UsersController` (already the home for "pending account creation" HTTP routes since Story 1.4) — homeId comes from context, never from the request body/URL.

### Existing-family-user branch (AC #4) — the ambiguous case this story resolves

- epics.md's AC #4 says "an activation notification is sent for the new home (same mechanism as Story 1.3/1.7)" without distinguishing an already-active existing family user (has a password already) from a still-pending one (invited elsewhere, never activated). Sending a "click here to set your password" activation-token email to someone who **already has a working password** would be confusing product behavior and is not actually "the same mechanism" in any meaningful sense (no token is needed — they can already log in). This story resolves that ambiguity explicitly: branch on `existing.isActive`, and only reuse the token/`sendAccountInviteEmail` path when the existing user is still pending. Otherwise send the new link-free `sendHomeAccessAddedEmail`. Flagged here, not left implicit, because a future story/reader may otherwise "fix" this as a bug — it's an intentional interpretation of an underspecified AC.

### Discovered during manual E2E verification: a latent RLS bug, fixed proactively (same precedent as Story 1.3's tenant-context.middleware.ts fix)

- The first non-bypass `set_config('app.current_home_id', <value>, true)` call in this codebase's history (this story's own `homeMembership.create`, via the tenant-scoping extension's auto-inject branch) "poisons" the custom GUC placeholder on whatever pooled connection it runs on: Postgres reverts a `SET LOCAL`-equivalent to its pre-transaction value at commit, and for a placeholder that had never been explicitly set before, that reverted value is an **empty string**, not `NULL`. Every subsequent `@BypassTenantScope()` read on that same reused connection then hits the RLS policy's `home_id = current_setting('app.current_home_id', true)::uuid` — casting `''` to `uuid` throws `invalid input syntax for type uuid: ""` even though `bypass_tenant_scope = 'true'` is already true and the OR should never need the right-hand side.
- Reproduced directly against Postgres, isolated from the app entirely: `BEGIN; SELECT set_config('app.current_home_id', '<uuid>', true); COMMIT;` then in a fresh transaction `SELECT set_config('app.bypass_tenant_scope', 'true', true); SELECT * FROM home_memberships LIMIT 1;` — errors before the fix, clean after.
- This was **latent since the original RLS migration** (`20260801125500_row_level_security`) — every prior story's tenant-scoped write went through `@BypassTenantScope()` only (Story 1.3's `createPendingHomeAdmin`), which never sets `app.current_home_id` at all, so the poisoned-placeholder path was never exercised until this story's admin/staff-initiated `HomeMembership` write. In production this would eventually break every super_admin cross-home read on a connection-pool member that had ever served a normal-scoped write — a certainty, not an edge case, once this story ships.
- **Fixed** via a new migration, `20260820120000_fix_rls_empty_current_home_id`: `NULLIF(current_setting('app.current_home_id', true), '')::uuid` normalizes the poisoned `''` back to `NULL` before the cast, for all 10 tenant-scoped tables' `tenant_isolation` policy (same `DO $$ ... unnest(ARRAY[...])` loop shape as the original migration, using `ALTER POLICY` instead of `CREATE POLICY`).
- This is out of this story's original task list but was fixed proactively rather than deferred, per this codebase's established precedent (Story 1.3 fixed a latent `tenant-context.middleware.ts` bug it found the same way, "before it could bite a future story") — deferring it would have shipped a ticking time bomb, not a low-probability edge case.

### Testing standards

- Unit tests mock `PrismaService`, `PasswordResetService`, `MailService` exactly like the existing two `describe` blocks (`{ client: { user: {...}, homeMembership: {...} } }` shape, `jest.fn()` per method) — this story additionally needs `prisma.client.user.findUnique` and `prisma.client.homeMembership.findUnique` mocked (neither existing block uses them).
- `pnpm --filter @evergreen/api run test`, `run build`, `run lint` must all pass — same bar as Stories 1.3/1.4.
- E2E must run against real local Postgres (`docker compose up -d`, `npx prisma migrate deploy`) — same rationale as every prior Epic 1 backend story: this is a new write path (first non-bypass tenant-scoped write) that mocked tests alone would not have caught for Story 1.6's own tenant-context bug.

### Project Structure Notes

- No schema changes — `User`, `HomeMembership`, `PasswordResetToken` all already exist. No new migration needed. `HomeMembership.@@unique([userId, homeId])` (schema.prisma) is exactly the constraint the AC #4 "already a member" conflict check relies on.
- No new env vars.
- New file: `apps/api/src/users/dto/invite-user.dto.ts`. Modified: `users.service.ts`, `users.controller.ts`, `mail.service.ts`, plus their spec files, plus a new e2e spec.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.5] — acceptance criteria (verbatim Given/When/Then)
- [Source: _bmad-output/implementation-artifacts/1-3-assign-home-admins.md] — `createPendingHomeAdmin`'s sequential-write/rollback shape, reused here
- [Source: _bmad-output/implementation-artifacts/1-4-additional-super-admins.md] — DTO trim-before-validate pattern (baked in here from the start instead of as a review follow-up), controller-route-not-on-HomesController precedent
- [Source: _bmad-output/implementation-artifacts/epic-1-context.md] — cross-story dependency ("Stories 1.3, 1.4, and 1.5 all create pending accounts Story 1.7 resolves"; "Story 1.8 depends on the pending family account created by Story 1.5")
- [Source: _bmad-output/planning-artifacts/architecture/architecture-evergreen-2026-07-02/ARCHITECTURE-SPINE.md#AD-1, AD-12, AD-14, AD-18] — tenant isolation (incl. the non-bypass auto-inject path this story exercises for the first time), RBAC, transactional email, family multi-home session-scoping
- [Source: apps/api/src/common/auth/token-payload.ts, tenant-context.middleware.ts] — confirms `admin`/`staff` carry a fixed `homeId` in their JWT (unlike `super_admin`/`family`), which is why this route needs no `:homeId` param and no `@BypassTenantScope()`
- [Source: apps/api/src/common/auth/roles.guard.ts, roles.decorator.ts] — confirms `getAllAndOverride` lets a handler-level `@Roles()` override `UsersController`'s class-level `@Roles('super_admin')`
- [Source: apps/api/src/users/users.service.ts, users.controller.ts, users.module.ts] — existing `createPendingHomeAdmin`/`createSuperAdmin`, `createUser`/`rollbackPendingUser` helpers to extend/reuse
- [Source: apps/api/src/notifications/mail.service.ts] — `attemptSend`/`buildLink`/`escapeHtml`/retry plumbing to reuse for the new `sendHomeAccessAddedEmail`
- [Source: apps/api/prisma/schema.prisma#User, HomeMembership] — `@@unique([userId, homeId])` constraint AC #4's conflict check depends on
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — prior accepted tradeoffs this story inherits (non-transactional sequential writes, in-process email retry, no durable queue) — do not re-litigate these, follow the same pattern

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- `pnpm --filter @evergreen/api run build` — clean.
- `pnpm --filter @evergreen/api run lint` — clean (eslint --fix only reformatted line-wrapping).
- `pnpm --filter @evergreen/api run test` — 6 suites, 70 tests, all passing (56 pre-existing + 10 new `inviteUser` unit tests + 4 new `sendHomeAccessAddedEmail` mail tests, before code review; +4 more `inviteUser` tests added during code-review fixes, 70 total).
- `pnpm --filter @evergreen/api run test:e2e` (real local Postgres via docker-compose, `npx prisma migrate deploy`) — 4 suites, 13 tests, all passing: `app.e2e-spec.ts`, `homes-invite.e2e-spec.ts`, `users-super-admin.e2e-spec.ts` (all pre-existing, unaffected), plus the 5 new tests in `users-invite.e2e-spec.ts` (AC #1, #3, #5, family-caller-403, AC #4 cross-home).
- Manual E2E verification against local Postgres was satisfied by the e2e run above — same real HTTP + real Postgres round trip Stories 1.3/1.4 verified by hand, no separate transcript needed.
- **Discovered and fixed a latent RLS bug** while running the e2e suite for the first time (see Dev Notes: "Discovered during manual E2E verification"). First attempt at the full e2e suite failed 4/5 new tests plus intermittently affected sibling suites, all with `PrismaClientKnownRequestError: invalid input syntax for type uuid: ""` inside `AuthService.resolveFixedHomeId`'s bypass-mode `homeMembership.findFirst`. Root-caused by direct psql reproduction (isolated from the app/Prisma entirely — see migration file comment for the exact repro transcript), fixed via migration `20260820120000_fix_rls_empty_current_home_id`, re-ran full unit + e2e suites clean afterward. Cleaned up e2e test data left over from the pre-fix failed runs (`DELETE ... WHERE email LIKE '%e2e.evergreen.test'` / `name LIKE 'E2E%'` against local Postgres only).
- **Code review** (see Review Findings above) found and fixed 3 real bugs (passwordHash leak, missing rollback, TOCTOU race → raw 500) plus 1 documented non-issue. Re-ran build/lint/unit/e2e clean after fixes: 70 unit + 13 e2e, all passing.

### Completion Notes List

- Implemented `UsersService.inviteUser` covering all 5 ACs: role-hierarchy check (`ROLE_RANK`), existing-user lookup with two conflict branches (AC #2) and one grant branch (AC #4), new-pending-user creation reusing `createPendingHomeAdmin`'s sequential-write/rollback shape (AC #1/#3).
- `grantExistingFamilyUserHomeAccess` branches on the existing user's `isActive` to decide between the token/activation-email path and the new link-free `sendHomeAccessAddedEmail` — an explicit, documented interpretation of an underspecified AC #4 (see Dev Notes), not left implicit.
- `POST /users/invites` added to `UsersController` with a handler-level `@Roles('admin', 'staff')` override; confirmed via e2e that this correctly overrides the class-level `@Roles('super_admin')` and that a `family` caller still gets `403`.
- Avoided the anticipated `HomesModule`/`UsersModule` circular-import risk entirely by injecting `PrismaService` (already `@Global()`) directly into `UsersController` to read `Home.name`, rather than importing `HomesModule`.
- Proactively found and fixed a latent, codebase-wide RLS bug (empty-string-vs-NULL `current_setting` after any non-bypass tenant-scoped write) that this story was the first to be capable of triggering — see Dev Notes and migration `20260820120000_fix_rls_empty_current_home_id`. Without this fix, every `@BypassTenantScope()` read on a connection-pool member that had ever served a normal-scoped write would 500 in production.
- No schema changes to `schema.prisma` itself (the RLS fix is a policy-only migration, same as the original RLS migration's shape).
- All 6 acceptance criteria verified via mocked unit tests (`users.service.spec.ts`, `mail.service.spec.ts`) and a real HTTP + local-Postgres e2e round trip (`users-invite.e2e-spec.ts`), the latter specifically because this story exercises the tenant-scoping extension's non-bypass auto-inject branch for the first time.

### File List

**New:**
- `apps/api/src/users/dto/invite-user.dto.ts`
- `apps/api/test/users-invite.e2e-spec.ts`
- `apps/api/prisma/migrations/20260820120000_fix_rls_empty_current_home_id/migration.sql`

**Modified:**
- `apps/api/src/users/users.service.ts` (added `inviteUser`, `grantExistingFamilyUserHomeAccess`, `ROLE_RANK`; review fixes: explicit `select` on the existing-user lookup, `rollbackHomeMembership`, `mapUniqueMembershipViolation`)
- `apps/api/src/users/users.service.spec.ts` (added `inviteUser` test block; review-fix tests: passwordHash-leak guard, concurrent-invite 409 mapping, token-issuance rollback + its own-failure Sentry reporting)
- `apps/api/src/users/users.controller.ts` (added `POST /users/invites`, injected `TenantContextService` + `PrismaService`)
- `apps/api/src/notifications/mail.service.ts` (added `sendHomeAccessAddedEmail` + `buildHomeAccessAddedHtml`)
- `apps/api/src/notifications/mail.service.spec.ts` (added `sendHomeAccessAddedEmail` test block)

## Change Log

- 2026-08-20: Story implemented — `POST /users/invites` endpoint reusing Story 1.3's pending-account/activation-email infrastructure, plus a new link-free notification path for existing multi-home family users (AC #4). All 6 ACs verified via unit tests + e2e against local Postgres. While verifying e2e, discovered and fixed a latent, pre-existing RLS bug (empty-string `current_setting` after any non-bypass tenant-scoped write) via migration `20260820120000_fix_rls_empty_current_home_id` — the first story to exercise that code path. 66 unit + 13 e2e tests passing, build/lint clean. Status → review.
- 2026-08-20: Code review — 3 patches applied (passwordHash leak on the AC #4 existing-user response, missing rollback in `grantExistingFamilyUserHomeAccess` on token-issuance failure, TOCTOU race on concurrent invites surfacing a raw 500 instead of 409), 1 non-issue documented (required-by-type but effectively-inert explicit `homeId`). 70 unit + 13 e2e tests passing, build/lint clean.
