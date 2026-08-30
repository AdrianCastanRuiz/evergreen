# Story 2.2: Admins vinculan cuentas familiares a residentes específicos

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a home admin,
I want to link a family member's account to a specific resident,
so that they can see photos, events, and menu information for their loved one.

## Acceptance Criteria

1. **Given** I am inviting a new family member (Story 1.5), **when** I select a resident to link during that invite, **then** a `FamilyLink` row is created for `(pending_user, resident_id)` as part of the invite (FR23) — it becomes practically usable once the account activates (Story 1.7/1.8), but the row itself is written at invite time.
2. **Given** a family member's account is already active, **when** I link them to an additional resident (e.g. a second parent), **then** a new `FamilyLink` row is created without disturbing their existing link(s).
3. **Given** a family account has 2+ linked residents, **when** they next open the app, **then** the resident-switcher becomes available on Home/Photos/Events/Menu (UX-DR9) — *frontend consumption of this is Story 2.3/2.4's scope, not this story's; this story only needs the data model to support it correctly (no unique-per-user constraint that would block a second link).*
4. **Given** I attempt to link a family account to a resident in a different home, **when** the request is made, **then** it is rejected server-side (NFR7, AD-1).
5. **Given** I remove a `FamilyLink`, **when** the change is saved, **then** that family member immediately loses access to that resident's data on their next request — enforced by `FamilyResidentGuard`, not just hidden in the UI (AD-11).

## Tasks / Subtasks

- [ ] Task 1: `FamilyResidentGuard` — reusable infrastructure (AD-11, AC #5)
  - [ ] Create `apps/api/src/common/auth/family-resident.guard.ts`, same shape as `apps/api/src/common/auth/roles.guard.ts` (`CanActivate`, injects `TenantContextService`)
  - [ ] Logic: reads `residentId` from the route param, checks (a) a `FamilyLink` row exists for `(store.userId, residentId)` AND (b) the resident's `home_id` matches a `HomeMembership` the user holds — both conditions from AD-11, not just one
  - [ ] Exempt `staff`/`admin`/`super_admin` — they're already scoped by role/`home_id` (AD-1), this guard is family-only
  - [ ] **Scope boundary — do not build a family-facing consumer route in this story.** No family-facing "view resident" endpoint exists yet (that's Story 2.4). Prove AC #5 via a **unit test directly against the guard** (mock `ExecutionContext` + `TenantContextService`, same pattern `roles.guard.ts` would use if it had a spec file — check for one; if none exists, follow `homes.service.spec.ts`'s mocking style) rather than inventing a throwaway protected route to test through.
- [ ] Task 2: Extend the Story 1.5 invite flow (AC #1)
  - [ ] Add optional `residentId?: string` (`@IsOptional() @IsUUID()`) to `apps/api/src/users/dto/invite-user.dto.ts`
  - [ ] In `UsersService.inviteUser` (`apps/api/src/users/users.service.ts`), when `targetRole === 'family'` and `residentId` is present: validate the resident belongs to `actorHomeId` (404 if not — never leak cross-home resident existence), then create the `FamilyLink` row in the same failure-handling block as the existing `HomeMembership` create (extend the existing `try { ... } catch { rollback }` — do not add a second, separate rollback path; see Dev Notes)
  - [ ] `residentId` is ignored (not an error, just a no-op) if `targetRole === 'staff'` — a resident link only makes sense for family
- [ ] Task 3: Link an already-active family member to an additional resident (AC #2)
  - [ ] New endpoint `POST /residents/:residentId/family-links` — `@Roles('admin')`, body `{ userId: string }` (admin picks from their home's existing family users — reuse `GET /users` from Story 1.12, filtered client-side or via `?role=family`, see Dev Notes)
  - [ ] Service validates: target user has an active `HomeMembership` with role `family` in the admin's home (404 otherwise, same non-revealing pattern as `UsersService.resolveManageableMembership`), and doesn't already have a `FamilyLink` to this resident (409 conflict)
- [ ] Task 4: List and remove links (AC #5)
  - [ ] `GET /residents/:residentId/family-links` — `@Roles('admin')`, lists linked family users for the admin UI (name/email) so there's something to remove
  - [ ] `DELETE /residents/:residentId/family-links/:userId` — `@Roles('admin')`, deletes the `FamilyLink` row; 404 if it doesn't exist (don't leak cross-home resident/user existence)
  - [ ] All four new routes live in `apps/api/src/residents/` (extends Story 2.1's module — do not create a separate `family-links` module; residents own this sub-resource, same way `HomesController` owns `POST /homes/:id/admins`)
- [ ] Task 5: Shared types + frontend
  - [ ] Extend `packages/shared-types/src/residents.ts` (created in Story 2.1): `FamilyLink`, `LinkFamilyMemberRequest`
  - [ ] Extend `InviteUserRequest` (wherever Story 1.5's invite type lives — check `packages/shared-types/src/users.ts`) with optional `residentId`
  - [ ] Frontend: the invite-a-user UI does not exist yet in `apps/admin` (confirmed during Epic 1 retro — `POST /users/invites` is API-only today). **This story does not build that UI.** Per the retro decision (2026-08-26), the full invite UI — including the resident-selector this story's AC #1 needs — is Story 2.2's own frontend scope is limited to the **link management** surface (add-existing-family-member-to-a-resident + remove-link), on the Residents screen Story 2.1 builds. Building the invite screen itself is tracked separately; coordinate with Adrian before assuming it's in scope here if the Residents screen has no invite entry point yet to attach a resident-picker to.
- [ ] Task 6: Tests
  - [ ] Unit: `family-resident.guard.spec.ts`, extend `residents.service.spec.ts` (from 2.1) with link/unlink cases
  - [ ] E2e: extend or add `apps/api/test/residents-manage-home.e2e-spec.ts` (from 2.1) with AC #1 (invite-time link), AC #2 (link existing), AC #4 (cross-home 404), AC #5 (unlink → guard test, not a live route)

## Dev Notes

### This story sits on top of Story 2.1 and Story 1.5 — read both before starting

Story 2.1 (`_bmad-output/implementation-artifacts/2-1-admins-crean-y-gestionan-perfiles-de-residentes-por-care-home.md`) builds the `residents` module this story extends. **At the time this story file was written, Story 2.1 had not been implemented yet** (status `ready-for-dev`, no Dev Agent Record) — there are no dev learnings to inherit from it. If 2.1 is already merged by the time you pick this up, re-check its actual `residents.controller.ts`/`residents.service.ts` shape before extending it; this story's file paths are predictions based on 2.1's own story file, not a merged reality yet.

### Extending `UsersService.inviteUser` without breaking its existing rollback contract

`apps/api/src/users/users.service.ts`'s `inviteUser` (Story 1.5) already has a documented, deliberate non-transactional two-write pattern with manual rollback (`rollbackPendingUser`) — this is a known, accepted tradeoff (see `deferred-work.md`'s Story 1.3 entry: no interactive `$transaction` around tenant-scoped writes yet). Adding a third write (`FamilyLink`) means:

- It must roll back too if it fails — extend the existing `try { ... HomeMembership.create ... issueActivationToken ... } catch { rollbackPendingUser }` block to also attempt the `FamilyLink` create inside the same `try`, not a separate one bolted on after.
- Do **not** attempt to wrap this in a real `$transaction` — that's the exact unverified territory `tenant-scoping.extension.ts`'s file comment and `deferred-work.md` warn against (nesting an interactive transaction inside the tenant-scoping Prisma extension's own per-call transaction). Follow the existing sequential-calls-with-manual-rollback shape.
- `FamilyLink` requires `homeId` too (schema: `userId`, `residentId`, `homeId`) — same tenant-scoping auto-injection as `HomeMembership`, no manual filter needed (verify `FamilyLink` is in `TENANT_SCOPED_MODELS` — **it is not**, per the current `apps/api/src/prisma/tenant-scoped-models.ts` read during this story's research. Add it to that `Set` as part of this story — a real gap, not a Story 2.1 or Epic 1 leftover).

### `FamilyLink` is missing from `TENANT_SCOPED_MODELS` — must be added

Checked `apps/api/src/prisma/tenant-scoped-models.ts` directly: it lists `HomeMembership`, `Resident`, `ContentItem`, `Photo`, `Event`, `EventRegistration`, `MealMenuItem`, `MealOrder`, `DeviceToken` — **`FamilyLink` is absent**, even though the Prisma schema comment and `ARCHITECTURE-SPINE.md`'s ERD both show it as a `home_id`-carrying table. Without this, any `prisma.client.familyLink.*` call in this story would either 500 with the "no home_id in request context" error (if the tenant context has no bypass) or — worse — silently write with no `home_id` scoping at all if some future bypass masks it. **Add `'FamilyLink'` to the `TENANT_SCOPED_MODELS` set as the first change in Task 1**, before writing any service code that touches it, and confirm Postgres RLS is already enforced on `family_links` (check for a migration under `apps/api/prisma/migrations/` — Story 1.1's scaffold should have set `FORCE ROW LEVEL SECURITY` on every tenant table including this one; this story doesn't need a new RLS migration if so, only the Prisma-extension-side registration).

### Endpoint placement

Follow `HomesController`'s precedent for a resource owning a sub-action on another (`POST /homes/:id/admins`) rather than inventing a top-level `/family-links` resource — these routes are naturally `residents`-owned: `POST/GET /residents/:residentId/family-links`, `DELETE /residents/:residentId/family-links/:userId`.

### Reusing Story 1.12's user listing

`GET /users` (`apps/api/src/users/users.controller.ts`, `listUsers`) already returns every `staff`/`family` user in the admin's home. Task 3's "pick an existing family member" UI should filter this response client-side (or the backend could add a `?role=family` query param — your call, small either way) rather than building a second, parallel user-listing endpoint.

### Project Structure Notes

- No new NestJS module — this extends `apps/api/src/residents/` (from Story 2.1) and `apps/api/src/users/` (from Story 1.5).
- New file: `apps/api/src/common/auth/family-resident.guard.ts`.
- Edit (not create): `apps/api/src/prisma/tenant-scoped-models.ts`, `apps/api/src/users/dto/invite-user.dto.ts`, `apps/api/src/users/users.service.ts`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.2] — AC source
- [Source: ARCHITECTURE-SPINE.md#AD-11] — `FamilyResidentGuard` dual-check definition (verbatim: `FAMILY_LINK` row + `HOME_MEMBERSHIP` in the resident's home)
- [Source: apps/api/prisma/schema.prisma#FamilyLink] — existing model (`userId`, `residentId`, `homeId`, `@@unique([userId, residentId])`)
- [Source: apps/api/src/prisma/tenant-scoped-models.ts] — confirmed `FamilyLink` missing, must be added
- [Source: apps/api/src/users/users.service.ts#inviteUser] — existing rollback pattern to extend, not replace
- [Source: apps/api/src/common/auth/roles.guard.ts] — `CanActivate` pattern to mirror for the new guard
- [Source: _bmad-output/implementation-artifacts/epic-1-retro-2026-08-26.md] — decision that the full invite UI (with resident selector) is in scope somewhere in Epic 2, not pre-built as Epic 1 prep; this story's frontend scope is deliberately narrowed to link management, not the invite screen itself (confirm with Adrian which story owns the invite screen if it's still unbuilt when this story starts)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
