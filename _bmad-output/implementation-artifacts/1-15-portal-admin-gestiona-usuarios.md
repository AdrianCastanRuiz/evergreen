---
baseline_commit: aa310fd9d1d3edbdec0537baf80f115ff8c2402c
---

# Story 1.15: Admin Portal — Users Screen (frontend fix for Stories 1.3, 1.4, 1.5, 1.12)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a super admin or home admin,
I want a "Users" screen in the admin portal where I can invite/create the accounts my role is allowed to manage and — for home admins — see, re-role, and revoke my home's staff/family users,
so that the user-management capability the API has had since Epic 1 (Stories 1.3, 1.4, 1.5, 1.12) is actually usable from the portal, not just via raw HTTP.

## Background — why this story exists

`apps/admin`'s sidebar has had a "Users" entry, visible to `super_admin` and `admin`, since Story 1.10 (`apps/admin/src/components/layout/sidebar-nav.tsx:40`) — but it has **never had a route** (`to` is unset, unlike `"Care homes"` and `"Residents"`). Clicking it does nothing. This is the exact same shape of gap Story 1.2 had (backend shipped in Epic 1, before `apps/admin` existed; frontend never followed) — that one was found and fixed retroactively on 2026-08-31 (see `1-2-super-admin-crea-y-gestiona-care-homes.md`, `sprint-status.yaml`'s `epic-1: done # re-closed 2026-08-31` note). This story is the same fix, for the "Users" section, consolidating **four** already-`done`, already-tested backend stories that all feed the same screen:

| Story | What it built (backend, already `done`, untouched by this story) | Route |
|---|---|---|
| 1.3 | `super_admin` invites a home admin to a specific care home | `POST /homes/:id/admins` |
| 1.4 | `super_admin` creates another `super_admin` | `POST /users/super-admins` |
| 1.5 | `admin`/`staff` invites a `staff` or `family` user into their own home | `POST /users/invites` |
| 1.12 | `admin` lists/re-roles/revokes their home's `staff`/`family` users | `GET /users`, `PATCH /users/:id/role`, `DELETE /users/:id` |

**Do not touch any backend code for this story.** All four endpoints are implemented, unit-tested, and (per each story's Debug Log) manually E2E-verified. Read `apps/api/src/users/users.controller.ts` and `apps/api/src/users/users.service.ts` in full before writing any frontend code — every response shape, error case, and role rule below is already final and enforced server-side (`RolesGuard`/`AD-12`, tenant scoping/`AD-1`/`NFR7`). This story is 100% `apps/admin` + `packages/shared-types` (new request/response types only — the API already returns these shapes, `shared-types` just doesn't declare them yet).

## Acceptance Criteria

**Super admin panel** (own section of the Users screen):

1. **Given** I am a `super_admin` on the Users screen, **when** I pick a care home and enter an email, **then** `POST /homes/:id/admins` is called and I see success feedback; a `409` (email already exists) shows inline, a `404` (home not found — can't happen from a dropdown of real homes, but the call can still race a home's deletion) shows a generic error (Story 1.3).
2. **Given** I am a `super_admin`, **when** I enter an email under "Create super admin", **then** `POST /users/super-admins` is called; a `409` shows inline (Story 1.4).

**Home admin panel** (own section of the Users screen):

3. **Given** I am an `admin`, **when** the Users screen loads, **then** I see every `staff`/`family` user of my home (`GET /users`) with their role and active/pending status (Story 1.12 AC #1).
4. **Given** I am an `admin` (or `staff`, per AC #6 below), **when** I invite a new user by email + role (`staff` or `family`), **then** `POST /users/invites` is called; a `409` (email conflict, or same-home-role-not-family) shows inline; a `403` (inviting at/above my own role — can't happen from this UI since the role picker only ever offers `staff`/`family`, but the API enforces it regardless) is not something the UI needs to special-case beyond a generic error (Story 1.5).
5. **Given** I am an `admin`, **when** I change a user's role between `staff` and `family`, **then** `PATCH /users/:id/role` is called and the list updates; a `409` ("belongs to more than one home", promoting to `staff`) shows inline (Story 1.12 AC #2/#4).
6. **Given** I am an `admin`, **when** I revoke a user's access, **then** I confirm first (this is an immediate, session-invalidating action — `DELETE /users/:id`), then the list updates (Story 1.12 AC #5). No generic browser `confirm()` — use the existing `Dialog` component, same as every other destructive-ish flow in this app.

**Access boundaries** (client-side UX only — the API enforces all of this regardless of what the UI shows or hides):

7. **Given** I am `staff`, **when** I land on `/users` (e.g. via a stale link — `staff` never sees the nav entry per `sidebar-nav.tsx`'s existing role list), **then** I see the existing `PermissionDenied` component, same pattern as `care-homes.tsx`/`residents.tsx`.
8. Story 1.5's actual AC #1 allows **both** `admin` and `staff` to invite `staff`/`family` ("home admin, or staff, where permitted" — the epic's framing) and the backend's `@Roles('admin', 'staff')` on `POST /users/invites` confirms this. But `sidebar-nav.tsx` currently gates the whole "Users" section to `["super_admin", "admin"]` only — `staff` has no route to it at all today. **Resolve this by NOT changing `staff`'s access in this story**: `sidebar-nav.tsx`'s role list for "Users" stays `["super_admin", "admin"]` exactly as-is. `staff`'s invite capability (which the backend already supports) is a real, separate frontend gap — write it to `deferred-work.md` rather than silently expanding this story's scope; broadening portal nav access is a product decision, not a bug-fix call (see Dev Notes for the exact deferred-work.md entry to add).

**Wiring**:

9. `sidebar-nav.tsx`'s `"Users"` entry gets `to: "/users"` (mirrors how Story 2.1 wired `"Residents"`).

## Tasks / Subtasks

- [ ] **`packages/shared-types/src/users.ts`** — add the missing request/response types this screen needs (AC: all). `HomeUserSummary`/`UpdateUserRoleRequest` already exist; add:
  - `PendingUserResponse { id: string; email: string; role: Role; isActive: boolean; homeId: string | null }` — matches `apps/api/src/users/users.service.ts`'s exported interface of the same name exactly (field-for-field — don't re-derive it, copy it).
  - `CreateSuperAdminRequest { email: string }`
  - `InviteUserRequest { email: string; role: Extract<Role, "staff" | "family"> }`
- [ ] **`packages/shared-types/src/homes.ts`** — add `InviteHomeAdminRequest { email: string }` (this one's a `/homes/:id/admins` sub-resource, so it belongs with `Home`'s other request types, not in `users.ts`) (AC: #1).
- [ ] **`apps/admin/src/routes/users.tsx`** (new) — the screen itself (AC: #1–#7). Structure:
  - `usersRoute = createRoute({ getParentRoute: () => protectedLayoutRoute, path: "/users", component: UsersPage })`.
  - `UsersPage`: same `!user` "Loading your account…" guard as `care-homes.tsx` (protected-layout.tsx guarantees `authenticated` status but not that `/auth/me` has resolved yet). Then branch on `user.role`: `super_admin` → `SuperAdminUsersPanel`; `admin` → `HomeAdminUsersPanel`; anything else → `<PermissionDenied />` (AC #7).
  - `SuperAdminUsersPanel`: two independent forms/cards, not a list (there is no "list all platform users" endpoint — don't build one, it doesn't exist):
    - "Invite a home admin": a home picker (`<select>` or similar, populated from `GET /homes` — reuse `listHomes()`'s query, same `["care-homes"]` query key as `care-homes.tsx` so React Query dedupes the fetch instead of issuing a second one) + email input → `POST /homes/:id/admins`.
    - "Create a super admin": email input only → `POST /users/super-admins`.
  - `HomeAdminUsersPanel`: list (Story 1.12 AC #1) + "Invite a user" dialog (email + role radio/select of `staff`/`family`) + per-row "Change role" and "Revoke access" actions. Follow `residents.tsx`'s exact shape: one `useQuery` for the list (`["users"]` query key), `useMutation`s for invite/role-change/revoke, `invalidateQueries` on each success, inline field-level error state from `ApiError`/`NetworkError` (see `residents.tsx`'s `ResidentForm` for the pattern — copy it, don't reinvent).
  - Revoke confirmation: reuse the existing `Dialog` component for a "Revoke access for {email}? They'll lose access immediately." confirm step before firing the `DELETE` (AC #6) — don't add a new confirm primitive.
- [ ] **`apps/admin/src/router.ts`** — import `usersRoute`, add it to `protectedLayoutRoute.addChildren([...])` alongside `indexRoute, residentsRoute, careHomesRoute` (AC: #9).
- [ ] **`apps/admin/src/components/layout/sidebar-nav.tsx`** — add `to: "/users"` to the `"Users"` `NavItem` (line 40). Do not change its `roles` array (AC: #8, #9).
- [ ] **`_bmad-output/implementation-artifacts/deferred-work.md`** — add an entry: `staff` can invite `staff`/`family` per the backend (`@Roles('admin', 'staff')` on `POST /users/invites`, Story 1.5 AC #1) but has no portal route to do so (`sidebar-nav.tsx`'s "Users" entry is `admin`-and-above only) — a real, separate frontend gap, out of this story's scope (AC: #8).
- [ ] **Manual verification** — at minimum: log in as `super_admin`, invite a home admin to a real home, confirm `409` on re-invite; log in as an existing `admin`, confirm the staff/family list loads, invite a `staff` user, change their role to `family` and back, revoke a test user and confirm the confirm-dialog gates it. `apps/api` is untouched — no need to re-verify its endpoints, just that the frontend calls them correctly and renders their responses/errors.

## Dev Notes

### The API surface (read the actual source before coding — this is a summary, not the contract)

- `apps/api/src/homes/homes.controller.ts:63` — `POST /homes/:id/admins`, `@Roles('super_admin')` (class-level), body `InviteHomeAdminDto { email }`, returns `PendingUserResponse` (201). `404` if `:id` doesn't exist, `409` on email conflict.
- `apps/api/src/users/users.controller.ts` — `@Controller('users')`, class-level `@Roles('super_admin')`, with per-route overrides:
  - `POST /users/super-admins` (inherits class-level `super_admin`-only) — body `CreateSuperAdminDto { email }`, returns `PendingUserResponse { homeId: null }`.
  - `POST /users/invites`, `@Roles('admin', 'staff')` — body `InviteUserDto { email, role: 'staff' | 'family' }`, returns `PendingUserResponse`. Acting user's home comes from their own JWT server-side — **never** send a `homeId` in the body, there's no field for it.
  - `GET /users`, `@Roles('admin')` — no params, returns `HomeUserSummary[]` (already typed in `shared-types/src/users.ts`) scoped to the caller's home.
  - `PATCH /users/:id/role`, `@Roles('admin')` — body `UpdateUserRoleDto { role: 'staff' | 'family' }` (already typed as `UpdateUserRoleRequest`), returns updated `HomeUserSummary`. `:id` is the target user's id, from the list.
  - `DELETE /users/:id`, `@Roles('admin')` — `204`, no body.
- Every error is the standard `{ error: { code, message, details? } }` envelope `ApiError` (`apps/admin/src/lib/api.ts`) already parses — no new error handling infra needed, just read `.status`/`.message` off the caught `ApiError` like `residents.tsx`'s `ResidentForm.onError` does.

### Reuse, don't reinvent — the two existing screens are the pattern

`apps/admin/src/routes/residents.tsx` and `care-homes.tsx` are the **only** two real screens in this app so far, and both are recent (Story 2.1, Story 1.2-retroactive). This story's screen must look and behave like a third sibling, not a new style:
- Same `useQuery`/`useMutation`/`invalidateQueries` shape, same query-key-array convention (`["users"]`, not `["users-list"]` or similar).
- Same `Dialog`/`DialogContent`/`DialogHeader`/`DialogFooter`/`Input`/`Label`/`Button` primitives from `@/components/ui/*` — no new form primitives.
- Same inline-error convention: `err instanceof ApiError` → `err.message`; `err instanceof NetworkError` → the fixed connection-lost copy; anything else → generic fallback. Copy `residents.tsx`'s `ResidentForm.onError` verbatim in shape.
- Same submit re-entrancy guard (`if (mutation.isPending) return;` before firing) — `residents.tsx`'s `handleSubmit` has the comment explaining why (fast double-click race).
- `care-homes.tsx`'s `!user` → "Loading your account…" guard (not `PermissionDenied`) is deliberate (Review Finding on that story) — copy that distinction exactly, don't collapse it into a single `PermissionDenied` check.

### Two roles, two very different panels — do not build a unified "user list" for super_admin

There is **no `GET` endpoint that lists platform-wide users** — `UsersController` has no such route, and none is planned by any of Stories 1.3/1.4/1.5/1.12. Don't invent one or fake it client-side. `super_admin`'s half of this screen is action-only (two small forms), not a list. Resist the urge to make it "consistent" with the home-admin list — they're genuinely different capabilities per the epics (`FR48`/`FR49` are create-only; `FR12`/`FR50` are the only list/manage ACs, and both are `admin`-scoped-to-own-home).

### Role-hierarchy and self-lockout errors are server-side only — the UI doesn't need to pre-validate them

`UsersService.inviteUser`'s `ROLE_RANK` check (AC #5 of Story 1.5) and `resolveManageableMembership`'s self-lockout guard (`apps/api/src/users/users.service.ts:387`) are both enforced server-side and return standard `403`/`404` the UI already handles generically via `ApiError`. Don't add client-side role-hierarchy logic — the invite form only ever offers `staff`/`family` anyway (mirrors `InviteUserDto`'s `INVITABLE_ROLES`), so the hierarchy check can never actually trigger from this UI in practice.

### `homeId` is never client-supplied for the home-admin panel

Every home-admin-panel call (`GET /users`, `POST /users/invites`, `PATCH /users/:id/role`, `DELETE /users/:id`) is scoped to the caller's own home via their JWT/tenant context server-side — there is no home selector anywhere in `HomeAdminUsersPanel`, unlike `SuperAdminUsersPanel`'s explicit home picker for the `/homes/:id/admins` call. Don't add one; it would be dead UI at best and a spoofing attempt at worst (the API ignores it either way, but sending a fake scoping param is a bad pattern to introduce).

### Project Structure Notes

- New files: `apps/admin/src/routes/users.tsx`. Modified: `apps/admin/src/router.ts`, `apps/admin/src/components/layout/sidebar-nav.tsx`, `packages/shared-types/src/users.ts`, `packages/shared-types/src/homes.ts`, `_bmad-output/implementation-artifacts/deferred-work.md`.
- No `apps/api` changes. No schema changes. No new env vars.
- `sprint-status.yaml`: this story reopens `epic-1` from `done` to `in-progress` (same as Story 1.2's retroactive fix did) — re-close it to `done` once this ships, with a dated comment, same convention as `1-2-...: done # reopened+implemented 2026-08-31`.

### Testing standards

- `pnpm --filter @evergreen/admin run test` (if a test runner is configured for this app — check `apps/admin/package.json`; `care-homes.tsx`/`residents.tsx` shipped with no component tests, only `tsc -b`/`eslint`/`vite build` as the bar per their Change Logs — match that bar unless the app has since grown a test setup).
- `pnpm --filter @evergreen/admin run build`, `run lint`, and a real `tsc -b --noEmit` must all be clean, same bar as Story 1.2/2.1.
- Manually verify against a real running `apps/api` (docker-compose Postgres) as both a `super_admin` and an `admin` — this screen's whole value is real HTTP round-trips against already-tested backend logic; mocking the API here would just prove the UI compiles, not that it works.

### References

- [Source: apps/api/src/users/users.controller.ts, users.service.ts] — the frozen backend contract this story's UI must call correctly.
- [Source: apps/api/src/homes/homes.controller.ts:63] — `POST /homes/:id/admins`.
- [Source: apps/admin/src/routes/residents.tsx, care-homes.tsx] — the two existing screens to mirror.
- [Source: apps/admin/src/components/layout/sidebar-nav.tsx] — nav wiring convention (`to` field, Story 2.1 precedent for going from disabled to wired).
- [Source: _bmad-output/implementation-artifacts/1-2-super-admin-crea-y-gestiona-care-homes.md] — the precedent for this exact class of fix (backend-done-frontend-missing, retroactive story).
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3, 1.4, 1.5, 1.12] — original acceptance criteria this story's UI must satisfy.
- [Source: packages/shared-types/src/users.ts, auth.ts, homes.ts] — existing type conventions to extend, not duplicate.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-09-01: Story created — consolidates the never-built portal frontend for Stories 1.3, 1.4, 1.5, and 1.12 (all backend-`done`, discovered via the same class of gap Story 1.2 had) into a single "Users" screen. Status → ready-for-dev.
