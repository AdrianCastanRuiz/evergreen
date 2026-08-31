---
baseline_commit: 546183a2486d9fd5d1cedd1988a3d2ee2f08f0ff
---

# Story 1.2: Super admin crea y gestiona care homes

Status: done

<!-- Retroactive story file: the backend for this story shipped early in Epic 1
(before per-story files existed) and sprint-status.yaml already marks it
"done" on that basis. This file documents the backend as already complete
and scopes the frontend work that was never built — apps/admin didn't exist
yet when the backend shipped (it was scaffolded later, in Story 1.13). -->

## Story

As a super admin,
I want to create and manage care homes on the platform,
So that a new care home group can be onboarded without any code change or downtime.

## Acceptance Criteria

1. **Given** I am logged in as a super admin, **when** I submit a new home's name, address, and timezone, **then** a new `Home` record is created and immediately available for admin assignment (FR47, NFR11).
2. **Given** I submit a home name that already exists, **when** I attempt to create it, **then** an inline validation error identifies the conflict, and no duplicate or partial home record is created.
3. **Given** a home has been created, **when** I view the homes list, **then** I can edit its name, address, or timezone.
4. **Given** I am not a super admin, **when** I attempt to access home creation or management, **then** I receive the permission-denied treatment (UX-DR25) and the request is rejected server-side regardless of client-side state (AD-12, NFR7).
5. **Given** a home is created, **when** any other module (residents, content, events, meals) later scopes data to it, **then** that home's `home_id` is usable immediately with no manual database work.

## Tasks / Subtasks

- [x] Task 1: Backend — `homes` module (AC #1, #2, #3, #4, #5) — **already implemented and shipped, not part of this pass**
  - [x] `apps/api/src/homes/homes.controller.ts`: `@Controller('homes')`, `@Roles('super_admin')` at class level (AC #4), routes `POST /`, `GET /`, `GET /:id`, `PATCH /:id`
  - [x] `apps/api/src/homes/homes.service.ts`: `create`/`findAll`/`findOne`/`update`, unique-name violations mapped to `ConflictException` (AC #2) instead of a raw 500
  - [x] `apps/api/src/homes/dto/create-home.dto.ts` / `update-home.dto.ts`: `name`/`timezone` required on create (`timezone` validated against `Intl.supportedValuesOf('timeZone')`, real IANA zones only), `address` optional, all optional on update (PATCH semantics)
  - [x] Unit tests: `homes.service.spec.ts` — create/list/findOne/update, including the duplicate-name `ConflictException` path (AC #2) and the not-found path
  - [x] `Home` is NOT tenant-scoped (it's the tenant root, AD-1) — routes are gated purely by `@Roles('super_admin')`, never by `home_id`
- [x] Task 2: Shared types (AC #1, #3)
  - [x] Add `packages/shared-types/src/homes.ts`: `Home`, `CreateHomeRequest`, `UpdateHomeRequest` interfaces (mirror `residents.ts`'s shape); export from `index.ts`
- [x] Task 3: Frontend — Care Homes screen in `apps/admin` (AC #1, #2, #3, #4)
  - [x] Add `apps/admin/src/routes/care-homes.tsx`: route under `protectedLayoutRoute`, register in `router.ts` (same pattern as `residents.tsx`)
  - [x] Wire the existing "Care homes" `sidebar-nav.tsx` entry with `to: "/care-homes"` (it's already correctly scoped to `roles: ["super_admin"]` from Story 1.10 — no over-exposure fix needed here, unlike Residents' staff issue)
  - [x] Build the list view + generic empty state ("No care homes yet" + "Add a care home" action, UX-DR22's generic pattern — this is NOT one of the named copy variants) + create/edit form (dialog, same shape as Residents' `ResidentForm`)
  - [x] Inline duplicate-name error (AC #2): the create/edit form must surface the API's `409 Conflict` ("A home with this name already exists") as a field-level error on the `name` input, not a generic banner (UX-DR28: validation errors render inline, field-level)
  - [x] Timezone input: a plain text field is enough for V1 (no timezone picker component exists in the codebase yet) — server-side `@IsIn(IANA_TIME_ZONES)` is the actual validation; surface a `400` from that check as an inline field-level error the same way as the name conflict
  - [x] Permission-denied treatment (AC #4, UX-DR25): add a reusable `apps/admin/src/components/permission-denied.tsx` ("You don't have access to this" message + a way back, e.g. a link to `/`) and use it in `care-homes.tsx` when `useAuth().user?.role !== "super_admin"` — client-side UX only, the actual authorization is still `@Roles('super_admin')` server-side (AD-12); do NOT add role-gating to `protected-layout.tsx` itself or to any other route — this story only guards its own screen, same scope discipline Story 2.1 used for the sidebar
  - [x] Call the API via `authedRequest` from `apps/admin/src/lib/api.ts` (existing wrapper — do not build a parallel fetch path)

### Review Findings

- [x] [Review][Decision] Clearing an existing home's address silently fails to persist (AC #3 gap) [apps/admin/src/routes/care-homes.tsx:399-401] — `address: address.trim() || undefined` means blanking the Address field on an edit omits `address` from the PATCH body entirely (`JSON.stringify` drops `undefined` keys); `homes.service.ts#update` passes the DTO straight through to Prisma, so an absent key means "leave unchanged," not "clear it." **Resolved: fix it properly (Adrian's choice).** `UpdateHomeDto.address` and shared-types' `UpdateHomeRequest.address` retyped to `string | null` (no decorator change needed — `@IsOptional()` already skips validation for both `null`/`undefined`, same as Story 2.1's `dob` fix). `homes.service.ts#update` needed no change — it already passes the DTO straight through to Prisma, and Prisma's `HomeUpdateInput.address` natively accepts `string | null`. Frontend's `CareHomeForm` mutation now sends `address: null` explicitly on edit when the field is blank (vs. `undefined` on create, where there's nothing to clear). New unit test: `homes.service.spec.ts`'s `'clears the address when explicitly set to null'`.
- [x] [Review][Patch] 400 responses are unconditionally misattributed to the timezone field [apps/admin/src/routes/care-homes.tsx:414-428] — `err.status === 400` always routes to `timezoneServerError` on the assumption "name is unlikely to hit its 255-char cap," but there was no client-side length cap enforcing that assumption. **Fixed:** added `maxLength={255}`/`maxLength={500}` to the name/address `Input`s, matching the backend's own `@MaxLength` decorators exactly — the browser itself now prevents typing past those caps, so a 400 reaching this handler can only plausibly be the timezone.
- [x] [Review][Patch] `user?.role !== "super_admin"` doesn't distinguish a null `user` from a genuinely wrong role [apps/admin/src/routes/care-homes.tsx:266] — `apps/admin/src/lib/auth.tsx`'s `signIn` can leave `status: "authenticated"` with `user: null` if the post-login `/auth/me` call fails. **Fixed:** `CareHomesPage` now checks `!user` first and renders a neutral "Loading your account…" message instead of `PermissionDenied` for that case; the wrong-role check only runs once `user` is confirmed non-null.
- [x] [Review][Defer] `apps/admin/src/lib/api.ts`'s `ApiError` parsing only handles a string `message`, silently dropping NestJS `ValidationPipe`'s default `string[]` message on every 400 app-wide — already self-flagged by the implementer in this file's Completion Notes as a shared `api.ts` gap, out of this screen's scope to fix. Deferred — logged in `deferred-work.md`.
- [x] [Review][Defer] No optimistic-concurrency guard on `CareHomeForm`'s edit path [apps/admin/src/routes/care-homes.tsx:374-403] — if another super admin edits/renames the same home between this dialog's data being captured and its submit, the PATCH silently overwrites their concurrent change (lost update). No versioning/`updatedAt` check exists anywhere in the app yet to build this against. Deferred — logged in `deferred-work.md`.

## Dev Notes

### Backend is done — do not touch `apps/api/src/homes/`

This story's backend shipped early in Epic 1 (before per-story `.md` files existed in `_bmad-output/implementation-artifacts/`) — `sprint-status.yaml` already carries `1-2-...: done` on that basis, and it stays `done`; this story file exists retroactively to scope and track the frontend, which was never built (`apps/admin` didn't exist until Story 1.13, well after this backend shipped). Read `apps/api/src/homes/homes.controller.ts` and `homes.service.ts` before writing any frontend code — the API shape below is already final:

```
POST   /homes              { name, address?, timezone }  -> 201 Home
GET    /homes                                              -> 200 Home[]  (ordered by name asc)
GET    /homes/:id                                           -> 200 Home | 404
PATCH  /homes/:id          { name?, address?, timezone? }  -> 200 Home | 404 | 409 (name conflict)
```

`Home` (from `apps/api/prisma/schema.prisma`): `id`, `name` (unique), `address` (nullable), `timezone`, `createdAt`, `updatedAt`. No `homeId`/tenant column on `Home` itself — it IS the tenant root.

### Frontend: follow `residents.tsx` — it's the only real screen precedent in this app

Story 2.1 built the first (and so far only) real screen in `apps/admin`: `apps/admin/src/routes/residents.tsx`. Copy its shape directly rather than inventing a new pattern:
- `createRoute({ getParentRoute: () => protectedLayoutRoute, path: "/care-homes", component: CareHomesPage })`, registered in `router.ts`'s `protectedLayoutRoute.addChildren([...])` array (add `careHomesRoute` alongside `indexRoute`, `residentsRoute`).
- `@tanstack/react-query`'s `useQuery`/`useMutation` via `authedRequest`, cache invalidated on save — same as `residentsQuery`/`RESIDENTS_QUERY_KEY` pattern (use a `CARE_HOMES_QUERY_KEY` here).
- The `Dialog`/`DialogContent`/`DialogHeader`/`DialogFooter`/`DialogTitle` primitives and `Label`/`Input`/`Button` already exist (`apps/admin/src/components/ui/`) from Story 2.1 — no new shadcn install needed for the form itself.
- Controlled-input form state (plain `useState` + touched/error state, no form library), same as `ResidentForm`.

### What's actually NEW here, unlike Story 2.1

Two things Residents didn't need, that this story does:

1. **Inline conflict error (AC #2).** Residents' form only had client-side required-field validation; this one must also handle a real `409` from the API (duplicate `name`) and show it inline on the `name` field, not as a generic top-of-form error banner. `authedRequest` throws `ApiError` with `.status`/`.code`/`.message` from the API's `{ error: { code, message, details? } }` envelope (see `apps/admin/src/lib/api.ts`) — check `err.status === 409` (or `err.code`, whichever `ApiError` exposes — read `api.ts` to confirm) and route that one into the `name` field's error state instead of the generic catch-all.

2. **Permission-denied screen (AC #4, UX-DR25).** This is the first screen in the app to need one — nothing like it exists yet. Story 2.1's code review flagged this exact gap for the Residents screen (a `staff` user hitting a 403 just saw "Couldn't load residents", not a real permission-denied treatment) and explicitly deferred fixing it — see `_bmad-output/implementation-artifacts/deferred-work.md`'s "code review of story-2-1-..." entry. Don't fix that Residents gap here — it's Residents' own scope, not this story's — but DO build the reusable `PermissionDenied` component now, since this story's own AC #4 requires it, and use it only on `/care-homes`. A future story can point Residents (and any other route) at the same component. UX-DR25's requirement: "clear 'You don't have access to this' message + a way back — never a silent failure or blank screen." Check role from `useAuth().user.role` (already available — see `sidebar-nav.tsx` for the exact same read) client-side to decide whether to render the real screen or `<PermissionDenied />`; this is a UX nicety only; the server-side `@Roles('super_admin')` guard is what actually enforces AC #4 regardless of what the client does (NFR7).

### Empty state (AC #3 implicitly, UX-DR22)

"Care homes" is one of UX-DR22's generic-pattern list, not one of the named copy variants (`Residents`, `Photos`, `Events`, `News` all have bespoke copy) — use the generic "No [x] yet" + one primary action shape: "No care homes yet" / "Add a care home".

### Project Structure Notes

- New frontend route: `apps/admin/src/routes/care-homes.tsx`, added as a child of `protectedLayoutRoute` in `apps/admin/src/router.ts`.
- New shared component: `apps/admin/src/components/permission-denied.tsx`.
- New shared type file: `packages/shared-types/src/homes.ts`, exported from `index.ts` (same pattern as `residents.ts`).
- No backend changes, no Prisma migration, no new shadcn primitives.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2] — AC source (verbatim above)
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR22] — generic empty-state pattern for "homes"
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR25] — permission-denied treatment requirement (AC #4)
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR28] — inline field-level validation errors (AC #2)
- [Source: apps/api/src/homes/homes.controller.ts, homes.service.ts, dto/] — final, already-shipped backend
- [Source: apps/admin/src/routes/residents.tsx] — closest existing frontend pattern (Story 2.1)
- [Source: apps/admin/src/components/layout/sidebar-nav.tsx] — "Care homes" nav entry exists, already correctly role-scoped, unwired (no `to`)
- [Source: apps/admin/src/lib/api.ts] — `authedRequest`/`ApiError` client wrapper to reuse
- [Source: apps/admin/src/lib/auth.tsx] — `useAuth()` for `user.role`
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — Story 2.1's deferred permission-denied gap on Residents (context only, not in this story's scope to fix)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `npx tsc -b --noEmit` (`apps/admin`) — clean
- `pnpm run lint` (workspace-wide, includes `apps/admin`, `apps/api`, `apps/mobile`) — 0 errors; 11 pre-existing-pattern `react-refresh/only-export-components` warnings across all route files (including the 3 new ones in `care-homes.tsx`), same warning every existing route file already carries
- `pnpm run build` (workspace-wide) — `apps/admin` ✓ built in 4.32s; `apps/api`/`apps/mobile` unaffected, also succeeded
- `npx jest` (`apps/api` full unit suite) — 121/121 passed, no regressions (backend untouched by this story)
- `npx jest --config ./test/jest-e2e.json` (`apps/api` full e2e suite) — 39/39 passed with `--runInBand`; an initial parallel-worker run hit hook timeouts in 2 unrelated suites, traced to Postgres connection contention from a dev server + a concurrent full-workspace build running at the same time, not a regression (re-ran sequentially to confirm)
- `npx tsc --noEmit -p tsconfig.build.json` (`apps/api`, the real compile check — Story 2.1 had a bug only this catches, not `jest`/`eslint`) — clean, confirms the untouched backend still compiles

### Completion Notes List

- Backend (`apps/api/src/homes/`) was not touched — it shipped complete in an earlier pass of Epic 1, before this story had its own file. This session only added the frontend that was missing.
- `packages/shared-types/src/homes.ts` mirrors `residents.ts`'s shape exactly (`Home`/`CreateHomeRequest`/`UpdateHomeRequest`).
- `apps/admin/src/routes/care-homes.tsx` copies `residents.tsx`'s structure (route registration, `react-query` list/create/edit, controlled-input dialog form, the same double-submit guard and "action button survives a list-load error" pattern from Story 2.1's own code-review patches).
- AC #2 (inline duplicate-name error): `CareHomeForm`'s mutation `onError` checks `err.status === 409` and routes it to the `name` field's error state instead of the generic banner. `Home.name` is the model's only unique constraint, so a 409 is unambiguous.
- AC #4 (permission-denied, UX-DR25): **correction to this story file's own Dev Notes** — `apps/admin/src/components/permission-denied.tsx` was NOT new. It already existed, built (and unused) since Story 1.10 (commit `1539fa0`), with copy essentially identical to what the Dev Notes above asked for. First pass of this implementation wrote over it with a near-duplicate before noticing via `git status` showing it as modified rather than untracked; reverted with `git checkout HEAD -- apps/admin/src/components/permission-denied.tsx` and used the pre-existing component as-is (unmodified) instead. `care-homes.tsx` is its first real caller anywhere in the app (`if (user?.role !== "super_admin") return <PermissionDenied />`); `protected-layout.tsx` and every other route are untouched — client-side UX only, the real enforcement is the backend's existing `@Roles('super_admin')`. Story 2.1's equivalent gap on Residents (staff seeing a generic error instead of this same component) stays deferred, per `deferred-work.md` — out of this story's scope to fix, though it's now a one-line fix for whoever picks that up, since the component was sitting there unused the whole time.
- Known gap, flagged rather than silently left unmentioned: the timezone field's 400-error handling shows a fixed generic message ("Please enter a valid IANA timezone, e.g. Europe/Madrid.") rather than the API's actual validation message. This is because `apps/admin/src/lib/api.ts`'s `ApiError` parsing only handles a string `message`, but NestJS's default `ValidationPipe` returns `message` as a `string[]` for validation failures — so today that array is silently dropped and `ApiError.message` falls back to the HTTP status text ("Bad Request") for ANY validation error on this app, not something specific to this story. Routing a bare 400 to the timezone field is a reasonable inference (name's only constraint is a generous 255-char max, unlikely to be hit) but not a guarantee. A proper fix belongs in `api.ts`'s shared error parsing (handle `string[]` messages), not this screen — flagging here rather than fixing there, to stay in scope.
- Could not visually verify the screen in a real browser this session (no browser automation connected) — verified instead via clean `tsc -b`/`vite build`/lint, and by reading the actual rendered API contract (`homes.controller.ts`/`homes.service.ts`) the form and list are built against.

**Post-review patches (Decision resolved + both Patch findings applied):**
- Decision (address-clear bug): resolved by touching the backend after all — `UpdateHomeDto.address`/`UpdateHomeRequest.address` retyped `string | null`, `CareHomeForm` sends `null` explicitly on edit-with-blank-address, `undefined` on create. No `homes.service.ts` change needed (already a pass-through). New test added.
- Patch (400 misattribution): `maxLength={255}`/`{500}` added to the name/address inputs, matching the backend's `@MaxLength` decorators — makes the "a 400 here is always timezone" assumption actually true.
- Patch (null-user permission-denied confusion): `CareHomesPage` now shows a neutral loading state for `user === null`, only shows `PermissionDenied` once a non-null user's role is confirmed wrong.
- Re-verified after patches: `apps/api` 122/122 unit tests (1 new), clean `eslint`, clean real `tsc --noEmit -p tsconfig.build.json`; `apps/admin` clean `tsc -b --noEmit`, `eslint` (0 errors, same 11 pre-existing warnings), `vite build` succeeds.
- The 2 `[Review][Defer]` findings (api.ts's `string[]` message gap; no optimistic-concurrency guard) were left as-is per the review's own deferral, logged in `deferred-work.md`.

### File List

- `packages/shared-types/src/homes.ts` (new)
- `packages/shared-types/src/index.ts` (modified — export `./homes`)
- `apps/admin/src/components/permission-denied.tsx` (pre-existing since Story 1.10, unmodified — see Completion Notes correction; first real caller wired up by this story)
- `apps/admin/src/routes/care-homes.tsx` (new; modified again post-review for the 3 findings above)
- `apps/admin/src/router.ts` (modified — registered `careHomesRoute`)
- `apps/admin/src/components/layout/sidebar-nav.tsx` (modified — added `to: "/care-homes"` to the existing "Care homes" entry)
- `apps/api/src/homes/dto/update-home.dto.ts` (modified post-review — `address` retyped `string | null`)
- `apps/api/src/homes/homes.service.spec.ts` (modified post-review — new null-clear test)

## Change Log

- 2026-08-31: Retroactive story file created — the backend for this story shipped early in Epic 1 with no per-story file; `apps/admin` didn't exist yet at the time. This file documents the backend as complete and scopes the frontend work.
- 2026-08-31: Frontend implemented on branch `feature/1-2-super-admin-crea-y-gestiona-care-homes` — `@evergreen/shared-types` Home types, the Care Homes screen in `apps/admin` (list, generic empty state, create/edit dialog with inline 409 name-conflict and timezone validation errors), a new reusable `PermissionDenied` component (AC #4/UX-DR25) used only on this screen, and sidebar nav wiring. All 5 ACs covered by the existing (already-tested) backend plus this new frontend. `apps/admin`: clean `tsc -b --noEmit`, `eslint` (0 errors), `vite build`. `apps/api` (untouched): 121/121 unit tests, 39/39 e2e tests, clean `eslint` and a real `tsc --noEmit -p tsconfig.build.json` compile — no regressions. UI not visually verified in a browser this session. Status → review.
- 2026-08-31: Code review patches applied — the 1 `[Review][Decision]` finding resolved (Adrian chose to fix the address-clear bug properly, touching the previously "don't touch" backend DTO), both `[Review][Patch]` findings fixed (maxLength caps preventing 400 misattribution; null-user vs. wrong-role distinction on the permission check). The 2 `[Review][Defer]` findings stay deferred. 122/122 `apps/api` unit tests (1 new) and clean real `tsc --noEmit` for `apps/api`; `apps/admin` clean `tsc -b`/`eslint`/`vite build`. Status → done.
