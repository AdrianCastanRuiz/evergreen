---
baseline_commit: 9806a5d9fc202a18cc387bca85024f4c8761c2f3
---

# Story 2.2: Admins vinculan cuentas familiares a residentes específicos

Status: done

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

- [x] Task 1: `FamilyResidentGuard` — reusable infrastructure (AD-11, AC #5)
  - [x] Create `apps/api/src/common/auth/family-resident.guard.ts`, same shape as `apps/api/src/common/auth/roles.guard.ts` (`CanActivate`, injects `TenantContextService`)
  - [x] Logic: reads `residentId` from the route param, checks (a) a `FamilyLink` row exists for `(store.userId, residentId)` AND (b) the resident's `home_id` matches a `HomeMembership` the user holds — both conditions from AD-11, not just one
  - [x] Exempt `staff`/`admin`/`super_admin` — they're already scoped by role/`home_id` (AD-1), this guard is family-only
  - [x] **Scope boundary — do not build a family-facing consumer route in this story.** No family-facing "view resident" endpoint exists yet (that's Story 2.4). Prove AC #5 via a **unit test directly against the guard** (mock `ExecutionContext` + `TenantContextService`, same pattern `roles.guard.ts` would use if it had a spec file — check for one; if none exists, follow `homes.service.spec.ts`'s mocking style) rather than inventing a throwaway protected route to test through.
- [x] Task 2: Extend the Story 1.5 invite flow (AC #1)
  - [x] Add optional `residentId?: string` (`@IsOptional() @IsUUID()`) to `apps/api/src/users/dto/invite-user.dto.ts`
  - [x] In `UsersService.inviteUser` (`apps/api/src/users/users.service.ts`), when `targetRole === 'family'` and `residentId` is present: validate the resident belongs to `actorHomeId` (404 if not — never leak cross-home resident existence), then create the `FamilyLink` row in the same failure-handling block as the existing `HomeMembership` create (extend the existing `try { ... } catch { rollback }` — do not add a second, separate rollback path; see Dev Notes)
  - [x] `residentId` is ignored (not an error, just a no-op) if `targetRole === 'staff'` — a resident link only makes sense for family
- [x] Task 3: Link an already-active family member to an additional resident (AC #2)
  - [x] New endpoint `POST /residents/:residentId/family-links` — `@Roles('admin')`, body `{ userId: string }` (admin picks from their home's existing family users — reuse `GET /users` from Story 1.12, filtered client-side or via `?role=family`, see Dev Notes)
  - [x] Service validates: target user has an active `HomeMembership` with role `family` in the admin's home (404 otherwise, same non-revealing pattern as `UsersService.resolveManageableMembership`), and doesn't already have a `FamilyLink` to this resident (409 conflict)
- [x] Task 4: List and remove links (AC #5)
  - [x] `GET /residents/:residentId/family-links` — `@Roles('admin')`, lists linked family users for the admin UI (name/email) so there's something to remove
  - [x] `DELETE /residents/:residentId/family-links/:userId` — `@Roles('admin')`, deletes the `FamilyLink` row; 404 if it doesn't exist (don't leak cross-home resident/user existence)
  - [x] All four new routes live in `apps/api/src/residents/` (extends Story 2.1's module — do not create a separate `family-links` module; residents own this sub-resource, same way `HomesController` owns `POST /homes/:id/admins`)
- [x] Task 5: Shared types + frontend
  - [x] Extend `packages/shared-types/src/residents.ts` (created in Story 2.1): `FamilyLink`, `LinkFamilyMemberRequest` — named `FamilyLinkedMember` for the response shape (see Dev Notes) instead of `FamilyLink`, to avoid colliding with a plausible future name for the raw Prisma-model-shaped type.
  - [x] Extend `InviteUserRequest` (wherever Story 1.5's invite type lives — check `packages/shared-types/src/users.ts`) with optional `residentId`
  - [x] Frontend: the invite-a-user UI does not exist yet in `apps/admin` (confirmed during Epic 1 retro — `POST /users/invites` is API-only today). **This story does not build that UI.** Per the retro decision (2026-08-26), the full invite UI — including the resident-selector this story's AC #1 needs — is Story 2.2's own frontend scope is limited to the **link management** surface (add-existing-family-member-to-a-resident + remove-link), on the Residents screen Story 2.1 builds. Building the invite screen itself is tracked separately; coordinate with Adrian before assuming it's in scope here if the Residents screen has no invite entry point yet to attach a resident-picker to.
- [x] Task 6: Tests
  - [x] Unit: `family-resident.guard.spec.ts`, extend `residents.service.spec.ts` (from 2.1) with link/unlink cases
  - [x] E2e: extend or add `apps/api/test/residents-manage-home.e2e-spec.ts` (from 2.1) with AC #1 (invite-time link), AC #2 (link existing), AC #4 (cross-home 404), AC #5 (unlink → guard test, not a live route)

### Review Findings

Reviewed by three parallel layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). All patch findings applied directly; no decision-needed or deferred items.

- [x] [Review][Patch] `grantExistingFamilyUserHomeAccess` silently dropped `residentId` for an existing active family user gaining access to a new home — AC #1's FamilyLink-at-invite-time only applied to the brand-new-user path, never this branch [apps/api/src/users/users.service.ts:265-330]. Fixed by threading `residentId` through, creating the `FamilyLink` inside the same failure-handling block, rolled back via the existing `rollbackHomeMembership` on any failure in that block (not just token issuance). Covered by new unit tests and a new e2e case.
- [x] [Review][Patch] `linkFamilyMember` accepted a pending (not-yet-activated) family invitee — `HomeMembership` carries no active/pending status of its own (that's on `User.isActive`), so a just-invited, unactivated family user's membership row satisfied the `role: 'family'` check alone, contradicting AC #2's "already active" precondition and Task 3's own spec [apps/api/src/residents/residents.service.ts:95-107]. Fixed by including `user.isActive` in the lookup and rejecting when false. Covered by new unit and e2e tests.
- [x] [Review][Patch] `FamilyResidentGuard` failed OPEN when the tenant-context store was entirely absent — `store?.role !== 'family'` treats "no store at all" identically to "exempt staff/admin/super_admin," both returning `true` [apps/api/src/common/auth/family-resident.guard.ts:26-27]. Fixed with an explicit `if (!store) throw new ForbiddenException()` before the role check. Covered by a new unit test.
- [x] [Review][Patch] `FamilyResidentGuard` had no UUID-format validation on the route's `residentId`, unlike every controller route (`ParseUUIDPipe`) — a malformed id would reach Prisma directly and surface an unhandled validation error instead of a clean 403 [apps/api/src/common/auth/family-resident.guard.ts:32-40]. Fixed with `isUUID()` from `class-validator`. Covered by a new unit test.
- [x] [Review][Patch] Frontend `FamilyLinksPanel`'s "Remove" button had no confirmation step, inconsistent with this app's own established pattern for the same class of action (`role-users-panel.tsx`'s "Revoke access" `AlertDialog`) [apps/admin/src/routes/residents.tsx]. Fixed by wrapping Remove in the same `AlertDialog` confirm pattern.
- [x] [Review][Patch] Frontend `FamilyLinksPanel` rendered a failed `GET /users` fetch identically to "no family members available" — `usersQuery.isError` had no branch, unlike `linksQuery`'s equivalent [apps/admin/src/routes/residents.tsx]. Fixed by surfacing an explicit error message and disabling the select on that state too.
- [x] [Review][Patch] No test proved `linkFamilyMember`'s `HomeMembership` lookup is genuinely home-scoped (vs. just role-scoped) for a family user who is a real member of a *different* home. Added an e2e case seeding a second home's family user and asserting 404.

Dismissed as false positives after verifying against the actual (non-diff-visible) code — mostly artifacts of Blind Hunter's no-repo-access constraint: `HomeMembership` missing home-scoping (it's already in `TENANT_SCOPED_MODELS`), missing `@Roles('admin')` on the new routes (covered by the controller's class-level decorator), no schema/migration shown (the `FamilyLink` model predates this story, from Story 1.1's scaffold), the `getHomeId()!` non-null assertion (guarded by `assertHomeContext()`, same established pattern as `ResidentsService.create`), the `["users"]` query-key match being unverified (confirmed identical to `role-users-panel.tsx`), duplicate `LinkedFamilyMember`/`FamilyLinkedMember` type shapes (matches this codebase's existing `PendingUserResponse`/`HomeUserSummary` dual-declaration convention), blanket P2002-to-409 mapping without inspecting `meta.target` (matches existing `mapUniqueEmailViolation`/`mapUniqueMembershipViolation`), rollback-test depth (matches sibling test rigor), and no `key` prop on `FamilyLinksPanel` (mitigated by the modal's mount/unmount, same as `ResidentForm` in the same file).

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

## Change Log

- 2026-09-03: Implemented Story 2.2 — `FamilyResidentGuard`, resident-linking at invite time (AC #1), link/list/unlink endpoints for already-active family members (AC #2/#4/#5), shared-types, and the admin portal's "Family links" management UI. Fixed three pre-existing, unrelated e2e assertions missing the invitee-name-capture feature's `name` field, found while getting the full regression suite green.
- 2026-09-03: Applied 7 code-review patch findings (see Review Findings above) — the `residentId`-drop gap in the existing-family-user invite branch, the missing `isActive` check on `linkFamilyMember`, the guard's fail-open-on-missing-context and missing UUID validation, and two frontend gaps (no confirm on Remove, swallowed `usersQuery` error) — plus a missing e2e case for cross-home family-user linking. Story moved to `done`.
- 2026-09-04: Manual browser verification (post-PR, Claude-in-Chrome) surfaced a real bug: `apps/admin/src/lib/api.ts`'s `request<T>` only skipped `response.json()` for a `204` response — `POST /residents/:residentId/family-links` returns `201 Created` with an empty body, so a *successful* link was reported to the admin as "Something went wrong" (an unhandled `Unexpected end of JSON input`), even though the `FamilyLink` row had already committed server-side. Fixed by reading the body as text first and only parsing it if non-empty. Re-verified live: link, unlink, and the AlertDialog confirmation all work correctly with no false error. Same latent bug noted in `apps/mobile/src/lib/api.ts` for a future story (`deferred-work.md`) — mobile doesn't consume an empty-bodied endpoint yet.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `npx jest` (apps/api, unit): 10 suites, 142 tests passed.
- `npx jest --config test/jest-e2e.json` (apps/api, e2e): 9 suites, 47 tests passed (local docker-compose Postgres).
- `npx tsc --noEmit` clean in both `apps/api` and `apps/admin`.
- `npx eslint` clean (0 errors) in both `apps/api` and `apps/admin` (admin's pre-existing `react-refresh/only-export-components` warnings only, same class already present on every other route file).
- `npx nest build` (apps/api) exits 0.
- After code review's patch findings were applied: `npx jest` (unit) 10 suites/147 tests passed; `npx jest --config test/jest-e2e.json` (e2e) 9 suites/50 tests passed; `npx tsc --noEmit` and `npx eslint` clean in both apps again; `npx nest build` exits 0.

### Completion Notes List

- **Dev Notes correction: `FamilyLink` was already in `TENANT_SCOPED_MODELS`.** The story's Dev Notes (written before Story 2.1 merged) call this out as a gap to fix. Re-checked `apps/api/src/prisma/tenant-scoped-models.ts` directly — `FamilyLink` is already present. No change made there; noted here instead of leaving a stale instruction unaddressed.
- Task 2's `residentId` validation sits in `UsersService.inviteUser` *before* the existing rollback `try` block (a bad resident id 404s with zero writes), and the `FamilyLink` create itself sits *inside* the existing try, right after `inviteCodeService.generateForMembership` — so a `FamilyLink` failure rolls back the same way a code/token failure already did (no second rollback path, per Dev Notes).
- Task 3/4's `ResidentsService` methods (`linkFamilyMember`, `listFamilyLinks`, `unlinkFamilyMember`) reuse `findOne()` for the cross-home 404 (AC #4), and map `familyLink.create`'s P2002 to 409 / `familyLink.delete`'s P2025 to 404, mirroring `UsersService`'s existing violation-mapping helpers.
- `FamilyResidentGuard` needed `tenantContext.runBypassed()` for its own reads: a `family` caller's JWT carries no `home_id` (`AuthService.resolveFixedHomeId` returns `null` for `family`, since a family user can hold memberships in several homes), so the tenant-scoping extension's normal auto-injected-homeId path can't be used to read `FamilyLink`/`HomeMembership` here — the guard supplies its own `userId`/`residentId`/`homeId` filters instead. No route consumes the guard yet (Story 2.3/2.4's scope); proven by a dedicated unit test per the story's own scope boundary.
- **Frontend (Task 5, admin portal):** added a "Family links" button per resident row on the existing Residents screen (`apps/admin/src/routes/residents.tsx`), opening a dialog to list currently-linked family members (with remove) and link an existing, already-active family member from a `<select>` (native element, matching `users.tsx`'s existing convention — no shadcn `select` primitive installed in this app yet). Did **not** touch the invite-a-user flow (`role-users-panel.tsx`) — out of scope per the story's own Task 5 note and the Epic 1 retro decision.
- **Pre-existing regression fix (unrelated to Story 2.2, needed for a green full suite):** three e2e assertions (`users-invite.e2e-spec.ts`, `homes-invite.e2e-spec.ts`, `users-super-admin.e2e-spec.ts`) predated the invitee-name-capture feature (commit `e1a75f9`) and never picked up the response's `name: null` field — fixed all three with one-line `toEqual` additions.
- **Test-file refactor (`users-invite.e2e-spec.ts`):** introduced a shared `homeA`/`adminA`/`adminAToken` fixture (mirroring `residents-manage-home.e2e-spec.ts`'s existing pattern) so this story's new coverage didn't push the file's total `POST /auth/login` calls past the 5/min-per-IP throttle (AD-8) — the file was already at exactly 5 logins for 5 tests before this story.
- **Not verified in a browser (initially):** Claude-in-Chrome was not connected earlier in this session, so the "Family links" dialog was first verified by type-check + lint + code review against the established `role-users-panel.tsx` pattern only. Once the extension reconnected, a manual click-through (link, unlink, the AlertDialog confirmation) was done directly in Chrome — see the next note for what that verification found.
- **Bug found via manual browser verification, fixed:** `apps/admin/src/lib/api.ts`'s `request<T>` only treated `204` as "no body, skip `response.json()`" — `POST /residents/:residentId/family-links` returns `201 Created` with an *empty* body (`Promise<void>` controller method), so a successful link threw `Unexpected end of JSON input` client-side and showed the admin a generic "Something went wrong" error even though the `FamilyLink` had already committed. Confirmed root cause by monkey-patching `fetch` in the live page (captured the real bearer token, replayed the exact request, saw `status: 201, body: ""`, and reproduced the same parse error calling `response.json()` on it directly). Fixed by reading the body as text first and only `JSON.parse`-ing when non-empty — verified live afterward: link, unlink, and the remove-confirmation dialog all behave correctly with no false error. `apps/mobile/src/lib/api.ts` has the identical latent bug, noted in `deferred-work.md` (mobile doesn't consume an empty-bodied endpoint yet, so nothing exercises it there today).
- Started local Postgres (`docker compose up -d`, Docker Desktop was not running at session start) to run the e2e suite — left running, along with the API (`start:dev`) and admin (`dev`) servers, for manual verification.

### File List

- `apps/api/src/common/auth/family-resident.guard.ts` (new)
- `apps/api/src/common/auth/family-resident.guard.spec.ts` (new)
- `apps/api/src/users/dto/invite-user.dto.ts` (edit — optional `residentId`)
- `apps/api/src/users/users.service.ts` (edit — `inviteUser` resident validation + `FamilyLink` create)
- `apps/api/src/users/users.service.spec.ts` (edit — new `inviteUser` residentId cases)
- `apps/api/src/users/users.controller.ts` (edit — pass `dto.residentId` through)
- `apps/api/src/residents/dto/link-family-member.dto.ts` (new)
- `apps/api/src/residents/residents.service.ts` (edit — `linkFamilyMember`/`listFamilyLinks`/`unlinkFamilyMember`)
- `apps/api/src/residents/residents.service.spec.ts` (edit — new describe blocks for the three methods above)
- `apps/api/src/residents/residents.controller.ts` (edit — three new routes)
- `apps/api/test/residents-manage-home.e2e-spec.ts` (edit — new family-links e2e cases)
- `apps/api/test/users-invite.e2e-spec.ts` (edit — new AC #1/#4 case, shared-fixture refactor, pre-existing `name: null` fix)
- `apps/api/test/homes-invite.e2e-spec.ts` (edit — pre-existing `name: null` fix, unrelated to this story)
- `apps/api/test/users-super-admin.e2e-spec.ts` (edit — pre-existing `name: null` fix, unrelated to this story)
- `packages/shared-types/src/residents.ts` (edit — `FamilyLinkedMember`, `LinkFamilyMemberRequest`)
- `packages/shared-types/src/users.ts` (edit — optional `residentId` on `InviteUserRequest`)
- `apps/admin/src/routes/residents.tsx` (edit — "Family links" button + `FamilyLinksPanel` dialog)
- `apps/admin/src/lib/api.ts` (edit — `request<T>` no longer assumes only `204` can have an empty body; found via manual browser verification)
