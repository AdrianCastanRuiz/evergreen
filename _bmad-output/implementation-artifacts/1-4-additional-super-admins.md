---
baseline_commit: d7c12bfb6d2d0c464f75f88edb0c9c0c915b1482
---

# Story 1.4: Super Admin Creates Additional Super Admins

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a super admin,
I want to create additional super admin accounts,
so that platform-level administration isn't a single point of failure.

## Acceptance Criteria

1. **Given** I am a super admin, **when** I enter an email and select the "super admin" role, **then** a pending `User` record is created with role `super_admin` and **no `HomeMembership`/home scope at all** (unlike Story 1.3's admin invite, this role has no home to scope to), **and** an activation email is sent via the same one-time-link mechanism Story 1.3/1.7 already built (FR49).
2. **Given** I am not a super admin, **when** I attempt to create a super admin account, **then** the request is rejected server-side with `403` before any DB write — the highest-privilege role is never creatable by a lower role (AD-12). Already covered by a class-level `@Roles('super_admin')`, same precedent as `HomesController`.

*(Out of scope, explicitly: account activation — opening the link, setting a password — is Story 1.7, already done. Role-based navigation after login is Story 1.10. Do not build either here.)*

## Tasks / Subtasks

- [x] **DTO**: `apps/api/src/users/dto/create-super-admin.dto.ts` — `CreateSuperAdminDto { email: string }`, `@IsEmail() @MaxLength(254)` (AC: #1) — copy `InviteHomeAdminDto`'s exact decorators (`apps/api/src/homes/dto/invite-home-admin.dto.ts`). Don't reuse that class directly across two unrelated routes even though the shape matches — every other DTO in this codebase is one-per-endpoint.
- [x] **`UsersService.createSuperAdmin(email: string): Promise<PendingUserResponse>`** (`apps/api/src/users/users.service.ts`) (AC: #1):
  - Normalize email (`.trim().toLowerCase()`), `role: Role = 'super_admin'`.
  - Reuse the existing private `createUser(email, role)` helper as-is — it's already generic over `role` and already maps `P2002` → `ConflictException` (the same global-email-uniqueness conflict Story 1.3 formalized as AC #3; here it's inherited for free from the shared helper, not a new behavior to design).
  - **No `homeMembership.create` call** — `super_admin` has no `home_id` anywhere in the schema (confirmed: `User` has no `homeId` column; home scoping only exists via the `HomeMembership` join table, which this role never gets a row in).
  - `try { await this.passwordResetService.issueActivationToken(user.id) } catch { await this.rollbackPendingUser(user.id, error); throw error }` — reuse the existing `rollbackPendingUser` helper unchanged. Structurally this is `createPendingHomeAdmin` minus its middle `homeMembership.create` step; keep the same shape for consistency within the file rather than reaching for `$transaction` (see Dev Notes — a transaction is technically safe here, unlike Story 1.3, but reusing the established two-write/rollback shape keeps `UsersService`'s two "create pending X" methods structurally parallel and avoids maintaining two different write patterns in one small service for no behavioral gain).
  - Fire-and-forget the invite email exactly like `createPendingHomeAdmin` does (`.catch(() => {})`, never awaited by the HTTP response).
  - Return `{ ...user, homeId: null }`.
- [x] **Widen `PendingUserResponse.homeId`** to `string | null` (`apps/api/src/users/users.service.ts`) — currently typed as a required `string`; `createPendingHomeAdmin`'s existing usage is unaffected (always passes a real string), `createSuperAdmin` needs `null`.
- [x] **`MailService.sendSuperAdminInviteEmail(email, rawToken): Promise<void>`** (`apps/api/src/notifications/mail.service.ts`) (AC: #1) — **do not reuse `sendAccountInviteEmail`**: its required `homeName` parameter is baked into the email copy ("help manage **{homeName}** on Evergreen"), which doesn't apply to a platform-level super-admin invite. Add a sibling method + `buildSuperAdminInviteHtml(link)` with distinct copy (e.g. "You've been invited to become a super admin on Evergreen platform-wide."), reusing the shared `buildLink`/`attemptSend` plumbing (same subject-line/retry/logLabel pattern as the other two `send*Email` methods).
- [x] **New `apps/api/src/users/users.controller.ts`**: `@Controller('users') @Roles('super_admin')`, `POST /users/super-admins` → `@HttpCode(HttpStatus.CREATED)`, calls `usersService.createSuperAdmin(dto.email)` (AC: #1, #2). **No `@BypassTenantScope()`** — unlike Story 1.3's route, this one never touches a tenant-scoped model, so there's nothing to bypass.
- [x] **`UsersModule`** (`apps/api/src/users/users.module.ts`): add `controllers: [UsersController]`. No new module needs importing into `AppModule` — `UsersModule` is already part of the graph (imported by `HomesModule`), and Nest mounts a module's controllers wherever it sits in the import graph.
- [x] **Unit tests** (`apps/api/src/users/users.service.spec.ts`): new `describe('createSuperAdmin', ...)` block mirroring the existing `createPendingHomeAdmin` block — happy path (`user.create` called with `role: 'super_admin'`, **no** `homeMembership.create` call, token issued, `sendSuperAdminInviteEmail` called, result has `homeId: null`), no-`passwordHash`-leak, duplicate-email → `ConflictException` with no token/email side effects, rollback-on-token-failure.
- [x] **Mail tests** (`apps/api/src/notifications/mail.service.spec.ts`): new block for `sendSuperAdminInviteEmail`, mirroring the existing `sendAccountInviteEmail` coverage (subject line, link construction, retry-on-failure via the shared `attemptSend` path).
- [x] **E2E test** (`apps/api/test/users-super-admin.e2e-spec.ts`) — write this as part of the story itself, not a review follow-up (Story 1.3's code review explicitly had to add this after the fact; don't repeat that gap). Mirror `apps/api/test/homes-invite.e2e-spec.ts`'s conventions (real Nest app + real local Postgres). Cover: seeded super_admin → `POST /users/super-admins` → `201`, verify in Postgres that the new `users` row has `role = 'super_admin'` **and zero rows in `home_memberships` for that user**; seeded `staff`/`admin` → same request → `403`.
- [x] **Manual E2E verification against local Postgres** (docker-compose) — same bar as Stories 1.3/1.7: this is a new write path (first time a `User` is created with intentionally zero `HomeMembership` rows), verify it end-to-end, not just via mocks. Satisfied by the automated e2e spec above, which performs the exact real HTTP + real Postgres round trip (seeded super_admin → login → `POST /users/super-admins` → direct Postgres assertion that `home_memberships` has zero rows for the new user) rather than a separate hand-run transcript — see Debug Log References.

### Review Findings

- [x] [Review][Patch] DTO rejects a whitespace-padded email with `400` before the service's `.trim()` can run [apps/api/src/users/dto/create-super-admin.dto.ts; apps/api/src/users/users.service.ts:83] — `class-validator`'s `@IsEmail()` rejects strings with leading/trailing whitespace (verified against this repo's validator.js: `isEmail('  x@y.com  ')` → `false`). The global `ValidationPipe` validates before the controller ever calls `UsersService.createSuperAdmin`, so a request body like `{"email": "  super@evergreen.test  "}` gets a generic `400` and never reaches `email.trim().toLowerCase()` — that line is dead code on the real HTTP path. The new unit test calling `usersService.createSuperAdmin('  Super@Evergreen.test  ')` directly bypasses the DTO and gives false confidence. **Fixed:** added a `class-transformer` `@Transform` to `CreateSuperAdminDto.email` that trims before `@IsEmail()` validates. Covered by a new e2e case (`users-super-admin.e2e-spec.ts`: "accepts a whitespace-padded email"). (Blind Hunter + Edge Case Hunter, independently)
- [x] [Review][Defer] Identical whitespace-trim dead-code gap pre-exists in `InviteHomeAdminDto` (Story 1.3) [apps/api/src/homes/dto/invite-home-admin.dto.ts] — deferred, pre-existing, not introduced by this diff. `InviteHomeAdminDto` has the same `@IsEmail() @MaxLength(254)`-only shape this story's DTO copied, so `createPendingHomeAdmin`'s `.trim()` is equally unreachable on the real `/homes/:id/admins` path. Worth the same standalone `@Transform` fix there, out of scope for this diff. (Edge Case Hunter)
- [x] [Review][Defer] Rollback-then-retry email-freeing race now has a broader trigger surface [apps/api/src/users/users.service.ts createSuperAdmin/rollbackPendingUser] — deferred, extension of the already-accepted Story 1.3 tradeoff ("Concurrent identical-email invites…", deferred-work.md). `createSuperAdmin` has no `homeMembership.create` step, so `issueActivationToken` is the only write that can fail and trigger rollback after `user.create` succeeds — every non-P2002 failure now takes this route, a larger trigger surface than Story 1.3's version. Not worth a separate fix without the same durable-transaction infra already deferred for the root cause. (Edge Case Hunter)

## Dev Notes

### Why this is simpler than Story 1.3, and where the two intentionally diverge

- Story 1.3's whole `@BypassTenantScope()` + sequential-write-with-rollback design exists because `HomeMembership` is a **tenant-scoped** model (`apps/api/src/prisma/tenant-scoped-models.ts`), and a `super_admin`'s JWT carries no `home_id` to auto-inject. This story never touches `HomeMembership` at all — `super_admin` has no home scope, full stop. That means: **no `@BypassTenantScope()` needed**, and no tenant-scoping-extension nesting risk to route around.
- Because neither `User` nor `PasswordResetToken` (the two models this story writes) are tenant-scoped, they're in the same category `PasswordResetService.confirmReset` already exercises successfully inside a real `$transaction(async (tx) => ...)` (`apps/api/src/auth/password-reset.service.ts:77-108`). A transaction *would* work here, unlike Story 1.3's case. Still, the task list above directs reusing the existing sequential try/catch/rollback shape (`createUser` → `issueActivationToken` → `rollbackPendingUser` on failure) that `createPendingHomeAdmin` already established, purely for internal consistency between `UsersService`'s two "create pending X" methods — not because a transaction is unsafe here. Don't invent a third pattern.

### `PendingUserResponse.homeId` becomes nullable — check every existing usage

- `apps/api/src/users/users.service.ts` currently types `PendingUserResponse.homeId: string`. Widening it to `string | null` is a type-only change; `createPendingHomeAdmin` and `HomesController.inviteAdmin` (`apps/api/src/homes/homes.controller.ts:61-67`) both already pass/return a real string, so nothing behaviorally changes there — just confirm the compiler is clean after the widen (`pnpm --filter @evergreen/api run build`).

### `MailService` — do not stretch `sendAccountInviteEmail`'s copy to cover this case

- `sendAccountInviteEmail(email, rawToken, homeName)` hardcodes `homeName` into the HTML body (`buildInviteHtml`, `apps/api/src/notifications/mail.service.ts:148-155`). A super-admin invite has no home to name. Passing an empty string or a placeholder would produce a nonsensical email ("help manage  on Evergreen"). Add a genuinely separate `sendSuperAdminInviteEmail`/`buildSuperAdminInviteHtml` pair — small duplication of the surrounding HTML structure is the right tradeoff here, not a parameterized "maybe homeName" signature that makes the copy conditional and harder to read (mirrors why `buildResetHtml` and `buildInviteHtml` are already two separate methods rather than one flexible one).

### Where new code goes

- `ARCHITECTURE-SPINE.md`'s FR-to-module table (line 297) maps FR47–53 to both `homes` and `users`. Story 1.3 put the HTTP route on `HomesController` because it's a `/homes/:id/admins` sub-resource. This story's action isn't scoped to any home, so it does **not** belong on `HomesController` — it gets its own `UsersController` at `POST /users/super-admins`, the first controller in the `users` module (which until now only exposed a service). This is a deliberate, permanent home for future user-management routes (Story 1.12's user list/role-change endpoints will likely also land here).

### Testing standards

- Unit tests mock `PrismaService`, `PasswordResetService`, `MailService` exactly like the existing `createPendingHomeAdmin` block (`{ client: { user: {...} } }` shape, `jest.fn()` per method) — note `homeMembership` doesn't need a mock entry for this method's tests since it's never called.
- `pnpm --filter @evergreen/api run test`, `run build`, `run lint` must all pass — same bar as Stories 1.3/1.7.
- E2E must run against real local Postgres (`docker compose up -d`, `npx prisma migrate deploy`) — Story 1.6's history (a Prisma-7-WASM tenant-context bug mocks never caught) and Story 1.3's (an `AsyncLocalStorage`/`PrismaPromise` bug found only while writing e2e coverage) are both precedent for why this codebase doesn't trust mocked tests alone on new write paths.

### Project Structure Notes

- No schema changes — `User`, `PasswordResetToken` already exist from Phase 0. No new migration needed.
- No new env vars — reuses `RESEND_API_KEY`, `MAIL_FROM`, `RESET_PASSWORD_URL` already validated in `env.validation.ts`.
- New files live at `apps/api/src/users/dto/create-super-admin.dto.ts` and `apps/api/src/users/users.controller.ts` — first controller in the `users/` module, alongside the existing `users.service.ts`/`users.module.ts`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.4] — acceptance criteria (verbatim Given/When/Then)
- [Source: _bmad-output/implementation-artifacts/1-3-assign-home-admins.md] — the pattern this story deliberately reuses/diverges from (see Dev Notes)
- [Source: _bmad-output/implementation-artifacts/epic-1-context.md] — Epic 1 cross-story dependencies ("Stories 1.3, 1.4, and 1.5 all create pending accounts Story 1.7 resolves")
- [Source: _bmad-output/planning-artifacts/architecture/architecture-evergreen-2026-07-02/ARCHITECTURE-SPINE.md#AD-1, AD-12, AD-14] — tenant isolation (why this story needs none of it), RBAC, transactional email
- [Source: apps/api/src/users/users.service.ts, users.service.spec.ts] — `createUser`/`rollbackPendingUser` helpers to reuse as-is
- [Source: apps/api/src/notifications/mail.service.ts] — `attemptSend`/`buildLink`/retry plumbing to reuse; copy-per-invite-type precedent
- [Source: apps/api/src/homes/homes.controller.ts, homes.module.ts] — sibling controller/module wiring precedent (minus `@BypassTenantScope()`, not needed here)
- [Source: apps/api/prisma/schema.prisma#User, HomeMembership] — confirms `User` has no `homeId` column; home scope only exists via `HomeMembership`

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- `pnpm --filter @evergreen/api run build` — clean.
- `pnpm --filter @evergreen/api run lint` — clean (eslint --fix only reformatted whitespace).
- `pnpm --filter @evergreen/api run test` — 6 suites, 62 tests, all passing (52 pre-existing + 10 new: 4 `createSuperAdmin` unit tests, 3 `sendSuperAdminInviteEmail` unit tests, plus the pre-existing suites unaffected).
- `pnpm --filter @evergreen/api run test:e2e` (real local Postgres via docker-compose, `npx prisma migrate deploy` — no pending migrations) — 3 suites, 5 tests, all passing:
  1. `POST /users/super-admins` as a seeded `super_admin` → `201`, response `{id, email, role: "super_admin", isActive: false, homeId: null}`, no `passwordHash`.
  2. Verified in Postgres (bypass tenant-context, mirrors `homes-invite.e2e-spec.ts`'s convention): `home_memberships` has **zero rows** for the new user — confirms AC #1's "no home scope at all" — and a `password_reset_tokens` row exists, unexpired, unused.
  3. `POST /users/super-admins` as a seeded `staff` user (with a `HomeMembership`) → `403` (AC #2).
- Manual verification against real Postgres was satisfied by the e2e run above rather than a separate hand-run curl transcript — the e2e spec already performs the identical real HTTP + real Postgres round trip Stories 1.3/1.7 verified by hand, so a second manual pass would only re-run the same assertions without adding coverage.

### Completion Notes List

- Implemented exactly per the story's task list. `createSuperAdmin` deliberately mirrors `createPendingHomeAdmin`'s sequential-write/rollback shape (skipping the `homeMembership.create` step) rather than using a `$transaction`, per the Dev Notes rationale — kept for internal consistency between `UsersService`'s two "create pending X" methods even though a transaction would also be safe here.
- `PendingUserResponse.homeId` widened to `string | null`; confirmed via `pnpm build` that `createPendingHomeAdmin`'s existing usage (always a real string) is unaffected.
- New `UsersController` is the first controller in the `users/` module — registered via `UsersModule`'s `controllers` array; no change to `AppModule` needed since `UsersModule` was already part of the module graph (imported by `HomesModule`).
- No schema changes, no new env vars, no new dependencies.
- All 2 acceptance criteria verified twice: mocked unit tests (`users.service.spec.ts`, `mail.service.spec.ts`) and a real HTTP + local-Postgres e2e round trip.

### File List

**New:**
- `apps/api/src/users/dto/create-super-admin.dto.ts`
- `apps/api/src/users/users.controller.ts`
- `apps/api/test/users-super-admin.e2e-spec.ts`

**Modified:**
- `apps/api/src/users/users.service.ts` (added `createSuperAdmin`; widened `PendingUserResponse.homeId` to `string | null`)
- `apps/api/src/users/users.service.spec.ts` (added `createSuperAdmin` test block)
- `apps/api/src/users/users.module.ts` (registered `UsersController`)
- `apps/api/src/notifications/mail.service.ts` (added `sendSuperAdminInviteEmail` + `buildSuperAdminInviteHtml`)
- `apps/api/src/notifications/mail.service.spec.ts` (added `sendSuperAdminInviteEmail` test block)

## Change Log

- 2026-08-09: Story implemented — `POST /users/super-admins` endpoint reusing Story 1.3's pending-account/activation-email pattern, minus `HomeMembership`/`@BypassTenantScope()` (super_admin has no home scope). All ACs verified via unit tests + e2e against local Postgres. Status → review.
- 2026-08-09: Adversarial code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor, parallel) — 0 decision-needed, 1 patch applied, 2 deferred to `deferred-work.md`, 7 dismissed as noise/false-positives/pre-existing-and-already-accepted. Patch: `CreateSuperAdminDto.email` now trims via `@Transform` before `@IsEmail()` validates, fixing a 400-on-padded-email bug found independently by two review layers; covered by a new e2e case. 62 unit + 6 e2e tests passing, build/lint clean. Status → done.
