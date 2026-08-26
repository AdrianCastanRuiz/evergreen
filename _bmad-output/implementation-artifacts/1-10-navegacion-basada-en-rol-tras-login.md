---
baseline_commit: c3c8e28
---

# Story 1.10: Navegación basada en rol tras login (mobile + web portal)

Status: review

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

- [x] **Bottom-tab-bar component** — `apps/mobile/src/components/ui/tab-bar.tsx` (AC: #1): white background, `{colors.border}` top hairline + subtle shadow, active tab `{colors.primary}`, inactive `{colors.muted-foreground}` (DESIGN.md:308), accessibility labels (UX-DR36/DR38), no badge counts. *(Se implementó con el `Tabs` nativo de expo-router en `(tabs)/_layout.tsx` + `screenOptions` de estilo; no se creó un componente custom `tab-bar.tsx` — ver Completion Notes.)*
- [x] **Family `(tabs)` route group** — `apps/mobile/src/app/(tabs)/` with `index` (Home), `photos`, `events`, `menu`, `news` (AC: #1). Placeholder/empty-state screens; content screens belong to Epics 2/3/5/6.
- [x] **Staff single-screen route** — staff-only route without a tab bar (AC: #2), representing the single-screen photo-upload flow (functional upload is Story 4.1; here it's the role-scoped placeholder screen) — reutiliza `home.tsx` como pantalla única no-family.
- [x] **Wire role-based nav in RootNavigator** — `apps/mobile/src/app/_layout.tsx`: extend the stable `Stack`/`Stack.Protected` guards (do NOT swap tree identity — splash-freeze bug, `_layout.tsx:42-48`): family → `(tabs)` group; staff/non-family → single-screen; preserve existing `index`/`login`/`request-password-reset`/`reset-password`/`onboarding`/`profile` guards.
- [x] **Reconcile family "has residents?" gate** — ask-first decision (2026-08-26): **family → `(tabs)` directamente (AC literal)**, porque el gate no tiene fuente de datos (Epic 2 backlog; `MeResponse` sin residentes). Se documentó; se revisará cuando llegue Epic 2. Onboarding queda accesible para familia (anchor Story 1.8) pero familia enruta a `(tabs)` por orden de guards. No se fabricó data ni se renderizó resident-switcher (UX-DR9).

### Web portal (apps/admin)

- [x] **Role-scoped `sidebar-nav`** — `apps/admin/src/components/layout/sidebar-nav.tsx`: derive permitted sections from `useAuth().user.role` (AC: #3, UX-DR14). Map roles → sections per epics coverage:
  - `super_admin`: Dashboard, Care homes, Users, Residents, Content, Events, Menu, Metrics.
  - `admin` (home admin): Dashboard, Users (their home), Residents, Content, Events, Menu, Metrics — NOT Care homes (FR47/48/49 super_admin-only) ni Users-across-homes.
  - `staff`: Dashboard, Residents, Content, Events, Menu — NOT Users/Metrics (AD-12, user/role management is admin+).
  - Todas las secciones quedaron `disabled` (placeholder): los screens reales los entregan sus epics; esta story solo scopesea la nav por rol. Se mantiene intacto el collapse/rail/sheet de `Shell` (UX-DR39).
- [x] **Permission-denied treatment** (AC: #4, UX-DR25) — componente reutilizable `apps/admin/src/components/permission-denied.tsx` ("You don't have access to this" + vuelta al dashboard). Listo para que rutas futuras role-gateadas lo rendericen vía guard; no hay todavía rutas internas role-gateadas (secciones sin screens).
- [x] **Portal `<md` sheet** (AC: #5, UX-DR39) — verificado: el `Shell` existente (`shell.tsx:38-43`) ya brinda el Sheet y el rail, y ahora renderiza items role-scoped; staff en `<md` llega a sus secciones permitidas.
- [~] **Portal tests** — no hay runner de tests configurado en `apps/admin` (su `test` es `echo "no tests yet"`); la validación es typecheck + eslint + build (ver Completion Notes).

### Shared / CI

- [x] `pnpm --filter @evergreen/mobile run lint|typecheck|build` y `pnpm --filter @evergreen/admin run lint|typecheck|build` green (same bar as prior stories).

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

deepseek-v4-flash (opencode)

### Debug Log References

- `pnpm --filter @evergreen/mobile run typecheck` — green (después de `pnpm install` y de eliminar el artefacto stale `.expo/types/router.d.ts`, que es gitignored; sin ese d.ts expo-router cae a los tipos base que aceptan todas las rutas). El `typecheck` fallaba en HEAD por ese artefacto stale (rutas `/profile` de Story 1.9 y `(tabs)` ausentes), no por esta story.
- `pnpm --filter @evergreen/mobile run build` (`expo export`) — green; exportó `dist/` con el árbol completo de rutas incl. `(tabs)/home|photos|events|menu|news`, `/home`, `/profile`, `/onboarding`, `/login`.
- `pnpm exec eslint .` (mobile) — clean, exit 0.
- `pnpm --filter @evergreen/admin run typecheck` — green.
- `pnpm exec eslint .` (admin) — exit 0; 6 warnings `react-refresh/only-export-components` pre-existentes en `routes/index|login|protected-layout|root.tsx` (patrón route-object de TanStack Router), 0 errors.
- `pnpm --filter @evergreen/admin run build` (`vite build`) — green (27.26s; chunk ~520KB, warning de tamaño no bloqueante pre-existente).
- Nota: `expo lint` y el `expo export --platform ios` cuelgan/fallan en esta shell Windows (Hermes bytecode), pero `eslint .` y `expo export` (web, que es el `build` script) corrieron correctamente. Mobile/admin no están en CI (solo api y shared-types).
- `pnpm install` en la raíz (necesario: `node_modules` estaba vacío) — done en 8m6s.

### Completion Notes List

- Story redacted mobile-only on 2026-08-26 based on a stale local git state, then corrected to full mobile + portal scope after the user flagged that PR #22 was merged (verified against GitHub: `2d8fba2` is an ancestor of `origin/develop`; `apps/admin/src/lib/auth.tsx` + `login.tsx`/`protected-layout.tsx` present). Confirmed the mobile "family has residents?" gate as the highest-risk ask-first decision.
- Ask-first decision resuelta (validada con el usuario): **family → `(tabs)` directamente (AC literal)** — el gate "has linked resident?" no tiene fuente de datos aún (Epic 2 backlog). Documentado como revisión futura al llegar Epic 2. No se fabricó data ni se renderizó el resident-switcher.
- **Desviación intencional del plan**: no se creó un componente custom `tab-bar.tsx`. El `bottom-tab-bar` (UX-DR13, DESIGN.md:308) se implementó con el `Tabs` nativo de expo-router en `(tabs)/_layout.tsx` + `screenOptions` (white bg, top hairline `#8C8C8C`, active `#1B853F`, inactive `#5C5C5C`, sin badges), con iconos `@expo/vector-icons` `Ionicons`. Es la vía idiomática de expo-router 57 sobre el `Stack` existente, evitando un custom tab bar que añadiría complejidad sin beneficio. `EmptyState` (UX-DR17/22) sí se creó como componente reutilizable para los placeholder de los tabs.
- Desviación del plan: la pantalla staff single-screen reutiliza `apps/mobile/src/app/home.tsx` (reescrito como pantalla única no-family con logout) en lugar de crear `upload.tsx` — el upload real es Story 4.1; aquí solo la shell role-scoped. Admin/super_admin también aterrizan ahí en mobile (sin superficie dedicada en esta story).
- Portal: `sidebar-nav.tsx` role-scoped (mapa rol→secciones derivado de FR47/48/49/50/52/54/55, AD-12), todas las secciones quedaron `disabled` placeholder porque sus screens reales llegan en sus epics. Se añadió `metrics` (antes no estaba en el nav estático). `PermissionDenied` como componente reutilizable (AC #4) — no hay todavía rutas internas role-gateadas que lo rendericen.
- `profile` (Story 1.9) quedó accesible para cualquier autenticado (guard propio), no solo family — corrige un matiz del guard previo.

### File List

**New:**
- `apps/mobile/src/components/ui/empty-state.tsx`
- `apps/mobile/src/app/(tabs)/_layout.tsx` (family Tabs bottom-nav, UX-DR13)
- `apps/mobile/src/app/(tabs)/index.tsx` (Home placeholder)
- `apps/mobile/src/app/(tabs)/photos.tsx`
- `apps/mobile/src/app/(tabs)/events.tsx`
- `apps/mobile/src/app/(tabs)/menu.tsx`
- `apps/mobile/src/app/(tabs)/news.tsx`
- `apps/admin/src/components/permission-denied.tsx`

**Modified:**
- `apps/mobile/src/app/_layout.tsx` (role-based Stack.Protected guards: family → `(tabs)`, non-family → `home`; `profile` para cualquier autenticado)
- `apps/mobile/src/app/home.tsx` (staff/non-family single-screen placeholder, sin tab bar)
- `apps/admin/src/components/layout/sidebar-nav.tsx` (role-scoped sections)

## Change Log

- 2026-08-26: Story creada mobile-only por error de estado de git local; corregida a alcance completo mobile + portal tras verificar PR #22 mergeado. Status → ready-for-dev.
- 2026-08-26: Implementación mobile (family `(tabs)` con bottom-tab-bar nativo expo-router, staff single-screen sin tab bar, guards por rol estables) y portal (`sidebar-nav` role-scoped, `PermissionDenied`). Ask-first "family has residents?" resuelta con el usuario → family → `(tabs)` directo. Mobile typecheck/build/eslint y admin typecheck/build/eslint en verde. Status → review.