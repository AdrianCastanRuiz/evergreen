---
baseline_commit: b909340a8e59ec96695a5ca560eee0ae4b9de321
---

# Story 2.1: Admins crean y gestionan perfiles de residentes por care home

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a home admin,
I want to create and manage resident profiles for my care home,
so that families and staff have accurate resident information to work from.

## Acceptance Criteria

1. **Given** I am a home admin, **when** I submit a resident's name, room, photo, and DOB, **then** a new `Resident` record is created scoped to my `home_id` (FR22).
2. **Given** a resident profile exists, **when** I edit their name, room, photo, or DOB, **then** the changes are persisted and reflected immediately wherever the resident is displayed.
3. **Given** no residents exist yet in my home, **when** I view the Residents screen, **then** I see the empty state "No residents yet" with a primary "Add a resident" action (UX-DR22).
4. **Given** I attempt to create or edit a resident outside my `home_id`, **when** the request is made, **then** it is rejected server-side (NFR7, AD-1).
5. **Given** I am family or staff, not a home admin, **when** I attempt to create or edit a resident profile, **then** the request is rejected — resident profile management is a home-admin capability (AD-12).

## Tasks / Subtasks

- [x] Task 1: Backend — `residents` module (AC #1, #2, #4, #5)
  - [x] Create `apps/api/src/residents/dto/create-resident.dto.ts` (`name` required, `room`/`dob`/`profilePhotoPublicId` optional)
  - [x] Create `apps/api/src/residents/dto/update-resident.dto.ts` (same fields, all optional — PATCH semantics)
  - [x] Create `apps/api/src/residents/residents.service.ts`: `create`, `findAll` (list, scoped), `findOne`, `update` — all via `this.prisma.client.resident.*`, no manual `home_id` filter (tenant-scoping extension auto-injects it since `Resident` is already in `TENANT_SCOPED_MODELS`)
  - [x] Create `apps/api/src/residents/residents.controller.ts`: `@Controller('residents')`, `@Roles('admin')` at class level (AC #5 — no `staff`/`family`/`super_admin`), routes `POST /`, `GET /`, `GET /:id`, `PATCH /:id`
  - [x] Create `apps/api/src/residents/residents.module.ts`, register in `AppModule.imports` (`app.module.ts`)
  - [x] Unit tests: `residents.service.spec.ts` (mock `PrismaService`, same shape as `homes.service.spec.ts`)
  - [x] E2e test: `apps/api/test/residents-manage-home.e2e-spec.ts` (pattern: `users-manage-home.e2e-spec.ts`) — covers AC #3 (empty list), AC #4 (cross-home 404, not 200-with-someone-else's-data), AC #5 (403 for `family`/`staff`)
- [x] Task 2: Shared types (AC #1, #2)
  - [x] Add `packages/shared-types/src/residents.ts`: `Resident`, `CreateResidentRequest`, `UpdateResidentRequest` interfaces; export from `index.ts`
- [x] Task 3: Frontend — Residents screen in `apps/admin` (AC #1, #2, #3)
  - [x] Add `apps/admin/src/routes/residents.tsx`: route under `protectedLayoutRoute`, register in `router.ts`
  - [x] Wire the existing "Residents" `sidebar-nav.tsx` entry to actually navigate (currently a plain `<button>` with no `onClick`/`Link` — every nav entry is inert today; this story is the first to make one real)
  - [x] Build the list view + empty state ("No residents yet" / "Add a resident", UX-DR22) + create/edit form (dialog or dedicated route — team's choice, no existing pattern to follow yet)
  - [x] Install missing shadcn/ui primitives as needed (`dialog`, `table` or list-row, `label`, `form`) — **only `alert-dialog`, `button`, `input`, `separator`, `sheet` exist today**
  - [x] Call the API via `authedRequest` from `apps/admin/src/lib/api.ts` (existing wrapper — do not build a parallel fetch path)

### Review Findings

- [x] [Review][Patch] `dob: null` is silently coerced to "field not supplied," so a resident's DOB can never be cleared once set [apps/api/src/residents/residents.service.ts:47-52] — `dto.dob ? new Date(dto.dob) : undefined` treats `null` (falsy) the same as `undefined`. `UpdateResidentDto.dob`/shared-types `UpdateResidentRequest.dob` also aren't typed to accept `null`. Same shape applies to `room`/`profilePhotoPublicId` at the type level, though those two are otherwise passed straight through.
- [x] [Review][Patch] `GET /residents` (list) has zero cross-home isolation test coverage [apps/api/test/residents-manage-home.e2e-spec.ts] — the AC #4 test only asserts 404 on get-by-id/patch across homes; nothing seeds a second home's residents and asserts `adminA`'s list excludes them, even though the list endpoint depends on the same tenant-scoping extension as every other operation.
- [x] [Review][Patch] Sidebar still shows "Residents" to `staff` although the backend is `@Roles('admin')`-only (AC #5) [apps/admin/src/components/layout/sidebar-nav.tsx:174] — `NAV_SECTIONS`'s Residents entry keeps `roles: ["admin", "staff"]` from Story 1.10; combined with no role-gating in `protected-layout.tsx`, a staff user can navigate there and only sees the generic "Couldn't load residents" error instead of a permission-denied message (UX-DR25 pattern used elsewhere).
- [x] [Review][Patch] No guard against a fast double-click submit in the create/edit dialog [apps/admin/src/routes/residents.tsx:671-677] — `handleSubmit` has no synchronous re-entrancy guard, only `disabled={mutation.isPending}` on the button, which can lag a render behind a second click and fire two `POST /residents`, creating a duplicate resident.
- [x] [Review][Patch] "Add a resident" button disappears entirely when the list query errors [apps/admin/src/routes/residents.tsx:560-563] — the header button's visibility condition (`residentsQuery.data && residentsQuery.data.length > 0`) is false whenever `residentsQuery.isError`, so a home that already has residents loses the ability to add a new one until a transient failure clears.
- [x] [Review][Defer] Calendar-invalid ISO dates (e.g. `2023-02-30`) pass `@IsISO8601({ strict: true })` format validation but `new Date()` silently rolls them over to a different date [apps/api/src/residents/dto/create-resident.dto.ts, update-resident.dto.ts] — pre-existing behavior of the validator/Date-API combination, not specific to this story, low real-world likelihood for a DOB field. Deferred — a calendar-validity check belongs to a shared date-validation utility, not this story.

## Dev Notes

### Backend pattern to follow

`Resident` is **already tenant-scoped** — no `@BypassTenantScope()` needed anywhere in this module. This story's shape is closer to `UsersController`'s home-admin routes (`listUsers`/`updateUserRole` in `apps/api/src/users/users.controller.ts`) than to `HomesController` (which bypasses because `Home` itself isn't tenant-scoped). Concretely:

```ts
@Controller('residents')
@Roles('admin')
export class ResidentsController {
  // this.tenantContext.getStore()?.homeId is guaranteed non-null past the
  // guards for an 'admin' caller — same invariant UsersController documents.
  // No manual home_id filtering needed: TENANT_SCOPED_MODELS already
  // includes 'Resident' (apps/api/src/prisma/tenant-scoped-models.ts),
  // so prisma.client.resident.findMany({}) is auto-scoped by the
  // tenant-scoping Prisma extension.
}
```

**No Prisma migration needed.** `model Resident` already exists in `apps/api/prisma/schema.prisma` (id, homeId, name, room, dob, profilePhotoPublicId, timestamps) and the `residents` table already exists in the DB — this was pre-created as part of Story 1.1's full-schema scaffold, ahead of the module that uses it. Verify with `npx prisma studio` or `\d residents` if anything looks off, but do not write a new migration for the table itself.

`profilePhotoPublicId` is a Cloudinary public ID (AD-4), not a URL — this story only stores/returns the ID string. The actual upload flow (signed upload, transformation URLs) is Epic 4's (Photos) scope; do not build upload plumbing here. For V1 of this story, treat it as an optional plain string field the admin can paste/leave blank — no image picker required unless you want to get ahead of Epic 4, but don't block this story on it.

### Frontend: the sidebar doesn't route anywhere yet

`apps/admin/src/components/layout/sidebar-nav.tsx`'s `NavItem` items are currently plain `<button>` elements with **no** `onClick` or `Link` — despite the type having an unused `disabled?: boolean` field, none of the 8 entries actually set it, and none navigate. This story is the first one to wire real navigation for one entry ("Residents"). Use TanStack Router's `Link` (see `apps/admin/src/routes/protected-layout.tsx` / `router.ts` for the route-tree pattern already in place) rather than inventing a second navigation mechanism. Leave the other 7 nav entries exactly as they are — wiring them is each entry's own future story, not this one's job.

### API client

Use `authedRequest<T>()` from `apps/admin/src/lib/api.ts` — it already handles the httpOnly-cookie refresh flow, timeout, and the `{ error: { code, message, details? } }` envelope (`ApiError`/`NetworkError`). Do not add a second fetch wrapper.

### Testing

- Unit: mock `PrismaService` exactly like `apps/api/src/homes/homes.service.spec.ts` (`prisma.client.resident.{create,findMany,findUnique,update}` as `jest.fn()`s injected via `{ provide: PrismaService, useValue: prisma }`).
- E2e: model on `apps/api/test/users-manage-home.e2e-spec.ts` — it's the closest existing case of "home admin manages a tenant-scoped resource within their own home, rejected for others." AC #4 (cross-home) must assert a `404`, not a `200` returning another home's resident or a raw `500` — same convention `UsersService.resolveManageableMembership` uses (never reveal whether the id exists in a different home).

### Project Structure Notes

- New backend module: `apps/api/src/residents/` (matches `ARCHITECTURE-SPINE.md`'s Source Tree — this directory is named but doesn't exist yet).
- Register `ResidentsModule` in `apps/api/src/app.module.ts`'s `imports` array, alongside `HomesModule`.
- New frontend route: `apps/admin/src/routes/residents.tsx`, added as a child of `protectedLayoutRoute` in `apps/admin/src/router.ts` (same pattern as `indexRoute`).
- **shadcn CLI gotcha on this Windows checkout** (known issue, not this story's bug): the CLI sometimes writes new components to a stray `./@/` folder at the repo root instead of `apps/admin/src/`. Check for that after running `npx shadcn add <component>` and move the file(s) into `apps/admin/src/components/ui/` by hand if it happens.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1] — AC source (verbatim above)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-evergreen-2026-07-02/ARCHITECTURE-SPINE.md#AD-1] — tenant isolation mechanism (Prisma extension + RLS), no manual `home_id` filtering
- [Source: ARCHITECTURE-SPINE.md#AD-12] — `@Roles(...)` / `RolesGuard`, no inline role-string comparisons
- [Source: ARCHITECTURE-SPINE.md#Source Tree] — `apps/api/src/residents/` target location
- [Source: apps/api/prisma/schema.prisma#Resident] — existing model, already migrated
- [Source: apps/api/src/prisma/tenant-scoped-models.ts] — `Resident` already in `TENANT_SCOPED_MODELS`
- [Source: apps/api/src/users/users.controller.ts] — closest existing controller pattern (home-admin-scoped, no bypass)
- [Source: apps/admin/src/components/layout/sidebar-nav.tsx] — nav entry exists, unwired
- [Source: apps/admin/src/lib/api.ts] — `authedRequest` client wrapper to reuse

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `npx jest src/residents/residents.service.spec.ts` — 8/8 passed
- `npx jest --config ./test/jest-e2e.json residents-manage-home` (against local Postgres via `docker compose up -d`) — 5/5 passed
- `npx jest` (full `apps/api` unit suite) — 119/119 passed, no regressions
- `npx jest --config ./test/jest-e2e.json` (full `apps/api` e2e suite) — 39/39 passed, no regressions
- `npx eslint` on all touched `apps/api` files — clean
- `npx tsc -b --noEmit` (`apps/admin`) — clean
- `npx eslint .` (`apps/admin`) — clean (only the pre-existing `react-refresh/only-export-components` warning every route file already has — same pattern as `index.tsx`/`login.tsx`)
- `npx tsc --noEmit` (`packages/shared-types`) — clean
- `npx vite build` (`apps/admin`) — succeeded

**Post-review patches:**
- `npx jest src/residents/residents.service.spec.ts` — 10/10 passed (2 new)
- `npx jest` (full `apps/api` unit suite) — 121/121 passed, no regressions
- `npx jest --config ./test/jest-e2e.json` (full `apps/api` e2e suite) — 39/39 passed, no regressions
- `npx eslint --fix` on touched `apps/api` files — 2 prettier formatting errors and 2 `no-unsafe-assignment` errors surfaced (from `expect.objectContaining` on an untyped `jest.fn()` mock); switched to full literal `data` objects in the two new tests instead, matching the file's existing assertion style — clean after
- `npx tsc -b --noEmit` (`apps/admin`) — clean
- `npx eslint .` (`apps/admin`) — clean (same pre-existing warnings as before)
- `npx tsc --noEmit` (`packages/shared-types`) — clean
- `npx vite build` (`apps/admin`) — succeeded

### Completion Notes List

- Backend: `ResidentsController`/`ResidentsService` follow `UsersController`'s home-admin-scoped shape exactly as the Dev Notes specified — no `@BypassTenantScope()`, no manual `home_id` filtering, `TenantContextService.getStore()?.homeId` guarded before every call so a guard-ordering bug surfaces as a 403, not the tenant-scoping extension's raw 500. `findOne`/`update` rely on the tenant-scoping extension auto-filtering `findUnique({ where: { id } })` by `home_id` — a cross-home id resolves to `null` → `NotFoundException` (AC #4), same convention `UsersService.resolveManageableMembership` uses.
- `dob` travels as an ISO-8601 date string end-to-end (`class-validator`'s `@IsISO8601({ strict: true })` on the DTOs, converted to a `Date` only at the Prisma call boundary in the service); shared-types' `Resident.dob` is typed `string | null` to match.
- No Prisma migration added — `Resident` already existed in the schema and DB (Story 1.1 scaffold), confirmed via `prisma migrate status` before starting.
- Frontend: reused `authedRequest` for every call, no parallel fetch path. First real usage of `@tanstack/react-query` in `apps/admin` (previously wired in `main.tsx`/`query-client.ts` but unused) for the residents list/create/edit — `useQuery` + `useMutation`, cache invalidated on save.
- Wired the "Residents" `sidebar-nav.tsx` entry with TanStack Router's `Link` via a new optional `to` field on `NavItem`; the other 7 entries are untouched, exactly as the Dev Notes instructed. Known gap, out of this story's scope: `NAV_SECTIONS` still shows "Residents" to `staff` (Story 1.10's role list), but the backend is `@Roles('admin')`-only (AC #5) — a staff user clicking it today sees the screen's generic "Couldn't load residents" error from the 403, not a nicer explanation. Flagging per the task's instruction rather than silently leaving it unmentioned; fixing the nav role list belongs to whichever future story owns `sidebar-nav.tsx`'s role scoping.
- Hit the documented shadcn CLI gotcha exactly as the Dev Notes warned: `npx shadcn add dialog label` wrote to a stray `apps/admin/@/components/ui/` folder instead of `apps/admin/src/components/ui/`. Moved both files by hand (with a couple of small edits to match this repo's existing `border-border`/`text-foreground` conventions already used in `alert-dialog.tsx`) and deleted the stray `@/` folder.
- No `table` primitive installed — the resident list is a simple bordered `<ul>` of rows (name, room, dob), per the story's "table or list-row, team's choice, no existing pattern to follow yet." No `form` primitive either — followed `login.tsx`'s existing controlled-input pattern (plain `useState` + touched/error state), since the codebase has no form-library dependency anywhere yet and the story didn't ask for one.
- Could not visually verify the screen in a real browser — the Claude-in-Chrome extension is not connected in this environment. Verification instead relied on: a clean `tsc -b`/`vite build`, a clean lint pass, and the e2e suite exercising the real `/residents` endpoints end-to-end (create/list/edit/cross-home-404/role-403) against a live local Postgres. Flagging explicitly per the task's "if you can't test the UI, say so" instruction.
- Docker Desktop was not running at the start of this session (needed for the local Postgres e2e dependency, same as Story 2.0's session) — started it, `docker compose up -d`, confirmed `prisma migrate status` was already up to date, then ran the full unit + e2e suites.

**Post-review patches (all 5 [Review][Patch] findings resolved):**
- Patch 1 (`dob: null` bug): `residents.service.ts`'s `update()` now distinguishes `undefined` (field not sent → leave untouched) from `null` (explicit → clear) from a real date string (→ `new Date(...)`), instead of the old falsy-coercing ternary that treated both the same. `UpdateResidentDto.dob` and shared-types' `UpdateResidentRequest.dob` are now typed `string | null`; no decorator change needed — confirmed in the installed `class-validator@0.14.4` source that `@IsOptional()`'s constraint already skips validation for both `null` and `undefined`. `create()` deliberately untouched (nothing to clear on create). Two new unit tests cover both branches (`clears dob when explicitly set to null...` / `leaves dob untouched when the field is not sent at all`).
- Patch 2 (list cross-home isolation): extended the existing AC #4 e2e test (which already seeds `homeB`/`residentB`) with a `GET /residents` assertion that `adminA`'s list excludes `residentB`'s id, instead of duplicating the seed in a new test.
- Patch 3 (sidebar over-exposure): `NAV_SECTIONS`'s "Residents" entry in `sidebar-nav.tsx` is now `roles: ["admin"]` (was `["admin", "staff"]`). No `sidebar-nav` test file exists in `apps/admin` to update (the app has no tests yet — `package.json`'s `test` script is a no-op placeholder).
- Patch 4 (double-submit guard): `ResidentForm.handleSubmit` now returns immediately on `if (mutation.isPending) return;` before any state updates, closing the race window between a second click and the `disabled` prop's re-render.
- Patch 5 (button disappearing on error): the header "Add a resident" button's visibility condition now also renders on `residentsQuery.isError`, not only when `data.length > 0`.
- Re-ran the full verification pass after the patches: 10/10 → 121/121 `apps/api` unit suite (2 new tests), 39/39 e2e suite (same test count — patch 2 extended an existing test rather than adding one), lint/`tsc`/`vite build` clean across `apps/api`, `apps/admin`, `packages/shared-types`. No regressions.
- The one `[Review][Defer]` finding (calendar-invalid ISO dates rolling over via `new Date()`) was left as-is per the review's own deferral — out of this story's scope, belongs to a future shared date-validation utility.

**Post-done fix — dev server wouldn't boot (found while starting `pnpm start:dev`):** `ResidentsService.create()`'s `data` object never included `homeId`, relying entirely on the tenant-scoping extension's runtime injection. `nest start`'s real `tsc` compile (via `ts-loader`, which none of the prior verification passes — `npx jest`, `npx eslint`, and an ad-hoc `npx tsc --noEmit` that was apparently never actually run for `apps/api` — had exercised) rejects this: Prisma's generated `ResidentCreateArgs.data` type requires either an explicit `homeId` (`ResidentUncheckedCreateInput`) or a nested `home` relation object (`ResidentCreateInput`); the extension's runtime injection is invisible to static analysis. Fixed by injecting `TenantContextService` into `ResidentsService` and passing `homeId: this.tenantContext.getHomeId()!` explicitly in `create()` — same redundant-but-type-satisfying convention `UsersService.createPendingHomeAdmin` already uses for `homeMembership.create`; the extension still overwrites it at runtime regardless (`injectHomeId` always wins). The non-null assertion is safe because `ResidentsController` calls `assertHomeContext()` before every service method. Updated `residents.service.spec.ts` to provide a mocked `TenantContextService` and assert `homeId` in the two `create()` tests' expected payloads. Re-verified: 121/121 unit tests, clean `eslint`, and — this time — a real `npx tsc --noEmit -p tsconfig.build.json` for `apps/api`, all clean. Both `apps/api` (`pnpm --filter ./apps/api start:dev`, port 3000, `/health` → 200) and `apps/admin` (`pnpm --filter ./apps/admin dev`, port 5173) confirmed booting and serving.

### File List

- `apps/api/src/residents/dto/create-resident.dto.ts` (new)
- `apps/api/src/residents/dto/update-resident.dto.ts` (new)
- `apps/api/src/residents/residents.service.ts` (new)
- `apps/api/src/residents/residents.controller.ts` (new)
- `apps/api/src/residents/residents.module.ts` (new)
- `apps/api/src/residents/residents.service.spec.ts` (new)
- `apps/api/test/residents-manage-home.e2e-spec.ts` (new)
- `apps/api/src/app.module.ts` (modified — registered `ResidentsModule`)
- `packages/shared-types/src/residents.ts` (new)
- `packages/shared-types/src/index.ts` (modified — export `./residents`)
- `apps/admin/src/routes/residents.tsx` (new)
- `apps/admin/src/router.ts` (modified — registered `residentsRoute`)
- `apps/admin/src/components/layout/sidebar-nav.tsx` (modified — added `to` field, wired "Residents" with `Link`)
- `apps/admin/src/components/ui/dialog.tsx` (new — shadcn primitive)
- `apps/admin/src/components/ui/label.tsx` (new — shadcn primitive)
- `apps/admin/package.json` (modified — `@radix-ui/react-dialog`, `@radix-ui/react-label` added by `npx shadcn add`)
- `pnpm-lock.yaml` (modified — same shadcn install)

## Change Log

- 2026-08-31: Story implemented on branch `feature/2-1-admins-crean-y-gestionan-perfiles-de-residentes-por-care-home` — backend `residents` module (DTOs, service, controller, module, unit + e2e tests), `@evergreen/shared-types` Resident types, and the Residents screen in `apps/admin` (list, empty state, create/edit dialog, sidebar nav wiring). All 5 ACs covered; 8/8 new unit tests and 5/5 new e2e tests passing, 119/119 full `apps/api` unit suite and 39/39 full e2e suite passing (no regressions), `tsc`/`vite build`/lint clean across `apps/api`, `apps/admin`, and `packages/shared-types`. UI not visually verified in a browser (Claude-in-Chrome not connected this session). Status → review.
- 2026-08-31: Code review patches applied — all 5 `[Review][Patch]` findings resolved: (1) `update()`'s `dob: null` clearing bug fixed, DTO/shared-types retyped to `string | null`, 2 new unit tests; (2) `GET /residents` cross-home isolation now asserted in the existing AC #4 e2e test; (3) sidebar "Residents" entry restricted to `roles: ["admin"]`; (4) synchronous double-submit guard added to `ResidentForm.handleSubmit`; (5) "Add a resident" header button now also shows on a list-query error. The 1 `[Review][Defer]` finding stays deferred, as accepted in review. 121/121 `apps/api` unit suite and 39/39 e2e suite passing (no regressions), lint/`tsc`/`vite build` clean. Status → done.
- 2026-08-31: Fixed a dev-server boot failure found while starting `apps/api` — `ResidentsService.create()` was missing `homeId` in its Prisma `data` object (only visible via a real `tsc` compile, e.g. `nest start`, not via `jest`/`eslint`). Added an explicit `homeId` from `TenantContextService.getHomeId()`, matching the existing `UsersService.createPendingHomeAdmin` convention; the tenant-scoping extension still overwrites it at runtime. Updated `residents.service.spec.ts` accordingly. Both `apps/api` and `apps/admin` dev servers confirmed booting and responding after the fix.
