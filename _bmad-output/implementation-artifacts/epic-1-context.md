# Epic 1 Context: Cuentas, Homes y Acceso

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 1 is the foundational epic: there is no self-service registration, so every account is created top-down through a strict role hierarchy (`super_admin` → `home_admin` → `staff`/`family`). It covers login, password reset, session refresh/expiry and logout; super admins creating/managing care homes and assigning home admins (and other super admins); home admins/staff inviting staff and family members by email; family invite-code onboarding; self-profile editing; role-based navigation; and home admins managing their home's users and roles. It also carries the technical foundation everything else depends on: the monorepo/shared-types scaffold, JWT auth, RBAC, and multi-tenant data isolation. No other epic's module can be built safely until this epic's `home_id` scoping and RBAC exist.

## Stories

- Story 1.1: Scaffold del proyecto y fundación multi-tenant
- Story 1.2: Super admin crea y gestiona care homes
- Story 1.3: Super admin asigna home admins a un care home
- Story 1.4: Super admin crea super admins adicionales
- Story 1.5: Home admin/staff invita nuevos usuarios (staff o family) por email
- Story 1.6: Login, refresh automático de token y resolución de splash screen
- Story 1.7: Reset de contraseña y activación de cuenta invitada vía link de email
- Story 1.8: Onboarding — familia se une a un care home vía código de invitación
- Story 1.9: Ver y editar el propio perfil
- Story 1.10: Navegación basada en rol tras login
- Story 1.11: Logout y manejo de expiración de sesión
- Story 1.12: Home admins gestionan usuarios y roles de su home

## Requirements & Constraints

- Baseline auth: login, logout, automatic token refresh, and a splash screen resolving to login / onboarding / role-appropriate home screen. Tokens live only in the platform keychain; login/reset endpoints are rate-limited.
- One one-time-link mechanism serves both "forgot password" and "activate my invited account"; links expire in 1 hour and are single-use.
- Users view/edit their own name and email; duplicate-email conflicts surface inline.
- Navigation is role-scoped (family tab bar / staff photo-only flow / admin sidebar); a route the role doesn't permit shows a clear permission-denied state, enforced server-side regardless of client state.
- Super admins create/edit care homes (name, address, timezone); duplicate names get an inline conflict error with no partial record, and a new home is immediately usable platform-wide with no manual DB work, code change, or downtime.
- Super admins assign home admins and create additional super admins via the same pending-account + email-activation flow.
- Home admins/staff invite staff or family by email, strictly downward in the hierarchy. Non-family roles are strictly single-home; family accounts can span multiple homes (re-inviting an existing family user adds a membership, not a duplicate account).
- Family onboarding resolves an invite code and sets a password in one step; an invalid/used code gives an inline field-level error with no crash or redirect.
- Home admins see every user in their home with role/activation status and can change roles within the hierarchy; role changes and access revocation take effect on the user's next request, not just cosmetically.
- API responses complete within 200ms p95 under normal load; supports up to 2,000 concurrent users with no degradation. Every endpoint enforces `home_id` scoping. Invite/reset emails retry on transient failure (60s → 5min → 30min).

## Technical Decisions

- **Multi-tenant isolation is defense-in-depth:** request-scoped `home_id` context → Prisma Client Extension auto-injects it into every query (never hand-written) → Postgres RLS with `FORCE ROW LEVEL SECURITY` → composite indexes leading with `home_id`. `staff`/`admin`/`super_admin` carry a fixed `home_id` in the JWT; `family` has none — resolved per-request from an `X-Active-Home-Id` header validated against membership rows, so multi-home families switch without re-authenticating. Legitimate cross-home super-admin reads use a narrow, audit-logged `@BypassTenantScope()` decorator, never a global toggle.
- **RBAC is first-class:** `User.role` is a Prisma enum (`family|staff|admin|super_admin`); every protected endpoint declares required roles via `@Roles(...)` enforced by one global `RolesGuard`, re-evaluated per request (revocation/role-change is live immediately, never cached).
- **Auth:** JWT access + refresh, refreshed transparently; `@nestjs/throttler` on login/reset; `PasswordResetToken` rows expire 1h and reject on reuse — same mechanism backs reset and invite activation.
- **Monorepo / contract:** pnpm workspaces (`apps/api` NestJS, `apps/admin` Vite/React, `apps/mobile` Expo, `packages/shared-types`); shared-types is the only place API types are declared, imported via `workspace:*`; CI validates real API responses against them.
- **Gated infra:** Prisma migrations against production run only via a controlled GitHub Actions step; production deploys require manual reviewer approval even after CI passes; `DATABASE_URL` uses Neon's pooled connection string. Resend is the transactional email provider with retry logic in app code. Sentry is wired across all three apps from day one. Env vars validate at boot, fail-fast.
- **Data model:** `Home` (name, address, timezone); `User` (email, `role` enum, `home_id` — empty only for `super_admin`); a home-membership join for family users' multi-home access; `PasswordResetToken`. Conventions: UUID v4 IDs, ISO 8601 UTC dates, `snake_case` DB columns / `camelCase` API JSON, `{ error: { code, message, details? } }` error envelope, `{ data, meta: { page, pageSize, total } }` list pagination.

## UX & Interaction Patterns

- Permission-denied is a first-class state: a clear "you don't have access" message plus a way back — never a blank screen or generic error. Session expiry redirects to login with an explicit message ("Your session ended. Please log in again.") — never silent — and no stale queued write-action executes after re-auth without explicit re-confirmation.
- The login screen's greeting uses the hero typography style (reserved for rare, hero-scale moments only). Forms use the standard form-input component with inline validation on blur (not per keystroke) and a 44pt/48dp minimum touch target.
- Role-based nav: family gets the mobile bottom-tab-bar (Home, Photos, Events, Menu, News); staff-on-mobile gets only the single-screen photo-upload flow; staff/home-admin/super-admin on web get a persistent sidebar, collapsing to a sheet from a top bar below `md` width — staff's primary day-to-day path into the portal, not an edge case.
- Invalid/used invite codes produce an inline field-level error ("That invite code isn't valid — check with the home for a new one"), no redirect or crash.
- A family with 2+ linked residents gets a resident switcher (pill row for 2–3, dropdown for 4+); with exactly one resident it never renders. A family with no residents linked is routed into the invite-code step, not a reachable empty state.
- Voice and tone is warm and plain-language throughout ("Your session ended..." not "Token expired (401)."), consistent across family, staff, and admin surfaces.

## Cross-Story Dependencies

- Story 1.1 (scaffold, multi-tenant foundation, RBAC) blocks every other story in this epic and every other epic.
- Stories 1.3, 1.4, and 1.5 (invites) all create pending accounts that Story 1.7 (email-link activation) resolves into active ones.
- Story 1.8 (family onboarding) depends on the pending family account created by Story 1.5.
- Epic 1 as a whole is a hard prerequisite for Epics 2–8, which all scope their data through the `home_id`/RBAC foundation and account model built here.
