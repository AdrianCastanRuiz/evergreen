# Story 2.1: Admins crean y gestionan perfiles de residentes por care home

Status: ready-for-dev

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

- [ ] Task 1: Backend — `residents` module (AC #1, #2, #4, #5)
  - [ ] Create `apps/api/src/residents/dto/create-resident.dto.ts` (`name` required, `room`/`dob`/`profilePhotoPublicId` optional)
  - [ ] Create `apps/api/src/residents/dto/update-resident.dto.ts` (same fields, all optional — PATCH semantics)
  - [ ] Create `apps/api/src/residents/residents.service.ts`: `create`, `findAll` (list, scoped), `findOne`, `update` — all via `this.prisma.client.resident.*`, no manual `home_id` filter (tenant-scoping extension auto-injects it since `Resident` is already in `TENANT_SCOPED_MODELS`)
  - [ ] Create `apps/api/src/residents/residents.controller.ts`: `@Controller('residents')`, `@Roles('admin')` at class level (AC #5 — no `staff`/`family`/`super_admin`), routes `POST /`, `GET /`, `GET /:id`, `PATCH /:id`
  - [ ] Create `apps/api/src/residents/residents.module.ts`, register in `AppModule.imports` (`app.module.ts`)
  - [ ] Unit tests: `residents.service.spec.ts` (mock `PrismaService`, same shape as `homes.service.spec.ts`)
  - [ ] E2e test: `apps/api/test/residents-manage-home.e2e-spec.ts` (pattern: `users-manage-home.e2e-spec.ts`) — covers AC #3 (empty list), AC #4 (cross-home 404, not 200-with-someone-else's-data), AC #5 (403 for `family`/`staff`)
- [ ] Task 2: Shared types (AC #1, #2)
  - [ ] Add `packages/shared-types/src/residents.ts`: `Resident`, `CreateResidentRequest`, `UpdateResidentRequest` interfaces; export from `index.ts`
- [ ] Task 3: Frontend — Residents screen in `apps/admin` (AC #1, #2, #3)
  - [ ] Add `apps/admin/src/routes/residents.tsx`: route under `protectedLayoutRoute`, register in `router.ts`
  - [ ] Wire the existing "Residents" `sidebar-nav.tsx` entry to actually navigate (currently a plain `<button>` with no `onClick`/`Link` — every nav entry is inert today; this story is the first to make one real)
  - [ ] Build the list view + empty state ("No residents yet" / "Add a resident", UX-DR22) + create/edit form (dialog or dedicated route — team's choice, no existing pattern to follow yet)
  - [ ] Install missing shadcn/ui primitives as needed (`dialog`, `table` or list-row, `label`, `form`) — **only `alert-dialog`, `button`, `input`, `separator`, `sheet` exist today**
  - [ ] Call the API via `authedRequest` from `apps/admin/src/lib/api.ts` (existing wrapper — do not build a parallel fetch path)

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

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
