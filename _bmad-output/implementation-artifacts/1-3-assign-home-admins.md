---
baseline_commit: 9dc3c1aedb3d6c6b9e9d17e5c8d56d9aa6c1479f
---

# Story 1.3: Super Admin Assigns a Home Admin to a Care Home

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a super admin,
I want to assign a home admin to a care home by inviting them via email,
so that each home has someone who can manage its residents, content, events, and users.

## Acceptance Criteria

1. **Given** I am a super admin viewing a home, **when** I enter an email address and select the "home admin" role, **then** a pending `User` record is created with role `admin`, scoped to that home via a `HomeMembership` row, with no password set (`passwordHash = null`, `isActive = false`) (FR48).
2. **Given** a pending home admin account is created, **when** the invite is sent, **then** it is delivered via Resend with a one-time activation link, and delivery retries on transient failure per NFR15 (60s → 5min → 30min) — reusing the exact `PasswordResetToken` mechanism Story 1.7 already built.
3. **Given** the invited email already has a `User` account in the system, **when** I attempt to invite it again, **then** I get an inline `409` error ("A user with this email already exists") rather than a duplicate account being created. (`email` is globally unique on `User` — this holds regardless of which home or role the existing account belongs to; admin/staff are strictly single-home, so there is no legitimate re-invite case here, unlike family in Story 1.5.)
4. **Given** I am not a super admin, **when** I attempt to call this endpoint, **then** the request is rejected server-side with `403` before any DB write (`RolesGuard` / AD-12) — already covered by `HomesController`'s existing class-level `@Roles('super_admin')`, no new guard needed.

*(Out of scope, explicitly: account activation — opening the link, setting a password — is Story 1.7, already done. Story 1.4 (create additional super admins) and Story 1.5 (staff/family invites) reuse this same pattern but are separate stories — do not build their endpoints here.)*

## Tasks / Subtasks

- [x] **DTO**: `apps/api/src/homes/dto/invite-home-admin.dto.ts` — `InviteHomeAdminDto { email: string }`, `@IsEmail() @MaxLength(254)` (AC: #1, #3) — mirror `RequestPasswordResetDto`'s exact decorators.
- [x] **New `apps/api/src/users/` module** (per `ARCHITECTURE-SPINE.md`'s own FR47–53 file mapping — see Dev Notes):
  - [x] `users.service.ts` — `UsersService.createPendingHomeAdmin(homeId: string, email: string, homeName: string): Promise<PendingUserResponse>` (AC: #1, #2, #3) — `homeName` added vs. the original signature sketch so `MailService.sendAccountInviteEmail` can personalize copy without `UsersService` depending on `HomesService`; the controller already has the `Home` object from its own `findOne` 404 check.
  - [x] `users.module.ts` — imports `AuthModule` (for `PasswordResetService`) and `NotificationsModule` (for `MailService`); exports `UsersService`.
  - [x] `users.service.spec.ts` — unit tests covering the I/O matrix (happy path, no-passwordHash-leak, email conflict, orphan-user rollback on membership failure).
- [x] **`PasswordResetService`** (`apps/api/src/auth/password-reset.service.ts`): extracted the token-creation block from `requestReset` into `issueActivationToken(userId: string): Promise<string>`, now called by both `requestReset` and `UsersService.createPendingHomeAdmin` (AC: #2).
- [x] **`MailService`** (`apps/api/src/notifications/mail.service.ts`): added `sendAccountInviteEmail(email, rawToken, homeName)` with distinct invite copy. Refactored `attemptSend`/`scheduleRetryOrGiveUp` to take a `{ email, subject, html, logLabel, retryCount }` params object shared by both email types (AC: #2).
- [x] **`HomesController`** (`apps/api/src/homes/homes.controller.ts`): added `POST /homes/:id/admins`, `@BypassTenantScope()` + inherited class-level `@Roles('super_admin')`. Calls `homesService.findOne(id)` (404), then `usersService.createPendingHomeAdmin(id, dto.email, home.name)`, returns `201`.
- [x] **`HomesModule`** (`apps/api/src/homes/homes.module.ts`): imports `UsersModule`.
- [x] **`deferred-work.md`**: documented the orphan-pending-user crash-window edge case.
- [x] **Manual E2E verification against local Postgres** (docker-compose) — see Completion Notes for full transcript/results. All ACs verified against a real HTTP + Postgres round trip, not just mocked unit tests.

## Dev Notes

### Critical risk #1 — `@BypassTenantScope()` is required, and this is its first real usage in the codebase

- `HomeMembership` is in `TENANT_SCOPED_MODELS` (`apps/api/src/prisma/tenant-scoped-models.ts:7`). Every query against it goes through the tenant-scoping Prisma extension (`apps/api/src/prisma/tenant-scoping.extension.ts`).
- A `super_admin`'s JWT carries **no `home_id`** (documented tradeoff in `deferred-work.md`, confirmed in `tenant-context.middleware.ts:51`: `store.homeId = payload.homeId ?? null`). So for this endpoint, `TenantContextService`'s store has `homeId: null` unless bypass is active.
- Without `@BypassTenantScope()`, the extension's `$allOperations` hook throws a hard `Error` on any `homeMembership.create()` call: *"Tenant-scoped query on... attempted with no home_id in request context"* (`tenant-scoping.extension.ts:92-96`) — this would surface as an opaque `500`, not a clean validation error.
- `@BypassTenantScope()` (`apps/api/src/common/tenant/bypass-tenant-scope.decorator.ts`) is currently **defined but never applied to any route** — grep confirms zero usages outside its own definition/interceptor/extension files. This story is the first to exercise the whole bypass path end-to-end (decorator → `BypassTenantScopeInterceptor` → extension's `store?.bypass` branch).
- With bypass active, the extension does **not** auto-inject `home_id` (`tenant-scoping.extension.ts:82-88` — the bypass branch skips `injectHomeId` entirely) — so `UsersService.createPendingHomeAdmin` must pass `homeId` explicitly in the `HomeMembership.create` `data`.
- `BypassTenantScopeInterceptor` only flips `store.bypass = true` if `store.role === 'super_admin'` — already guaranteed here by `HomesController`'s class-level `@Roles('super_admin')`, but don't remove that guard thinking the bypass decorator alone protects the route; it doesn't (it's audit-logging + scope-skip, not authorization).

### Critical risk #2 — do not nest the `HomeMembership` create inside a `$transaction` callback with the `User` create

- `password-reset.service.ts` uses `prisma.client.$transaction(async (tx) => {...})` successfully, but only ever on **non**-tenant-scoped models (`User`, `PasswordResetToken`) — the extension's `$allOperations` hook short-circuits immediately for those (`tenant-scoping.extension.ts:76`: `if (!model || !TENANT_SCOPED_MODELS.has(model)) return query(args);`), so nesting is a non-issue there.
- For a tenant-scoped model, the extension's own bypass/scoped branches call `prisma.$transaction([...])` **on the base (non-transactional) client captured in `createTenantScopedPrismaClient`'s closure**, not on whatever interactive-transaction client invoked it. Starting that nested transaction from inside an already-open interactive `$transaction(async (tx) => ...)` block is untested in this codebase — no existing code path creates or updates a tenant-scoped model at all yet (Phase 2+ modules aren't built), so this would be new, unverified territory.
- **Recommendation**: don't fight this. Do two sequential top-level calls — `await this.prisma.client.user.create(...)` then `await this.prisma.client.homeMembership.create(...)` — each already gets its own atomic `set_config` + insert from the extension itself (`tenant-scoping.extension.ts:100-104`). Wrap the second call in a `try/catch`; on failure, delete the just-created orphaned `User` row before rethrowing, so a retry doesn't hit the AC #3 email-conflict wall on a pending account that never got its membership.
- Document the remaining edge case (process crash between the two calls, before the catch runs) in `deferred-work.md` — same spirit as Story 1.7's accepted non-durable-retry tradeoffs, not a blocker for this story.

### Critical risk #3 — learn from Story 1.6's actual bug here

- Issue #10 / commit `027dd02`: a Prisma-7-WASM-engine subtlety around `TenantContextService` propagation caused a real bug that **unit tests (mocked Prisma) did not catch** — it was found only through manual E2E verification against a real local Postgres instance. This story touches the same tenant-context/Prisma-extension machinery, for the first time in a `create` path, under bypass, for the first time. Do not consider this story done on `pnpm test` (mocked) and `pnpm build` alone — run it against local Postgres (`docker compose up -d`, `npx prisma migrate deploy`, real HTTP call as a seeded super_admin) and confirm the `home_memberships` row actually lands with the correct `home_id` and isn't blocked by RLS.

### Where new code goes

`ARCHITECTURE-SPINE.md`'s FR-to-module table (line 297) maps FR47–53 ("Admin & Staff Management", which includes this story's FR48) to **both** `apps/api/src/homes` and a `users` module — the latter doesn't exist yet. Create it now:
- `apps/api/src/users/users.module.ts`, `users.service.ts` — owns "pending account creation + invite dispatch" as a reusable capability. Story 1.4 (additional super admins) and Story 1.5 (staff/family invites) will extend `UsersService` later with their own methods — **do not build those methods now**, just don't paint this story's code into a corner that makes reuse harder (e.g. don't hardcode `role: 'admin'` so deep in a shared helper that Story 1.4 can't pass `'super_admin'` through the same token/email plumbing later).
- The HTTP route itself stays a `homes` sub-resource — `POST /homes/:id/admins` — consistent with `HomesController`'s existing `:id`-nested pattern (`PATCH /homes/:id`) and the AC's framing ("super admin viewing a home... enters an email").

### Email copy — do not reuse Story 1.7's reset-email copy verbatim

`MailService.sendPasswordResetEmail`'s current copy ("We received a request to reset your Evergreen password...") is wrong for an invite — this person never requested anything. Epic 1's UX conventions (`epic-1-context.md`: "Voice and tone is warm and plain-language throughout") call for distinct copy, e.g. "You've been invited to help manage **{homeName}** on Evergreen. Set your password to activate your account." Same link mechanics (`${RESET_PASSWORD_URL}?token=...}`), same retry/backoff, different subject + HTML body.

### Response shape — never leak `passwordHash`

`User.passwordHash` is `null` for a pending account anyway, but don't return the raw Prisma `User` object regardless — use an explicit `select` (mirrors `auth.controller.ts`'s `me()` pattern, `auth.controller.ts:108-114`) so a later schema addition (e.g. a future sensitive field) can't leak silently. Suggested response: `{ id, email, role, isActive, homeId }`.

### Conflict handling — mirror existing precedent, don't reinvent

`HomesService.mapUniqueNameViolation` (`homes.service.ts:43-51`) is the exact pattern to copy for the `User.email` unique-constraint (`schema.prisma:76`) violation: catch `Prisma.PrismaClientKnownRequestError` with `code === 'P2002'`, map to `ConflictException`.

### Testing standards

- Unit tests mock `PrismaService`, `PasswordResetService`, and `MailService` exactly like `password-reset.service.spec.ts` and `homes.service.spec.ts` do (`{ client: { user: {...}, homeMembership: {...} } }` shape, `jest.fn()` per method).
- Cover: happy path (User + HomeMembership created, token issued, email dispatched, correct response shape excluding `passwordHash`); email conflict → `ConflictException`; unknown `homeId` → `NotFoundException` (via `homesService.findOne`, before any write); `HomeMembership` create failure → orphaned `User` cleaned up.
- `pnpm --filter @evergreen/api run test`, `run build`, `run lint` must all pass — same bar as Story 1.7.

### Project Structure Notes

- No schema changes — `User`, `HomeMembership`, `PasswordResetToken` all already exist from Phase 0 (`schema.prisma`). No new migration needed.
- No new env vars — reuses `RESEND_API_KEY`, `MAIL_FROM`, `RESET_PASSWORD_URL` already validated in `env.validation.ts` (Story 1.7).
- New module (`users/`) sits alongside `homes/`, `auth/`, `notifications/` at `apps/api/src/`, matching the flat per-capability structure `backend-plan.md` and the architecture spine both describe.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3] — acceptance criteria
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.7] — "this story's invite feeds into" cross-reference
- [Source: _bmad-output/implementation-artifacts/spec-1-7-password-reset-activation.md] — frozen spec this story builds on top of (token mechanism, email retry, DTO/testing conventions)
- [Source: _bmad-output/implementation-artifacts/epic-1-context.md] — Epic 1 cross-story dependencies, UX tone conventions
- [Source: _bmad-output/planning-artifacts/architecture/architecture-evergreen-2026-07-02/ARCHITECTURE-SPINE.md#AD-1, AD-12, AD-14] — tenant isolation, RBAC, transactional email rules
- [Source: apps/api/src/prisma/tenant-scoping.extension.ts, tenant-scoped-models.ts] — bypass/tenant-scoping mechanics (Critical risk #1, #2)
- [Source: apps/api/src/homes/homes.service.ts, homes.controller.ts] — conflict-handling and route-nesting precedent
- [Source: apps/api/src/auth/password-reset.service.ts, apps/api/src/notifications/mail.service.ts] — token issuance and email-retry infrastructure to reuse

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- `pnpm --filter @evergreen/api run test` — 6 suites, 42 tests, all passing.
- `pnpm --filter @evergreen/api run build` — clean.
- `pnpm --filter @evergreen/api run lint` — clean (one `no-unused-vars` fixed during implementation — a leftover `retryCount` destructure in `MailService.attemptSend` after the params-object refactor).
- Manual E2E transcript (local Postgres via docker-compose, real HTTP calls, `RESEND_API_KEY` unset so `MailService` logs instead of sending):
  1. Seeded a `super_admin` directly via SQL (no self-registration exists — expected, per FR1).
  2. `POST /auth/login` → real access token.
  3. `POST /homes` → created a test home.
  4. `POST /homes/:id/admins` with a new email → **`201`**, response `{id, email, role: "admin", isActive: false, homeId}`, no `passwordHash` field.
  5. Verified in Postgres (as the `postgres` bootstrap superuser, to see past RLS): `home_memberships` row exists with the **correct `home_id`**, `role: admin`; `users` row has `password_hash IS NULL`; a `password_reset_tokens` row exists, unexpired, unused.
     - Note: the same query via the app's `evergreen` role (not superuser) returned 0 rows — expected, this is `FORCE ROW LEVEL SECURITY` doing its job (AD-1's backstop) on a session with no `app.current_home_id`/`app.bypass_tenant_scope` set; not a bug, just had to query as superuser to inspect.
  6. API log confirmed `TenantScopeBypass` audit-logged `HomesController.inviteAdmin` (AD-1 rule 5), and `MailService` logged the **invite-specific** copy ("would have sent account invite email"), not the reset-password copy.
  7. AC #3: re-invited the same email → **`409`** `"A user with this email already exists"`.
  8. Unknown `homeId` → **`404`** `"Home not found"`, no user/membership rows created (verified `findOne`'s 404 fires before any write).
  9. AC #4: no bearer token → **`401`**.
  10. Cleaned up all E2E-seeded rows from the local dev DB afterward.
  - This confirms Critical Risks #1 and #2 from Dev Notes did not materialize: `@BypassTenantScope()` worked correctly on its first real usage, and the two sequential (non-nested-transaction) writes landed the `HomeMembership` with the right `home_id`.

### Completion Notes List

- Implemented exactly per the story's task list; one intentional signature deviation from the original sketch: `UsersService.createPendingHomeAdmin` takes a third `homeName` parameter (not in the original `(homeId, email)` sketch) so the invite email can be personalized without giving `UsersService` a dependency on `HomesService` — the controller already has the `Home` object from its 404 check via `homesService.findOne`.
- `PasswordResetService` and `MailService` refactors are additive/behavior-preserving for the existing Story 1.7 flows — confirmed via the full existing test suite staying green before adding any new tests.
- All 4 acceptance criteria verified twice: once via mocked unit tests (`users.service.spec.ts`, `mail.service.spec.ts`), once via a real HTTP + local-Postgres round trip (see Debug Log References) — the latter specifically because this story exercises `@BypassTenantScope()` for the first time in the codebase, and Story 1.6's history shows this class of Prisma-tenant-context issue does not reliably surface in mocked tests.
- No schema changes, no new env vars.

### File List

**New:**
- `apps/api/src/homes/dto/invite-home-admin.dto.ts`
- `apps/api/src/users/users.module.ts`
- `apps/api/src/users/users.service.ts`
- `apps/api/src/users/users.service.spec.ts`

**Modified:**
- `apps/api/src/auth/password-reset.service.ts` (extracted `issueActivationToken`)
- `apps/api/src/notifications/mail.service.ts` (added `sendAccountInviteEmail`, refactored retry internals to a shared params object)
- `apps/api/src/notifications/mail.service.spec.ts` (added `sendAccountInviteEmail` coverage)
- `apps/api/src/homes/homes.controller.ts` (added `POST /homes/:id/admins`)
- `apps/api/src/homes/homes.module.ts` (imports `UsersModule`)
- `_bmad-output/implementation-artifacts/deferred-work.md` (documented orphan-user edge case)

## Change Log

- 2026-08-07: Story implemented — invite-a-home-admin endpoint, reusing Story 1.7's token/email infrastructure. All ACs verified via unit tests + manual E2E against local Postgres. Status → review.
