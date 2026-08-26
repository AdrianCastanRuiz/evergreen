---
baseline_commit: c3c8e28
---

# Story 1.10: Navegación basada en rol tras login (mobile + web portal)

Status: ready-for-dev

<!-- Alcance: AMBAS superficies. Corrección 2026-08-26: la versión inicial de este
story se redactó mobile-only basándose en un estado local de git desactualizado
que no reflejaba el merge del PR #22. Verificado contra GitHub: PR #22 (Story 1.14,
issue #28, admin portal login) está MERGED en develop (24-08) y apps/admin YA tiene
auth (lib/auth.tsx, rutas login.tsx + protected-layout.tsx). Se restauró el alcance
completo (mobile + portal web). -->

## Story

As a logged-in user,
I want to see navigation appropriate to my role,
so that I only encounter screens relevant to what I can actually do.

## Acceptance Criteria

1. **Given** I log in as `family` on mobile, **when** navigation renders, **then** I see the mobile `bottom-tab-bar` with Home, Photos, Events, Menu, News in that order (FR10, UX-DR13).
2. **Given** I log in as `staff` on mobile, **when** navigation renders, **then** I see only the single-screen photo-upload flow, **no** tab bar (FR10).
3. **Given** I log in as `staff`, `admin` (home admin), or `super_admin` on the web portal, **when** navigation renders, **then** I see the `sidebar-nav` scoped to my role's permitted sections (UX-DR14).
4. **Given** I am authenticated but attempt to reach a route my role doesn't permit, **when** the route loads, **then** I see the permission-denied treatment (UX-DR25) — never a silent failure or blank screen (AD-12).
5. **Given** the web portal at `<md` width, **when** I am staff viewing the portal from a personal mobile browser, **then** the sidebar becomes a sheet triggered from a top bar and every admin surface I have access to remains usable (UX-DR39).
6. **(Scope note)** Portal screens are navigation scaffolding only — this story establishes the role-scoped nav shell. Actual business screens (Residents/Content/Events/Menu metrics) ship in their own epics. Where a role has no real target screen yet, route to a placeholder/empty-state rather than a blank screen.

## Tasks / Subtasks

### Mobile (apps/mobile)

- [ ] **Bottom-tab-bar component** — `apps/mobile/src/components/ui/tab-bar.tsx` (AC: #1): white background, `{colors.border}` top hairline + subtle shadow, active tab `{colors.primary}`, inactive `{colors.muted-foreground}` (DESIGN.md:308), accessibility labels (UX-DR36/DR38), no badge counts.
- [ ] **Family `(tabs)` route group** — `apps/mobile/src/app/(tabs)/` with `index` (Home), `photos`, `events`, `menu`, `news` (AC: #1). Placeholder/empty-state screens; content screens belong to Epics 2/3/5/6.
- [ ] **Staff single-screen route** — staff-only route without a tab bar (AC: #2), representing the single-screen photo-upload flow (functional upload is Story 4.1; here it's the role-scoped placeholder screen).
- [ ] **Wire role-based nav in RootNavigator** — `apps/mobile/src/app/_layout.tsx`: extend the stable `Stack`/`Stack.Protected` guards (do NOT swap tree identity — splash-freeze bug, `_layout.tsx:42-48`): family → `(tabs)` group; staff/non-family → single-screen; preserve existing `index`/`login`/`request-password-reset`/`reset-password`/`onboarding` guards.
- [ ] **Reconcile family "has residents?" gate** — today family lands on `onboarding` (`_layout.tsx:60-62`). `MeResponse` has `role`/`homeId` but no linked resident (UX-DR23). Ask-first (see Dev Notes Critical risk #1): anchor family on onboarding guard OR a real linked-residents query. Never fabricate resident data or render the resident-switcher (UX-DR9) prematurely.

### Web portal (apps/admin)

- [ ] **Role-scoped `sidebar-nav`** — `apps/admin/src/components/layout/sidebar-nav.tsx`: derive permitted sections from `useAuth().user.role` (AC: #3, UX-DR14). Map roles → sections per epics coverage:
  - `super_admin`: Care homes, Users, Residents, Content, Events, Menu, Dashboard.
  - `admin` (home admin): Users (their home), Residents, Content, Events, Menu, Dashboard — NOT Care homes/Users-across-homes (FR50 scoped, Story 1.12).
  - `staff`: Residents, Content, Events, Menu (upload/photos) — scoped to their home; NOT user/role management (AD-12).
  - Confirm the exact section granularity with what each epic delivers; keep the sidebar honest — only show sections a role can actually reach.
  - Keep the collapse/rail/sheet behavior already in `Shell` (collapsed at `md`, `<md` sheet) working with scoped items.
- [ ] **Permission-denied treatment** (AC: #4, UX-DR25) — for any reachable-but-forbidden portal route: a "You don't have access to this" screen with a way back. Wire via guards/route validation so an authenticated user hitting a role-forbidden route gets this, never a blank screen or silent redirect.
- [ ] **Portal `<md` sheet** (AC: #5, UX-DR39) — verify the existing `Shell` Sheet behavior (`shell.tsx:38-43`) remains usable once items are role-scoped; staff on a mobile browser must reach every permitted admin surface.
- [ ] **Portal tests** — role→sections mapping, permission-denied on forbidden route, sheet still opens for staff `<md`.

### Shared / CI

- [ ] `pnpm --filter @evergreen/mobile run lint|typecheck|build` and `pnpm --filter @evergreen/admin run lint|typecheck|build` green (same bar as prior stories).

## Dev Notes

### Current mobile navigation state

- `apps/mobile/src/app/_layout.tsx` is the single nav source of truth: a **stable** `Stack` tree with `Stack.Protected` guards that flip by `status`/`role` (`_layout.tsx:42-62`). Do not conditionally render different navigator trees by swapping identity (splash-freeze bug, Story 1.6).
- `useAuth()` (`apps/mobile/src/lib/auth.tsx`) exposes `status`, `user` (MeResponse), `signIn`, `signOut`, `sessionEndReason`. Role = `user.role`.
- `apps/mobile/src/app/home.tsx` is the placeholder home ("Role-based navigation is coming soon.") — replaced per role by this story. Splash = `apps/mobile/src/app/index.tsx`.
- expo-router `~57.0.12` (package.json:36). A `(tabs)` group renders the native `Tabs` navigator; verify the idiomatic expo-router 57 way to nest tabs under the existing guarded Stack.

### Current portal navigation state (now has auth — Story 1.14 done)

- `apps/admin` has full auth on develop: `src/lib/auth.tsx` (AuthProvider/useAuth → `user.role`), `src/lib/api.ts` (httpOnly-cookie refresh, in-memory access token), routes `login.tsx` + `protected-layout.tsx`.
- `protected-layout.tsx` wraps every child in `Shell` + a guard: no auth → `<Navigate to="/login">`. `routeTree = rootRoute → [protectedLayoutRoute → [indexRoute], loginRoute]` (router.ts:8-11).
- `shell.tsx` already implements UX-DR39: `md` icon-only rail, `lg` expanded sidebar, `<md` Sheet from the top bar. **This stays**; Story 1.10 only makes the sidebar items role-scoped.
- `sidebar-nav.tsx` is currently 100% static and `disabled` (Dashboard/Care homes/Users/Residents/Content/Events/Menu) pointing at future portal sections — this is the component to make role-aware and routable.

### Critical risk #1 — the mobile "family has residents?" gate has no data source yet

- Family historically lands on `onboarding` (`_layout.tsx:60-62`). Story 1.8 (invite-code onboarding) and Epic 2 (linked residents) are still `backlog`. `MeResponse` (`auth.ts:21-28`) carries `role`/`homeId` but **not** linked residents.
- AC #1 says "log in as family → tab bar." But a family user with no linked resident contradicts UX-DR23 (route into invite-code onboarding, not a reachable "no residents" empty state). **Ask-first decision:** anchor family on the onboarding guard OR a real "has any linked resident" query. Do NOT fabricate data or render the resident-switcher (UX-DR9) prematurely.

### Critical risk #2 — keep navigation tree identity stable across role transitions

- One stable navigator on mobile, guards flip by `status`/`role`; declare the family `(tabs)` group and staff single-screen in the same tree with guards, not via top-level `if (role === ...)` (stuck-navigator risk, `_layout.tsx:42-48`).
- On role change (admin edits a user's role, Story 1.12; or user re-login as different role) the navigator must deterministically re-resolve to the new anchor.

### Portal: role → section mapping is a DESIGN decision, not an implementation detail

- Epics map roles to capabilities (FR47 super_admin homes, FR48 super_admin assign home admins, FR50 home admin manage users, FR52 staff upload, FR12 home admin roles). The sidebar must only expose sections the role can reach, so the mapping is a small product decision to bake in this story. Where a section's real screens don't exist yet, use empty-state scaffolds (UX-DR22) — never a blank/disabled dead-end if a role legitimately reaches it.
- super_admin has no `home_id` scope; admin/staff are home-scoped. Do not expose cross-home sections to admin/staff.

### UX constraints that constrain both surfaces

- `bottom-tab-bar` (UX-DR13, DESIGN.md:308) and `permission-denied` (UX-DR25): clear "You don't have access to this" + way back — never silent, never blank.
- Permission-denied exists on both surfaces (AC #4). On mobile the guards auto-redirect to the anchor; on the web portal a reachable-but-forbidden route needs the explicit permission-denied screen. Mirror the treatment on both.
- A11y floor (UX-DR36/37/38): no locked text sizes/truncated controls; portal keyboard nav/focus matches shadcn/ui defaults; sheet focus trapping already in `Sheet`. Cold-load/empty states on placeholder screens (UX-DR30/DR22).

### Roles

- `Role` enum: `"family" | "staff" | "admin" | "super_admin"` (`packages/shared-types/src/common.ts:23`).
- Mobile: family → bottom tab bar (AC #1); staff → single-screen, no tab bar (AC #2). Admin/super_admin have no dedicated mobile surface in this story (existing non-family `home` guard keeps them safe).
- Portal: staff/admin/super_admin → role-scoped sidebar (AC #3). family has no portal surface (portal is staff-and-above per EXPERIENCE.md journeys).

### Project Structure Notes

- Mobile new files under `apps/mobile/src/app/` (route groups) and `apps/mobile/src/components/ui/`. Portal under `apps/admin/src/components/layout/` (sidebar-nav) and `apps/admin/src/routes/`. Reuse existing `Shell`, `TopNav`, `SidebarNav`, `Sheet`, tabs infra.
- No schema, API, or `packages/shared-types` changes. Do not modify `apps/api` in this story.
- `@expo/vector-icons` (mobile) and `lucide-react` (portal) are already present for nav icons — no new icon dependency.

### Testing standards

- Mobile: family (with/without residents) → correct tab group; staff → single-screen no tab bar; role transition re-resolves anchor; tab order/labels Home/Photos/Events/Menu/News.
- Portal: role→sections mapping per role; forbidden route → permission-denied (not blank/silent); `<md` Sheet opens and shows scoped items for staff.
- `pnpm --filter @evergreen/mobile run lint|typecheck|build` and `pnpm --filter @evergreen/admin run lint|typecheck|build` pass.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.10] — acceptance criteria (role-based navigation)
- [Source: _bmad-output/planning-artifacts/epics.md#FR10] — role-based navigation requirement
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-evergreen-2026-07-01/DESIGN.md:308] — `bottom-tab-bar` spec
- [Source: DESIGN.md:312] — `empty-state` spec
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-evergreen-2026-07-01/EXPERIENCE.md] — portal journeys (staff/admin/super admin); per-screen empty-state copy
- [Source: epics.md UX#UX-DR13, UX-DR14, UX-DR25, UX-DR9, UX-DR22, UX-DR23, UX-DR30, UX-DR36, UX-DR37, UX-DR38, UX-DR39] — navigation, sidebar, permission-denied, resident-switcher, empty-state, cold-load, a11y, responsive constraints
- [Source: packages/shared-types/src/common.ts:23] — `Role` enum
- [Source: packages/shared-types/src/auth.ts:21-28] — `MeResponse`
- [Source: apps/mobile/src/app/_layout.tsx:42-62] — stable Stack tree + role guards (splash-freeze precedent)
- [Source: apps/mobile/src/lib/auth.tsx] — mobile role source
- [Source: apps/admin/src/lib/auth.tsx, apps/admin/src/lib/api.ts] — portal auth (Story 1.14)
- [Source: apps/admin/src/routes/protected-layout.tsx, apps/admin/src/router.ts] — portal guard + route tree
- [Source: apps/admin/src/components/layout/shell.tsx, sidebar-nav.tsx, top-nav.tsx] — portal shell + static sidebar to make role-aware
- [Source: issue #25] — original issue
- [Source: PR #22 (Story 1.14, merged)] — portal auth foundation this story builds on

## Dev Agent Record

### Agent Model Used

(TBD at implementation)

### Debug Log References

(TBD — expected: mobile `lint`/`typecheck`/`build`, admin `lint`/`typecheck`/`build`; manual role-by-role navigation check on device and portal; permission-denied check)

### Completion Notes List

- Story redacted mobile-only on 2026-08-26 based on a stale local git state, then corrected to full mobile + portal scope after the user flagged that PR #22 was merged (verified against GitHub: `2d8fba2` is an ancestor of `origin/develop`; `apps/admin/src/lib/auth.tsx` + `login.tsx`/`protected-layout.tsx` present). Confirmed the mobile "family has residents?" gate as the highest-risk ask-first decision.

### File List

**New (anticipated):**
- `apps/mobile/src/components/ui/tab-bar.tsx`
- `apps/mobile/src/app/(tabs)/` route group (index/photos/events/menu/news placeholders)
- `apps/mobile` staff single-screen route
- `apps/admin` permission-denied screen + any role-scoped nav route file(s)

**Modified (anticipated):**
- `apps/mobile/src/app/_layout.tsx` (role-based guards: family → tabs, staff/non-family → single screen)
- `apps/admin/src/components/layout/sidebar-nav.tsx` (role-scoped, routable sections)
- `apps/admin/src/router.ts` (add permission-denied route if needed)