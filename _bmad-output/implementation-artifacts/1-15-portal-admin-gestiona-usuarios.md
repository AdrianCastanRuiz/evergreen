---
baseline_commit: aa310fd9d1d3edbdec0537baf80f115ff8c2402c
---

# Story 1.15: Admin Portal — Users Screen (frontend fix for Stories 1.3, 1.4, 1.5, 1.12)

Status: done

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

- [x] **`packages/shared-types/src/users.ts`** — add the missing request/response types this screen needs (AC: all). `HomeUserSummary`/`UpdateUserRoleRequest` already exist; add:
  - `PendingUserResponse { id: string; email: string; role: Role; isActive: boolean; homeId: string | null }` — matches `apps/api/src/users/users.service.ts`'s exported interface of the same name exactly (field-for-field — don't re-derive it, copy it).
  - `CreateSuperAdminRequest { email: string }`
  - `InviteUserRequest { email: string; role: Extract<Role, "staff" | "family"> }`
- [x] **`packages/shared-types/src/homes.ts`** — add `InviteHomeAdminRequest { email: string }` (this one's a `/homes/:id/admins` sub-resource, so it belongs with `Home`'s other request types, not in `users.ts`) (AC: #1).
- [x] **`apps/admin/src/routes/users.tsx`** (new) — the screen itself (AC: #1–#7). Structure:
  - `usersRoute = createRoute({ getParentRoute: () => protectedLayoutRoute, path: "/users", component: UsersPage })`.
  - `UsersPage`: same `!user` "Loading your account…" guard as `care-homes.tsx` (protected-layout.tsx guarantees `authenticated` status but not that `/auth/me` has resolved yet). Then branch on `user.role`: `super_admin` → `SuperAdminUsersPanel`; `admin` → `HomeAdminUsersPanel`; anything else → `<PermissionDenied />` (AC #7).
  - `SuperAdminUsersPanel`: two independent forms/cards, not a list (there is no "list all platform users" endpoint — don't build one, it doesn't exist):
    - "Invite a home admin": a home picker (`<select>` or similar, populated from `GET /homes` — reuse `listHomes()`'s query, same `["care-homes"]` query key as `care-homes.tsx` so React Query dedupes the fetch instead of issuing a second one) + email input → `POST /homes/:id/admins`.
    - "Create a super admin": email input only → `POST /users/super-admins`.
  - `HomeAdminUsersPanel`: list (Story 1.12 AC #1) + "Invite a user" dialog (email + role radio/select of `staff`/`family`) + per-row "Change role" and "Revoke access" actions. Follow `residents.tsx`'s exact shape: one `useQuery` for the list (`["users"]` query key), `useMutation`s for invite/role-change/revoke, `invalidateQueries` on each success, inline field-level error state from `ApiError`/`NetworkError` (see `residents.tsx`'s `ResidentForm` for the pattern — copy it, don't reinvent).
  - Revoke confirmation: reuse the existing `Dialog` component for a "Revoke access for {email}? They'll lose access immediately." confirm step before firing the `DELETE` (AC #6) — don't add a new confirm primitive. **Deviation:** used `AlertDialog` (`@/components/ui/alert-dialog`), not the plain `Dialog` this line names — `top-nav.tsx`'s "Log out?" flow already established `AlertDialog` as this app's exact pattern for a destructive-action confirm (Cancel/Action footer, no form inside), a closer match than the form-oriented `Dialog` used for create/edit. Same confirm-before-destructive-action outcome the AC asks for.
- [x] **`apps/admin/src/router.ts`** — import `usersRoute`, add it to `protectedLayoutRoute.addChildren([...])` alongside `indexRoute, residentsRoute, careHomesRoute` (AC: #9).
- [x] **`apps/admin/src/components/layout/sidebar-nav.tsx`** — add `to: "/users"` to the `"Users"` `NavItem` (line 40). Do not change its `roles` array (AC: #8, #9). Also corrected the section-level comment above `NAV_SECTIONS`, which still claimed "none of the target sections have real screens yet" — stale since Story 2.1 wired Residents; now lists all three wired sections.
- [x] **`_bmad-output/implementation-artifacts/deferred-work.md`** — add an entry: `staff` can invite `staff`/`family` per the backend (`@Roles('admin', 'staff')` on `POST /users/invites`, Story 1.5 AC #1) but has no portal route to do so (`sidebar-nav.tsx`'s "Users" entry is `admin`-and-above only) — a real, separate frontend gap, out of this story's scope (AC: #8).
- [x] **Manual verification** — see Debug Log References below for what was actually run and what was not (no real browser tool was available this session — see Completion Notes).

### Review Findings

- [x] [Review][Decision] Should `HomeUserRow`'s role-change `<select>` get a confirmation step before firing `PATCH /users/:id/role`, matching the `AlertDialog` confirm already required for revoke? — **Resolved: no, stays immediate.** Adrian's call: a lateral staff↔family move is reversible with a second click and materially smaller blast radius than a full access revocation; a confirm modal on every dropdown selection would be unwarranted friction. No code change.
- [x] [Review][Patch] Home picker `<select>` in `InviteHomeAdminCard` stays enabled with only its disabled placeholder option when `GET /homes` fails, instead of being visibly blocked. [apps/admin/src/routes/users.tsx InviteHomeAdminCard] (Blind Hunter + Edge Case Hunter) — **Fixed:** added `homesQuery.isError` to the select's `disabled` condition and its placeholder text ("Couldn't load homes").
- [x] [Review][Patch] `CreateSuperAdminCard` has no confirmation step before minting a new `super_admin` — the single most privileged action on this screen has less friction than revoking one staff/family user's access, which does get an `AlertDialog` confirm. [apps/admin/src/routes/users.tsx CreateSuperAdminCard] (Blind Hunter) — **Fixed:** the submit button now opens an `AlertDialog` confirm ("Create a super admin?") before the mutation fires, same pattern as revoke and `top-nav.tsx`'s "Log out?".
- [x] [Review][Patch] `InviteHomeAdminCard`/`CreateSuperAdminCard`'s success message ("Invite sent to X.") is never cleared when the user edits the email field afterward — only cleared on the next submit — so it stays on screen, stale and misleading, while they type a different address. [apps/admin/src/routes/users.tsx InviteHomeAdminCard, CreateSuperAdminCard] (Blind Hunter) — **Fixed:** both email inputs' `onChange` now also clears `success`.
- [x] [Review][Defer] No client-side email format validation on any of the three invite/create forms — `type="email"` plus `noValidate` on the `<form>` explicitly disables the browser's native email check, and the only feedback on a malformed address is a round-trip to the API. Compounds with the already-documented `deferred-work.md` gap that `ApiError` never surfaces NestJS's `string[]` validation messages, so the response is a generic "Bad Request" rather than a specific one. Low severity for an internal admin tool; same-shape gap exists on every other form in this app (`residents.tsx`, `care-homes.tsx`) for their own fields. [apps/admin/src/routes/users.tsx] — deferred, pre-existing pattern, not novel risk. (Blind Hunter)
- [x] [Review][Defer] Rapid repeated actions on the same `HomeUserRow` (e.g. a role change immediately followed by a second click) can race past the per-row pending-disable window before the invalidated `["users"]` query refetches, landing a subsequent action on a row the server already changed. The backend already returns a clean, mapped "User not found in your home" error for this case (`UsersService.mapRecordNotFoundViolation`), not a raw 500 — so the failure mode is a confusing-but-safe error message, not a crash or data corruption. [apps/admin/src/routes/users.tsx HomeUserRow] — deferred, low-probability edge case, same class already accepted elsewhere in this codebase (e.g. Story 1.3's deferred concurrent-invite race). (Blind Hunter + Edge Case Hunter)

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

claude-opus-5

### Debug Log References

- `pnpm --filter @evergreen/shared-types run typecheck` — clean.
- `pnpm --filter @evergreen/admin run typecheck` (`tsc -b --noEmit`) — clean.
- `pnpm --filter @evergreen/admin run lint` (`eslint . --fix`) — 0 errors; 18 warnings, all pre-existing `react-refresh/only-export-components` (every route file in this app exports helper functions alongside its component — same shape `residents.tsx`/`care-homes.tsx` already have). One real lint error surfaced and was fixed during implementation: `react-hooks/set-state-in-effect` on `HomeUserRow`'s original `useEffect(() => setRole(homeUser.role), [homeUser.role])` — replaced with React's documented "adjust state during render" pattern (compare against a `prevServerRole` state value, `setRole` only when it's stale) instead of an effect.
- `pnpm --filter @evergreen/admin run build` (`tsc -b && vite build`) — clean; the "chunk larger than 500kB" advisory is pre-existing (single JS bundle, no code-splitting configured anywhere in this app yet) and unrelated to this story's files.
- Manual E2E against a real running `apps/api` + local Postgres, and visual verification of the rendered screen in a real browser, were **not** performed this session — no browser automation tool was available (Claude-in-Chrome not connected). This mirrors Story 1.2's own precedent ("UI not visually verified in a browser this session," its Change Log, 2026-08-31) rather than silently overclaiming coverage. What *was* verified: the four backend endpoints' request/response shapes were read directly from `apps/api/src/users/{users.controller,users.service}.ts` and `apps/api/src/homes/homes.controller.ts` (not inferred), and every request built by `users.tsx` (`inviteHomeAdmin`, `createSuperAdmin`, `listHomeUsers`, `inviteUser`, `updateUserRole`, `revokeUserAccess`) matches those exactly — path, method, body shape, and response type. All four backend stories were already E2E-verified against real Postgres in their own Debug Logs (1.3, 1.4, 1.5, 1.12) and are untouched here.

### Completion Notes List

- Implemented per the story's task list, one deviation: the revoke-access confirmation uses `AlertDialog` (`@/components/ui/alert-dialog`, already used by `top-nav.tsx`'s "Log out?" flow) instead of the plain `Dialog` named in the story's Dev Notes — a closer match to this app's own existing confirm-before-destructive-action pattern. Same AC #6 outcome (a confirm step gates the `DELETE`).
- Found and fixed a real bug during implementation, not called out in the story: a naive `useEffect(() => setRole(homeUser.role), [homeUser.role])` to keep the per-row role `<select>` in sync with server-confirmed state triggered ESLint's `react-hooks/set-state-in-effect` and would have caused a visible "selection silently reverts" flicker on every role change (the controlled `<select>`'s `value` prop wouldn't have updated until the query invalidation round-trip completed). Fixed using React's documented in-render state-adjustment pattern instead (compare against a tracked previous-prop value, `setState` only when it's stale) — this is the correct fix, not a workaround.
- `sidebar-nav.tsx`'s section-level comment (above `NAV_SECTIONS`) was stale — still claimed no section had a real screen, though Story 2.1 had already wired "Residents". Corrected it while touching the same block for "Users", rather than leaving a comment the code next to it visibly contradicts.
- Exported `CARE_HOMES_QUERY_KEY` and `listHomes` from `care-homes.tsx` (previously module-private) so `users.tsx`'s home picker reuses the exact same React Query cache entry instead of issuing a duplicate `GET /homes` — true reuse per the story's Dev Notes, not just a same-literal-string query key.
- No `apps/api` changes, no schema changes, no new env vars — matches the story's stated scope exactly.

### File List

**New:**
- `apps/admin/src/routes/users.tsx`

**Modified:**
- `apps/admin/src/router.ts` (registered `usersRoute`)
- `apps/admin/src/components/layout/sidebar-nav.tsx` (wired `"Users"` → `/users`; corrected stale section comment)
- `apps/admin/src/routes/care-homes.tsx` (exported `CARE_HOMES_QUERY_KEY`, `listHomes` for reuse by `users.tsx`)
- `packages/shared-types/src/users.ts` (added `PendingUserResponse`, `CreateSuperAdminRequest`, `InviteUserRequest`)
- `packages/shared-types/src/homes.ts` (added `InviteHomeAdminRequest`)
- `_bmad-output/implementation-artifacts/deferred-work.md` (documented the `staff`-invite portal-access gap, out of this story's scope)

## Change Log

- 2026-09-01: Story created — consolidates the never-built portal frontend for Stories 1.3, 1.4, 1.5, and 1.12 (all backend-`done`, discovered via the same class of gap Story 1.2 had) into a single "Users" screen. Status → ready-for-dev.
- 2026-09-01: Frontend implemented on branch `feature/1-15-portal-admin-gestiona-usuarios` — new Users screen with role-conditional panels (`SuperAdminUsersPanel`: invite-home-admin + create-super-admin forms; `HomeAdminUsersPanel`: list + invite + role-change + revoke-with-confirm), new shared-types request/response types, router + sidebar wiring. Fixed a real `react-hooks/set-state-in-effect` bug found during implementation (see Completion Notes). All 4 backend stories (1.3/1.4/1.5/1.12) untouched. Clean `tsc -b`/`eslint`/`vite build` for both `apps/admin` and `@evergreen/shared-types`. No browser tool available this session — UI not visually/E2E-verified in a running browser, same disclosed limitation as Story 1.2. Status → review.
- 2026-09-01: Adversarial code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor) — Acceptance Auditor found zero AC/spec violations, confirmed all 6 API calls match the live backend exactly. 1 `[Review][Decision]` resolved (Adrian: role-change stays immediate, no confirm — smaller blast radius than revoke, confirmed on every dropdown edit would be unwarranted friction), 3 `[Review][Patch]` findings fixed (home-picker select now disables and shows an error placeholder when `GET /homes` fails; `CreateSuperAdminCard` now requires an `AlertDialog` confirm before minting a super_admin, matching revoke's pattern; both invite-panel success messages now clear when the email field is edited afterward). 2 low-severity findings deferred to `deferred-work.md` (no client-side email format validation; a rare same-row double-action race that already surfaces a clean backend error, not a crash). 11 findings dismissed as noise or matching existing precedent elsewhere in this app. `tsc -b`/`eslint`/`vite build` clean after patches. Status → done.
