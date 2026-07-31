---
stepsCompleted:
  - step-01-init
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - source: "prd.md"
    type: prd
    path: "_bmad-output/planning-artifacts/prd.md"
  - source: "ARCHITECTURE-SPINE.md"
    type: architecture
    path: "_bmad-output/planning-artifacts/architecture/architecture-evergreen-2026-07-02/ARCHITECTURE-SPINE.md"
  - source: "DESIGN.md"
    type: ux-design
    path: "_bmad-output/planning-artifacts/ux-designs/ux-evergreen-2026-07-01/DESIGN.md"
  - source: "EXPERIENCE.md"
    type: ux-experience
    path: "_bmad-output/planning-artifacts/ux-designs/ux-evergreen-2026-07-01/EXPERIENCE.md"
---

# Evergreen - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Evergreen, decomposing the requirements from the PRD, UX Design Spine (DESIGN.md + EXPERIENCE.md), and Architecture Spine into implementable stories.

## Requirements Inventory

### Functional Requirements

**Authentication & Onboarding**
FR1: ~~Users can register via email and password~~ — **[CORRECTED 2026-07-09]** No self-service registration exists. Account creation is strictly hierarchical: a user with a higher role (`super_admin` → `home_admin` → `staff`/`family`) creates the pending account for a role below it (see FR11, FR48). The invited user activates that pending account by setting their password via a one-time token — for family, this happens inline during the invite-code onboarding step (FR5); for staff/home admin, via a direct email link to a set-password screen (reusing the same token/set-password mechanism as FR3's password reset).
FR2: Users can log in with email and password
FR3: Users can reset their password via email link
FR4: Users can view and edit their own profile (name, email)
FR5: Users can join a care home via invite code during onboarding
FR6: Users can authenticate with automatic token refresh
FR7: The app detects expired tokens and redirects to login with a message explaining the session expired
FR8: The app shows a splash screen that resolves to the correct screen based on auth state
FR9: Users can log out, clearing local session
FR10: Users see role-based navigation (family vs staff vs admin) after login
FR11: Admins can invite new users to their care home via email
FR12: Home admins can view and manage user roles within their care home

**Home Content Management**
FR13: Family members can view news posts for their care home
FR14: Family members can view documents/PDFs for their care home
FR15: Family members can view weekly menus for their care home
FR16: Family members can view schedules for their care home
FR17: Family members can view notices for their care home
FR18: Family members can view static info pages (visiting rules, contact details)
FR19: Family members can view announcements for their care home

**Residents & Family Mapping**
FR20: Family members can view a list of residents linked to them
FR21: Family members can view a resident's profile (name, photo, room, DOB)
FR22: Admins can create and manage resident profiles per care home
FR23: Admins can link family member accounts to specific residents

**Photo Sharing**
FR24: Staff can upload photos tagged to a resident with a caption
FR25: Family members can view a gallery of photos for their linked resident
FR26: Family members can view photos in full-screen with swipe navigation
FR27: Uploads are queued for retry on connection failure

**Events & Outings**
FR28: Family members can view upcoming events for their care home
FR29: Family members can view events in list or calendar format
FR30: Family members can view event details (title, date, time, location, description, capacity)
FR31: Family members can sign up a linked resident for an event
FR32: Family members can view their registrations
FR33: Family members can cancel a registration
FR34: Admins can create, edit, and delete events
FR35: Admins can view attendee lists per event
FR36: Admins can export event registrations as CSV

**Meal Ordering**
FR37: Family members can view the weekly menu with day tabs and meal options
FR38: Family members can select meals for a linked resident
FR39: Family members can view current week's orders
FR40: Family members can modify or cancel a meal order
FR41: Staff can view meal orders by day
FR42: Staff can export meal orders as CSV

**Push Notifications**
FR43: Family members receive push notification when a new photo of their resident is uploaded
FR44: Family members receive push confirmation when they sign up for an event
FR45: Users receive push reminder the day before an event they registered for
FR46: Users receive push notification if an event or meal is cancelled

**Admin & Staff Management**
FR47: Super admins can create and manage care homes
FR48: Super admins can assign home admins to a care home
FR49: Super admins can create additional super admins
FR50: Home admins can manage users for their care home
FR51: Home admins can manage content (news, menus, schedules, notices) for their home
FR52: Staff can upload photos for any resident within their care home
FR53: Staff can create and manage events for their care home

**Analytics & Dashboard**
FR54: Super admins can view platform-level metrics (active users, content counts per home)
FR55: Home admins can view home-level metrics (event sign-ups, photo uploads, family activity)

### NonFunctional Requirements

**Performance**
NFR1: Mobile screens load content in under 2 seconds on a good network connection (4G+)
NFR2: API responses complete in under 200ms for 95th percentile under normal load
NFR3: Photo gallery thumbnails load in under 1 second via server-side compression
NFR4: Push notifications are delivered within 30 seconds of trigger event

**Security**
NFR5: All data in transit is encrypted via TLS 1.2+
NFR6: All photo and document storage is encrypted at rest
NFR7: API endpoints enforce home_id scoping — no user can access data from another home
NFR8: Authentication tokens are stored securely on device (platform keychain)
NFR9: Password reset links expire within 1 hour of request
NFR10: API rate limits prevent abuse of auth endpoints (login, password reset)

**Scalability**
NFR11: Adding new care homes requires no code changes or downtime — super admin creates via UI
NFR12: The system handles up to 2,000 concurrent users across all homes with no performance degradation
NFR13: Photo storage design supports up to 50,000 photos before requiring archival or performance review

**Integration**
NFR14: Push notification delivery via FCM (Android) and APNs (iOS) with delivery status tracking
NFR15: Email delivery for password resets and user invites retries on transient failure (3 retries: 60s → 5min → 30min)
NFR16: CSV exports complete within 10 seconds for up to 5,000 rows

### Additional Requirements

- No starter template is specified in Architecture; Epic 1 Story 1 must scaffold the pnpm workspace monorepo from scratch (`apps/api`, `apps/admin`, `apps/mobile`, `packages/shared-types`) per AD-2.
- Monorepo with single API-contract source of truth: `packages/shared-types` is the only place API request/response types are defined; CI validates API responses against these types (AD-2).
- Multi-tenant isolation infra: auth middleware resolves `home_id` into `AsyncLocalStorage` request-scoped context — `staff`/`admin`/`super_admin` from the JWT, `family` from the `X-Active-Home-Id` header (AD-1); a Prisma Client Extension auto-injects `home_id` into every query; every tenant-scoped table has Postgres RLS with `FORCE ROW LEVEL SECURITY` and a composite index leading with `home_id` (AD-1).
- `@BypassTenantScope()` decorator (narrow, per-endpoint, audit-logged) for legitimate cross-home super_admin operations (AD-1).
- JWT access + refresh tokens stored in platform keychain; `@nestjs/throttler` rate-limits login/password-reset; `PasswordResetToken` with 1-hour expiry, rejected if used or expired (AD-8).
- Cloudinary signed-upload flow: client requests a signed upload from the API and uploads the binary directly to Cloudinary (never proxied); Postgres stores only `cloudinary_public_id` + metadata, never a pre-built transform URL (AD-4).
- Photo pipeline resilience: client compresses to max 1920px/~300KB before upload; failed uploads retry 30s → 2min → 5min, stop after 3 attempts; 10MB max file size enforced client + API; photos older than 12 months archive to cold storage (AD-9).
- Push notification device-token schema `(user_id, device_token, platform, home_id)`; every dispatch query filters by `home_id`; `InvalidRegistration` marks a token dead, re-registered on next app launch; every send recorded with delivery status (`sent | failed | dead_token`) (AD-10).
- Typed push payload shape `{ type, entityId, route }` for reliable client-side deep-linking (AD-10).
- `FamilyResidentGuard` checks a `FAMILY_LINK` row exists for `(user_id, resident_id)` on every family-facing endpoint that takes a `residentId` (AD-11).
- `RolesGuard` + `@Roles(...)` decorator enforced globally; `User.role` is a Prisma enum (`family | staff | admin | super_admin`), never a free string (AD-12).
- API evolution is additive-only; breaking changes ship as a new versioned route prefix (`/v2/...`); mobile client sends its build number in a request header, logged (never rejected on) by the API (AD-13).
- Resend transactional email integration for password reset (FR3) and user invites (FR11), with 3-retry backoff (60s → 5min → 30min) wrapping the Resend call (AD-14).
- Sentry across `apps/api`, `apps/admin`, `apps/mobile` (error tracking + basic performance monitoring); a Cloudinary/Render billing alert fires at $50/month (AD-15).
- TanStack Query on both `apps/mobile` and `apps/admin`, with a persisted cache (`AsyncStorage`-backed query persister) on mobile so a screen navigated to while online renders from cache when the network drops (AD-16).
- Neon pooled (PgBouncer-compatible) connection string for `DATABASE_URL`; Prisma `connection_limit` tuned per Render instance to stay under Neon's pooled ceiling (AD-17).
- Prisma migrations against production execute only as a controlled GitHub Actions CI/CD step on merge to `main` — never ad hoc from a developer machine (AD-6).
- GitHub Environments `production` environment requires a manual reviewer approval before the deploy step runs, even after CI passes (AD-7).
- Generic `ContentItem` table (`home_id`, `type` enum, `title`, `body`, `attachment_url`, `published_at`, `created_by`) backs news/documents/schedules/notices/static-pages/announcements; weekly menus are explicitly served by the `meals` module instead, not `ContentItem` (AD-5).
- Deployment environments: Local (Neon personal branch / local Postgres), PR (ephemeral Neon branch, CI-created/destroyed, tests only), Staging (persistent Neon `staging` branch, Render staging auto-deploy, EAS `preview` channel), Production (Neon production branch, Render production gated by AD-7, EAS `production` channel + store submission).

### UX Design Requirements

**Design tokens & shared system**
UX-DR1: Implement the shared design-token system (colors, typography, radii, spacing) in both the web Tailwind config and the RN NativeWind config, so a single token value edit updates both surfaces identically.

**Reusable components (18)**
UX-DR2: `button-primary` — primary fill, darken-only hover/press, `rounded.sm`, one per screen.
UX-DR3: `button-secondary` — secondary fill for affirmative-but-not-primary actions.
UX-DR4: `button-outline` — transparent fill, primary border/text, for tertiary/cancel-adjacent actions.
UX-DR5: `card` — base content container (white bg, border hairline, `rounded.md`, card padding).
UX-DR6: `featured-card` — white-border-on-solid-green pattern; max one per screen.
UX-DR7: `gallery-tile` — 3-column grid tile, `rounded.DEFAULT`, muted placeholder while loading, opens full-screen viewer on tap.
UX-DR8: `resident-profile-card` — photo + name + room + DOB, primary accent bar.
UX-DR9: `resident-switcher` — pill row (2–3 residents) with visible scroll-cue peek, or dropdown (4+); only rendered when 2+ residents linked; selection persists across app foreground/background within a session and re-scopes Home/Photos/Events/Menu with a skeleton reload.
UX-DR10: `event-list-item` — date badge + title + time/location; three states (not-registered / registered / fully-booked).
UX-DR11: `event-calendar-cell` — accent dot for "has event," primary ring for "today," 44pt(iOS)/48dp(Android) minimum touch target, never shrunk below floor to fit 7 columns.
UX-DR12: `meal-row` — Mon–Sun day tabs + selectable meal-option rows, one-tap submission, destructive-styled inline "Cancel order" text action.
UX-DR13: `bottom-tab-bar` (mobile) — persistent family/staff bottom nav, no badge counts.
UX-DR14: `sidebar-nav` (web, `md`+) — persistent left nav, collapses to icon-only rail at `md`, to a sheet below `md`.
UX-DR15: `top-nav` — screen/header title bar; houses the unmodified Evergreen logo lockup on the portal desktop header.
UX-DR16: `form-input` — focus ring on primary, inline validation on blur (not per-keystroke), 44pt/48dp minimum touch target.
UX-DR17: `empty-state` — icon/illustration + section-title headline + one line of body copy + at most one primary action.
UX-DR18: `toast-banner` — info (accent-blue) / success (primary) / error (destructive) variants.
UX-DR19: `upload-item` — persistent per-photo queue row state (uploading / retry), distinct from and complementary to `toast-banner`'s one-time escalation notice.

**Reuse / composition**
UX-DR20: News & Documents rows reuse `event-list-item`/`card` shape (title + meta, no date badge) — no dedicated component.

**Photo viewer interaction**
UX-DR21: Full-screen photo viewer: swipe left/right between photos AND an equivalent tap-based prev/next affordance (never swipe-only); pinch-to-zoom; swipe-down or tap-close returns to the grid at the same scroll position.

**Empty / state coverage (per-screen copy)**
UX-DR22: Implement all named empty-state copy variants: "No photos yet — check back soon" (Photos, no action), "No events scheduled right now" (Events, no action), "Nothing posted yet" (News, no action), "No residents yet" + "Add a resident" action (Residents, home admin), "No events yet" + "Create an event" action (Events, staff/home admin), and the generic "No [x] yet" (+ optional one primary action) pattern for content/users/homes/home-admin-assignment/meal-orders.
UX-DR23: "No residents linked" (family, pre-onboarding) routes into invite-code onboarding rather than rendering as a reachable empty state post-onboarding.
UX-DR24: Invalid/expired invite code shows an inline field-level error ("That invite code isn't valid — check with the home for a new one") with no app-level redirect or crash.
UX-DR25: Permission-denied screen (role-gated or home-scoped access violation) on both surfaces: clear "You don't have access to this" message + a way back — never a silent failure or blank screen.
UX-DR26: Offline state: persistent `toast-banner` info variant ("You're offline — showing saved content"); cached content stays visible/interactive for reading; write actions (sign up, upload, submit order) are disabled or queued, never silently failing.
UX-DR27: Session-expired: redirect to login with explanatory message ("Your session ended. Please log in again.") — never a silent redirect (FR7).
UX-DR28: Form validation errors render inline, field-level, in destructive-colored text — never full-screen/modal for simple validation.
UX-DR29: Event-at-capacity: "Fully booked" disabled sign-up state (family) rather than hidden; admin sees the same capacity count on the attendee list.
UX-DR30: Cold-load skeleton states (matching expected layout, e.g. 3 gallery-tile / 3 event-list-item placeholders) on every list/gallery screen on both surfaces.

**Interaction primitives**
UX-DR31: Pull-to-refresh on every mobile list screen (photos, events, menu, news).
UX-DR32: One-tap actions (event sign-up, meal order submission, photo upload confirmation) with no intermediate confirmation dialog — success confirmed via toast instead.
UX-DR33: Deep linking: a push notification (new photo, event reminder, cancellation) opens the app directly to the relevant detail screen, not the app's home screen.
UX-DR34: CSV export (web portal only): single click/tap triggers a browser download with no configuration step (event attendees, meal orders).
UX-DR35: Native OS camera/gallery picker (Expo image picker) for photo upload — no custom in-app camera UI.

**Accessibility floor**
UX-DR36: Respect OS-level system font-size / Dynamic Type (iOS) / font scaling (Android) throughout the mobile app — no locked text sizes, no truncated controls at larger accessibility sizes.
UX-DR37: Web portal keyboard navigation + focus order matches shadcn/ui defaults; opening a modal or the mobile nav sheet traps focus within it, and closing it returns focus to the triggering element.
UX-DR38: No color-only signaling anywhere: RSVP state, upload status, validation errors, and the calendar "has event" dot always pair color with text/label.

**Responsive behavior**
UX-DR39: Web portal responsive behavior at three breakpoints — desktop `lg` (expanded sidebar, multi-column dashboard, full table columns), tablet `md` (icon-only sidebar rail, fewer dashboard columns, horizontally-scrolling tables), staff mobile browser `<md` (sidebar as a sheet from a top bar, single-column, every admin surface usable — this is staff's primary day-to-day entry point, not an edge case).
UX-DR40: Cross-platform parity: family/staff mobile screens are functionally identical on iOS and Android — no iOS-only or Android-only feature gaps in V1.

### FR Coverage Map

FR1: Epic 1 - [CORRECTED] Superseded by FR5 (family invite-code activation) + FR11 (hierarchical account creation) — no self-registration
FR2: Epic 1 - Log in with email/password
FR3: Epic 1 - Password reset via email link
FR4: Epic 1 - View/edit own profile
FR5: Epic 1 - Join a care home via invite code
FR6: Epic 1 - Automatic token refresh
FR7: Epic 1 - Expired-token detection + redirect to login
FR8: Epic 1 - Splash screen resolves by auth state
FR9: Epic 1 - Log out, clear local session
FR10: Epic 1 - Role-based navigation after login
FR11: Epic 1 - Admins invite new users via email
FR12: Epic 1 - Home admins view/manage user roles
FR13: Epic 3 - View news posts
FR14: Epic 3 - View documents/PDFs
FR15: Epic 6 - View weekly menus (served by meals module per AD-5)
FR16: Epic 3 - View schedules
FR17: Epic 3 - View notices
FR18: Epic 3 - View static info pages
FR19: Epic 3 - View announcements
FR20: Epic 2 - View list of linked residents
FR21: Epic 2 - View a resident's profile
FR22: Epic 2 - Admins create/manage resident profiles
FR23: Epic 2 - Admins link family accounts to residents
FR24: Epic 4 - Staff upload photo tagged to a resident
FR25: Epic 4 - Family views photo gallery
FR26: Epic 4 - Full-screen photo view with swipe
FR27: Epic 4 - Uploads queued for retry on failure
FR28: Epic 5 - View upcoming events
FR29: Epic 5 - View events in list or calendar format
FR30: Epic 5 - View event details
FR31: Epic 5 - Sign up a resident for an event
FR32: Epic 5 - View own registrations
FR33: Epic 5 - Cancel a registration
FR34: Epic 5 - Admins create/edit/delete events
FR35: Epic 5 - Admins view attendee lists
FR36: Epic 5 - Admins export event registrations as CSV
FR37: Epic 6 - View weekly menu with day tabs and options
FR38: Epic 6 - Select meals for a linked resident
FR39: Epic 6 - View current week's orders
FR40: Epic 6 - Modify or cancel a meal order
FR41: Epic 6 - Staff view meal orders by day
FR42: Epic 6 - Staff export meal orders as CSV
FR43: Epic 7 - Push on new photo of linked resident
FR44: Epic 7 - Push confirmation on event sign-up
FR45: Epic 7 - Push reminder day before event
FR46: Epic 7 - Push notification on cancellation
FR47: Epic 1 - Super admins create/manage care homes
FR48: Epic 1 - Super admins assign home admins
FR49: Epic 1 - Super admins create additional super admins
FR50: Epic 1 - Home admins manage users for their home
FR51: Epic 3 - Home admins manage content (news/documents/schedules/notices); [SPLIT] menu-creation portion → Epic 6 Story 6.1 (AD-5: menus live in `meals` module, not `ContentItem`)
FR52: Epic 4 - Staff upload photos for any resident in their home
FR53: Epic 5 - Staff create/manage events
FR54: Epic 8 - Super admins view platform-level metrics
FR55: Epic 8 - Home admins view home-level metrics

## Epic List

### Epic 1: Cuentas, Homes y Acceso
No existe auto-registro: la alta de cuentas es estrictamente jerárquica (`super_admin` → `home_admin` → `staff`/`family`). Los usuarios inician sesión, recuperan su contraseña y gestionan su perfil; los super admins crean care homes y asignan home admins; los home admins/staff invitan a los roles inferiores por email; el onboarding con código de invitación resuelve a la familia dentro del home/residente correcto, fijando su contraseña en el mismo paso. Épica fundacional: incluye el scaffold del monorepo (pnpm workspaces, `packages/shared-types`), JWT + refresh tokens en keychain, RBAC como enum de Prisma + `RolesGuard` global, aislamiento multi-tenant (`AsyncLocalStorage` + Prisma Client Extension + RLS forzado), rate limiting en auth, y migraciones vía CI/CD únicamente.
**FRs covered:** ~~FR1~~ (corregido — ver Requirements Inventory), FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR47, FR48, FR49, FR50

### Epic 2: Residentes y Vínculo Familiar
Los admins crean y gestionan perfiles de residentes por care home y vinculan cuentas familiares a residentes específicos; las familias ven la lista de residentes vinculados y su perfil (foto, habitación, fecha de nacimiento). Incluye el `FamilyResidentGuard` que valida el vínculo `FAMILY_LINK` en cada endpoint family-facing con `residentId`.
**FRs covered:** FR20, FR21, FR22, FR23

### Epic 3: Gestión de Contenido del Home
Las familias ven noticias, documentos, horarios, avisos, páginas estáticas y anuncios de su care home; el staff/home admin gestiona ese mismo contenido desde el portal. Se apoya en la tabla genérica `ContentItem` (enum `type`) — los menús semanales quedan explícitamente fuera de esta épica (ver Epic 6).
**FRs covered:** FR13, FR14, FR16, FR17, FR18, FR19, FR51

### Epic 4: Fotos
El staff sube fotos etiquetadas a un residente con caption, con compresión cliente y cola de reintento ante fallos de conexión; las familias ven la galería de fotos de su residente vinculado y las abren en visor a pantalla completa con navegación por swipe. Incluye el flujo de subida firmada a Cloudinary (el binario nunca pasa por la API) y la política de archivado en frío a los 12 meses.
**FRs covered:** FR24, FR25, FR26, FR27, FR52

### Epic 5: Eventos y Salidas
Las familias ven próximos eventos (lista o calendario), se inscriben o cancelan la inscripción de un residente vinculado, y ven sus propias inscripciones; el staff/admin crea, edita y elimina eventos, ve la lista de asistentes y exporta el registro como CSV.
**FRs covered:** FR28, FR29, FR30, FR31, FR32, FR33, FR34, FR35, FR36, FR53

### Epic 6: Pedidos de Comida
Las familias ven el menú semanal por pestañas de día, seleccionan comidas para un residente vinculado, ven los pedidos de la semana actual y los modifican o cancelan; el staff ve los pedidos por día y los exporta como CSV. FR15 (ver menú semanal) vive aquí, no en Epic 3, por decisión de arquitectura (AD-5: una sola fuente de verdad para el menú).
**FRs covered:** FR15, FR37, FR38, FR39, FR40, FR41, FR42

### Epic 7: Notificaciones Push
Las familias reciben notificación push cuando se sube una foto nueva de su residente vinculado, al confirmar una inscripción a un evento, un recordatorio el día previo a un evento registrado, y aviso si un evento o pedido de comida se cancela. Se engancha sobre los flujos ya construidos en Fotos, Eventos y Comidas — incluye el esquema de device tokens, detección de tokens muertos, y el payload tipado `{ type, entityId, route }` para deep-linking.
**FRs covered:** FR43, FR44, FR45, FR46

### Epic 8: Analytics y Dashboard
Los super admins ven métricas a nivel plataforma (usuarios activos, conteos de contenido por home); los home admins ven métricas a nivel de su home (inscripciones a eventos, subidas de fotos, actividad familiar) — calculadas por agregación sobre los datos ya generados por las épicas anteriores, sin un event-store dedicado en V1.
**FRs covered:** FR54, FR55

## Epic 1: Cuentas, Homes y Acceso

No existe auto-registro: la alta de cuentas es estrictamente jerárquica (`super_admin` → `home_admin` → `staff`/`family`). Los usuarios inician sesión, recuperan su contraseña y gestionan su perfil; los super admins crean care homes y asignan home admins; los home admins/staff invitan a los roles inferiores por email; el onboarding con código de invitación resuelve a la familia dentro del home/residente correcto, fijando su contraseña en el mismo paso.

### Story 1.1: Scaffold del proyecto y fundación multi-tenant

As a development team,
I want the monorepo, shared types package, and multi-tenant data-access foundation scaffolded,
So that every subsequent user-facing story can be built on a secure, consistent, deployable base.

**Acceptance Criteria:**

**Given** a fresh repository
**When** the scaffold is complete
**Then** a pnpm workspace exists with `apps/api` (NestJS), `apps/admin` (Vite + React), `apps/mobile` (Expo), and `packages/shared-types`, each installable via a single `pnpm install` at the root (AD-2)

**Given** `packages/shared-types`
**When** any app imports an API request/response type
**Then** it imports via the `workspace:*` protocol and no app declares its own duplicate copy (AD-2)
**And** CI validates the API's actual responses against these shared types

**Given** the Prisma schema
**When** a tenant-scoped table is created
**Then** it carries a `home_id` column, a composite index leading with `home_id`, and Postgres Row-Level Security enabled with `FORCE ROW LEVEL SECURITY` (AD-1)

**Given** an authenticated request
**When** it reaches any Service
**Then** the request's `home_id` is available via `AsyncLocalStorage`-backed request-scoped context and a Prisma Client Extension auto-injects it into every query — no developer writes the filter by hand (AD-1)

**Given** `DATABASE_URL`
**When** the API connects to Postgres
**Then** it uses Neon's pooled (PgBouncer-compatible) connection string, not the direct one (AD-17)

**Given** a merge to `main`
**When** CI/CD runs
**Then** Prisma migrations execute only as a controlled GitHub Actions step — never ad hoc from a developer machine (AD-6)

**Given** a production deploy
**When** CI passes
**Then** the GitHub Environments `production` environment requires manual reviewer approval before the deploy step runs (AD-7)

**Given** the API boots
**When** a required environment variable is missing or invalid
**Then** the process fails fast at boot rather than running partially configured

**Given** any of the three apps
**When** an unhandled error occurs
**Then** it is captured by Sentry, tagged with the originating app (AD-15)

### Story 1.2: Super admin crea y gestiona care homes

As a super admin,
I want to create and manage care homes on the platform,
So that a new care home group can be onboarded without any code change or downtime.

**Acceptance Criteria:**

**Given** I am logged in as a super admin
**When** I submit a new home's name, address, and timezone
**Then** a new `Home` record is created and immediately available for admin assignment (FR47, NFR11)

**Given** I submit a home name that already exists
**When** I attempt to create it
**Then** an inline validation error identifies the conflict
**And** no duplicate or partial home record is created

**Given** a home has been created
**When** I view the homes list
**Then** I can edit its name, address, or timezone

**Given** I am not a super admin
**When** I attempt to access home creation or management
**Then** I receive the permission-denied treatment (UX-DR25) and the request is rejected server-side regardless of client-side state (AD-12, NFR7)

**Given** a home is created
**When** any other module (residents, content, events, meals) later scopes data to it
**Then** that home's `home_id` is usable immediately with no manual database work

### Story 1.3: Super admin asigna home admins a un care home

As a super admin,
I want to assign a home admin to a care home by inviting them via email,
So that each home has someone who can manage its residents, content, events, and users.

**Acceptance Criteria:**

**Given** I am a super admin viewing a home
**When** I enter an email address and select the "home admin" role
**Then** a pending `User` record is created with role `admin`, scoped to that home, with no password set (FR48)

**Given** a pending home admin account is created
**When** the invite is sent
**Then** it is delivered via Resend with a one-time activation link
**And** delivery retries on transient failure per NFR15 (60s → 5min → 30min)

**Given** the invited email already has an account in the system
**When** I attempt to invite it again for the same home
**Then** I see an inline error rather than a duplicate account being created

**Given** I am not a super admin
**When** I attempt to assign a home admin
**Then** the request is rejected server-side (AD-12)

*(Account activation itself — opening the link and setting a password — is covered by Story 1.7, which this story's invite feeds into.)*

### Story 1.4: Super admin crea super admins adicionales

As a super admin,
I want to create additional super admin accounts,
So that platform-level administration isn't a single point of failure.

**Acceptance Criteria:**

**Given** I am a super admin
**When** I enter an email and select "super admin" role
**Then** a pending `User` record is created with role `super_admin` and no `home_id` scope
**And** an activation email is sent via the same mechanism as Story 1.3 (FR49)

**Given** I am not a super admin
**When** I attempt to create a super admin account
**Then** the request is rejected server-side — the highest-privilege role is never creatable by a lower role (AD-12)

*(Account activation is covered by Story 1.7; role-based navigation after login is covered by Story 1.10 — both apply to this role without this story needing to re-test them.)*

### Story 1.5: Home admin/staff invita nuevos usuarios (staff o family) por email

As a home admin (or staff, where permitted),
I want to invite a new staff or family member to my care home by email,
So that new users can join without any self-service registration path existing.

**Acceptance Criteria:**

**Given** I am a home admin
**When** I enter an email and select "staff" role for a new user
**Then** a pending `User` record is created with role `staff` and a single `HOME_MEMBERSHIP` scoped to my home
**And** an activation email is sent (same mechanism as Story 1.3/1.7) (FR11)

**Given** I attempt to invite an existing staff or admin user from another home
**When** I submit the invite
**Then** the request is rejected — non-family roles are strictly single-home (AD-1, AD-18)

**Given** I am a home admin or staff with the appropriate permission
**When** I enter a family member's email not yet in the system
**Then** a pending `User` record is created with role `family` and a new `HOME_MEMBERSHIP` scoped to my home — this is the pending account Story 1.8's invite-code onboarding later resolves

**Given** the invited email already belongs to an existing family user in a different home
**When** I attempt to invite it to my home
**Then** a new `HOME_MEMBERSHIP` is created for the existing user scoped to my home, no duplicate `User` record is created, and the existing user gains access to both homes (AD-18)
**And** an activation notification is sent for the new home (same mechanism as Story 1.3/1.7)

**Given** I attempt to invite a user at or above my own role level (e.g. staff inviting a home admin)
**When** I submit the invite
**Then** the request is rejected server-side — invitation is strictly downward in the hierarchy (`super_admin` → `home_admin` → `staff`/`family`) (AD-12)

**Given** an invite is sent
**When** delivery fails transiently
**Then** it retries per NFR15 (60s → 5min → 30min) via Resend (AD-14)

### Story 1.6: Login, refresh automático de token y resolución de splash screen

As a registered user (any role),
I want to log in with my email and password and stay signed in without re-entering credentials,
So that I can use the app without friction across sessions.

**Acceptance Criteria:**

**Given** valid credentials
**When** I submit the login form
**Then** I receive a JWT access token and refresh token
**And** both are stored in the platform keychain, never in plain storage (FR2, NFR8, AD-8)

**Given** invalid credentials
**When** I submit the login form
**Then** I see an inline error and no token is issued

**Given** repeated failed login attempts
**When** I exceed the configured rate limit
**Then** further attempts are throttled by `@nestjs/throttler` (NFR10, AD-8)

**Given** a valid refresh token
**When** my access token expires during normal use
**Then** it is refreshed automatically and transparently, with no interruption to my current screen (FR6)

**Given** the app launches
**When** it resolves my auth state
**Then** a splash screen is shown until resolution completes, then I land on: login (no session), onboarding (family with no linked resident yet), or my role-appropriate home screen (FR8)

**Given** the login screen
**When** it renders
**Then** it uses `{typography.hero}` for the greeting per DESIGN.md

### Story 1.7: Reset de contraseña y activación de cuenta invitada vía link de email

As a user who forgot my password, or an invited staff/home admin/super admin,
I want to set my password via a one-time emailed link,
So that I can regain or activate access to my account securely.

**Acceptance Criteria:**

**Given** I request a password reset with my email
**When** the request is submitted
**Then** a `PasswordResetToken` row is created with `expires_at` set 1 hour out
**And** an email is sent via Resend (FR3, NFR9, AD-8, AD-14)

**Given** a password reset or activation link
**When** I open it after `expires_at` has passed
**Then** I see a clear "this link has expired" message and can request a new one — the token is rejected at consumption time (NFR9, AD-8)

**Given** a valid, unexpired token
**When** I set a new password
**Then** the token is marked used and cannot be consumed again

**Given** a used token
**When** someone attempts to reuse the same link
**Then** it is rejected (AD-8)

**Given** an invited staff or home admin account (Story 1.3, 1.5)
**When** they open their activation link and set a password
**Then** their account transitions from pending to active and they can log in (FR2)

**Given** email delivery fails transiently
**When** Resend reports a transient failure
**Then** the send retries at 60s → 5min → 30min before giving up (NFR15)

### Story 1.8: Onboarding — familia se une a un care home vía código de invitación

As a family member who received an invite from a care home,
I want to enter my invite code in the app and set my password,
So that I can see my resident's photos, events, menu, and news.

**Acceptance Criteria:**

**Given** I install the app with no session
**When** I land on onboarding
**Then** I am prompted to enter an invite code (FR5)

**Given** I enter a valid, unused invite code
**When** I submit it
**Then** my pending family account (created via Story 1.5's invite) is resolved
**And** I set my password
**And** I land on the Home screen scoped to my linked resident

**Given** I enter an invalid or already-used invite code
**When** I submit it
**Then** I see an inline, field-level error ("That invite code isn't valid — check with the home for a new one")
**And** there is no app-level redirect or crash
**And** I remain on the same onboarding screen to re-enter a code (UX-DR24)

**Given** my account links to more than one resident
**When** onboarding completes
**Then** the resident switcher becomes available on Home/Photos/Events/Menu (UX-DR9)
**And**, given I link to exactly one resident, the switcher never renders

**Given** onboarding is not yet complete
**When** I have no residents linked
**Then** I am routed into this invite-code step rather than a reachable empty "no residents" state elsewhere in the app (UX-DR23)

### Story 1.9: Ver y editar el propio perfil

As a logged-in user (any role),
I want to view and edit my own profile (name, email),
So that my account information stays accurate.

**Acceptance Criteria:**

**Given** I am logged in
**When** I open my profile screen
**Then** I see my current name and email (FR4)

**Given** I edit my name
**When** I save
**Then** the change is persisted and reflected immediately on the profile screen

**Given** I edit my email
**When** I save
**Then** the change is validated as well-formed and persisted
**And** a duplicate-email conflict shows an inline error rather than a generic failure

**Given** the profile form
**When** it renders
**Then** it uses `{components.form-input}` with inline validation on blur, not on every keystroke (UX-DR16)

### Story 1.10: Navegación basada en rol tras login

As a logged-in user,
I want to see navigation appropriate to my role,
So that I only encounter screens relevant to what I can actually do.

**Acceptance Criteria:**

**Given** I log in as family
**When** navigation renders
**Then** I see the mobile bottom-tab-bar with Home, Photos, Events, Menu, News (FR10)

**Given** I log in as staff on mobile
**When** navigation renders
**Then** I see only the single-screen photo-upload flow, no tab bar

**Given** I log in as staff, home admin, or super admin on the web portal
**When** navigation renders
**Then** I see the `sidebar-nav` scoped to my role's permitted sections (UX-DR14)

**Given** I am authenticated but attempt to reach a route my role doesn't permit
**When** the route loads
**Then** I see the permission-denied message with a way back — never a silent failure or blank screen (UX-DR25, AD-12)

**Given** the web portal at `<md` width
**When** I am staff viewing the portal from a personal mobile browser
**Then** the sidebar becomes a sheet triggered from a top bar and every admin surface I have access to remains usable (UX-DR39)

### Story 1.11: Logout y manejo de expiración de sesión

As a logged-in user,
I want to log out deliberately, and be clearly notified if my session expires,
So that I understand my authentication state at all times.

**Acceptance Criteria:**

**Given** I am logged in
**When** I select "Log out"
**Then** my local session (tokens in keychain) is cleared and I am returned to the login screen (FR9)

**Given** my refresh token is invalid or expired
**When** the app attempts to refresh it
**Then** I am redirected to login with the message "Your session ended. Please log in again." — never a silent redirect (FR7, UX-DR27)

**Given** I am redirected due to session expiry
**When** I land on login
**Then** no stale queued write-action executes after re-authentication without my explicit re-confirmation

### Story 1.12: Home admins gestionan usuarios y roles de su home

As a home admin,
I want to view and manage the users within my care home,
So that I can keep access accurate as staff and family membership changes.

**Acceptance Criteria:**

**Given** I am a home admin
**When** I view my home's user list
**Then** I see every user (staff and family) scoped to my `home_id`, with their current role and activation status (pending/active) (FR12, FR50)

**Given** I select a user
**When** I change their role (e.g. family → staff, where the hierarchy permits)
**Then** the change is persisted and takes effect on their next request — the `RolesGuard` re-evaluates per-request, not cached (AD-12)

**Given** I attempt to view or manage users outside my `home_id`
**When** the request is made
**Then** it is rejected server-side regardless of any client-side manipulation (NFR7, AD-1)

**Given** I am staff, not a home admin
**When** I attempt to change a user's role
**Then** the request is rejected — role management is a home-admin-and-above capability (AD-12)

**Given** I remove a user's access
**When** the change is saved
**Then** their existing session's next request is rejected by the `RolesGuard`/tenant scoping — access revocation is not merely cosmetic in the user list

## Epic 2: Residentes y Vínculo Familiar

Los admins crean y gestionan perfiles de residentes por care home y vinculan cuentas familiares a residentes específicos; las familias ven la lista de residentes vinculados y su perfil (foto, habitación, fecha de nacimiento).

### Story 2.1: Admins crean y gestionan perfiles de residentes por care home

As a home admin,
I want to create and manage resident profiles for my care home,
So that families and staff have accurate resident information to work from.

**Acceptance Criteria:**

**Given** I am a home admin
**When** I submit a resident's name, room, photo, and DOB
**Then** a new `Resident` record is created scoped to my `home_id` (FR22)

**Given** a resident profile exists
**When** I edit their name, room, photo, or DOB
**Then** the changes are persisted and reflected immediately wherever the resident is displayed

**Given** no residents exist yet in my home
**When** I view the Residents screen
**Then** I see the empty state "No residents yet" with a primary "Add a resident" action (UX-DR22)

**Given** I attempt to create or edit a resident outside my `home_id`
**When** the request is made
**Then** it is rejected server-side (NFR7, AD-1)

**Given** I am family or staff, not a home admin
**When** I attempt to create or edit a resident profile
**Then** the request is rejected — resident profile management is a home-admin capability (AD-12)

### Story 2.2: Admins vinculan cuentas familiares a residentes específicos

As a home admin,
I want to link a family member's account to a specific resident,
So that they can see photos, events, and menu information for their loved one.

**Acceptance Criteria:**

**Given** I am inviting a new family member (Story 1.5)
**When** I select a resident to link during that invite
**Then** a `FAMILY_LINK` row is created for `(pending_user, resident_id)` once the account activates (FR23)

**Given** a family member's account is already active
**When** I link them to an additional resident (e.g. a second parent)
**Then** a new `FAMILY_LINK` row is created without disturbing their existing link(s)

**Given** a family account has 2+ linked residents
**When** they next open the app
**Then** the resident-switcher becomes available on Home/Photos/Events/Menu (UX-DR9)

**Given** I attempt to link a family account to a resident in a different home
**When** the request is made
**Then** it is rejected server-side (NFR7, AD-1)

**Given** I remove a `FAMILY_LINK`
**When** the change is saved
**Then** that family member immediately loses access to that resident's data on their next request — enforced by `FamilyResidentGuard`, not just hidden in the UI (AD-11)

### Story 2.3: Familia ve la lista de residentes vinculados

As a family member,
I want to see the list of residents linked to my account,
So that I know which of my loved ones I can follow in the app.

**Acceptance Criteria:**

**Given** I am logged in as family with one linked resident
**When** I open the app
**Then** my Home screen shows that resident's profile card with no switcher (FR20, UX-DR9)

**Given** I have 2+ linked residents
**When** I open the app
**Then** the resident-switcher renders as a pill row (2–3) or dropdown (4+), with a visible scroll-cue peek in the pill-row case (UX-DR9)

**Given** I switch the active resident via the switcher
**When** the switch completes
**Then** Home/Photos/Events/Menu re-scope to the newly selected resident with a brief skeleton reload
**And** the selection persists across app foreground/background within the session

**Given** I attempt to view a resident not linked to me
**When** the request is made
**Then** it is rejected server-side by `FamilyResidentGuard` (AD-11, NFR7)

### Story 2.4: Familia ve el perfil de un residente

As a family member,
I want to view my linked resident's profile,
So that I can see their photo, room, and basic information at a glance.

**Acceptance Criteria:**

**Given** I am viewing my Home screen
**When** the resident-profile-card renders
**Then** it shows the resident's photo, name, room, and DOB, with the primary-color accent bar (FR21, UX-DR8)

**Given** the resident's photo hasn't loaded yet
**When** the card is in a cold-load state
**Then** a skeleton placeholder matching the card's layout is shown until data arrives (UX-DR30)

**Given** I attempt to view a resident's profile I'm not linked to
**When** the request is made
**Then** it is rejected server-side by `FamilyResidentGuard` (AD-11)

## Epic 3: Gestión de Contenido del Home

Las familias ven noticias, documentos, horarios, avisos, páginas estáticas y anuncios de su care home; el staff/home admin gestiona ese mismo contenido desde el portal. Se apoya en la tabla genérica `ContentItem` (enum `type`) — los menús semanales quedan explícitamente fuera de esta épica (ver Epic 6).

### Story 3.1: Home admin/staff gestiona contenido del home

As a home admin (or staff, where permitted),
I want to create, edit, publish, and delete content items for my care home,
So that families always see accurate, up-to-date news, documents, schedules, notices, static pages, and announcements.

**Acceptance Criteria:**

**Given** I am a home admin
**When** I create a content item of type news, document, schedule, notice, static_page, or announcement with a title and body
**Then** a new `ContentItem` record is created scoped to my `home_id` with the given `type` enum value (FR51, AD-5)

**Given** a content item of type document
**When** I attach a file
**Then** `attachment_url` is populated and the file is retrievable by family members with access

**Given** I submit an invalid `type` not among the defined enum values
**When** I save
**Then** the request is rejected — `type` is a Prisma enum, never a free string; extending it requires a migration (AD-5)

**Given** a content item is in draft
**When** I publish it
**Then** `published_at` is set and it becomes immediately visible to family members on the corresponding tab

**Given** a published content item
**When** I edit it
**Then** the changes are reflected immediately without needing to re-publish

**Given** a content item
**When** I delete it
**Then** it is removed and immediately disappears from the family view

**Given** no content items exist yet of a given type
**When** I view that content editor tab
**Then** I see the empty state "No content yet" with a primary "Create the first [x]" action (UX-DR22)

**Given** I attempt to create or edit content outside my `home_id`
**When** the request is made
**Then** it is rejected server-side (NFR7, AD-1)

**Given** I am family, not staff or admin
**When** I attempt to access the content editor
**Then** the request is rejected (AD-12)

### Story 3.2: Familia ve el contenido publicado de su home

As a family member,
I want to view news, documents, schedules, notices, static pages, and announcements for my care home,
So that I stay informed without calling reception.

**Acceptance Criteria:**

**Given** published news posts exist for my home
**When** I open the News tab
**Then** I see them listed using the `event-list-item`/`card` row shape — title + meta, no date badge (FR13, UX-DR20)

**Given** published documents exist
**When** I open Documents
**Then** I see them listed the same way, and tapping one opens the attached file (FR14)

**Given** published schedules, notices, static pages, or announcements exist
**When** I navigate to the relevant screen
**Then** I see them rendered with the same reused row/card shape (FR16, FR17, FR18, FR19)

**Given** no content of a given type has been published yet
**When** I open that screen
**Then** I see the empty state "Nothing posted yet" (UX-DR22)

**Given** the screen is cold-loading
**When** data hasn't arrived yet
**Then** skeleton rows matching the expected layout are shown (UX-DR30)

**Given** I pull to refresh on any content list
**When** I release
**Then** the list re-fetches the latest published items (UX-DR31)

**Given** I attempt to view content from a different home
**When** the request is made
**Then** it is rejected server-side (NFR7, AD-1)

**Given** a content item is unpublished (draft) or deleted
**When** I view the relevant list
**Then** it never appears — only published items are visible to family

## Epic 4: Fotos

El staff sube fotos etiquetadas a un residente con caption, con compresión cliente y cola de reintento ante fallos de conexión; las familias ven la galería de fotos de su residente vinculado y las abren en visor a pantalla completa con navegación por swipe. Incluye el flujo de subida firmada a Cloudinary (el binario nunca pasa por la API) y la política de archivado en frío a los 12 meses.

### Story 4.1: Staff sube una foto etiquetada a un residente con caption

As a staff member,
I want to upload a photo tagged to a resident with a caption,
So that families can see their loved one's daily life without me emailing photos individually.

**Acceptance Criteria:**

**Given** I am staff
**When** I select a resident within my home and pick/take a photo via the native camera/gallery picker
**Then** I can add a caption before uploading (FR24, FR52, UX-DR35)

**Given** a photo is selected
**When** it's larger than the 1920px/~300KB compression target
**Then** the client compresses it before upload (AD-9)

**Given** a photo exceeds 10MB after compression
**When** I attempt to upload
**Then** it is rejected client-side and server-side with a clear message (AD-9)

**Given** I tap upload
**When** the request is sent
**Then** the API issues a signed upload credential and the client uploads the binary directly to Cloudinary — never proxied through the API (AD-4)

**Given** the upload succeeds
**When** Cloudinary confirms
**Then** only `cloudinary_public_id` + `home_id` + `resident_id` + `uploaded_by` + `caption` are stored in Postgres — never a pre-built transformation URL (AD-4)

**Given** a weak-WiFi upload failure
**When** the first attempt fails
**Then** it retries automatically at 30s → 2min → 5min, showing an inline "Uploading…" state on the `upload-item` row (FR27, AD-9, UX-DR19)

**Given** all 3 retry attempts are exhausted
**When** the final attempt fails
**Then** the `upload-item` shows a manual "Retry" affordance and a one-time `toast-banner` error variant surfaces ("We couldn't upload this photo — check your connection and try again") (UX-DR19)

**Given** a photo is retrying or failed
**When** I continue shooting/queuing other photos
**Then** I am never blocked from doing so (UX-DR19)

**Given** I attempt to upload a photo for a resident outside my home
**When** the request is made
**Then** it is rejected server-side (NFR7, AD-1)

**Given** a photo is 12+ months old
**When** the archival job runs
**Then** it moves to cold storage per AD-9's policy

### Story 4.2: Familia ve la galería de fotos de su residente vinculado

As a family member,
I want to view a gallery of photos of my linked resident,
So that I feel connected to their daily life.

**Acceptance Criteria:**

**Given** photos exist for my linked resident
**When** I open the Photos tab
**Then** I see them in a 3-column `gallery-tile` grid, most recent first (FR25, UX-DR7)

**Given** a tile hasn't loaded yet
**When** the gallery is cold-loading
**Then** a muted placeholder fill shows per tile until the image resolves, with skeleton tiles matching the expected layout (UX-DR7, UX-DR30)

**Given** no photos exist yet for my resident
**When** I open Photos
**Then** I see the empty state "No photos yet — check back soon" with no action button (FR25, UX-DR22)

**Given** I pull to refresh
**When** I release
**Then** the gallery re-fetches the latest photos (UX-DR31)

**Given** I'm offline
**When** I open Photos
**Then** cached photos remain visible with the offline info banner (UX-DR26)

**Given** I attempt to view photos of a resident not linked to me
**When** the request is made
**Then** it is rejected server-side by `FamilyResidentGuard` (AD-11)

**Given** I have 2+ linked residents
**When** I switch the active resident via the resident-switcher
**Then** the gallery re-scopes to the newly selected resident's photos (Epic 2, UX-DR9)

### Story 4.3: Familia abre una foto en visor a pantalla completa

As a family member,
I want to open a photo in full-screen and navigate between photos,
So that I can see the moment clearly and browse nearby photos naturally.

**Acceptance Criteria:**

**Given** I tap a gallery tile
**When** the full-screen viewer opens
**Then** it shows that photo full-screen (FR26)

**Given** the viewer is open
**When** I swipe left or right
**Then** I navigate to the adjacent photo (FR26, UX-DR21)

**Given** the viewer is open
**When** I tap the leading/trailing edge of the photo or a visible prev/next chevron
**Then** I navigate the same way as swiping — swipe is never the only way to navigate (UX-DR21)

**Given** a photo is open
**When** I pinch
**Then** it zooms in/out (UX-DR21)

**Given** the viewer is open
**When** I swipe down or tap close
**Then** I return to the grid at the same scroll position I left it at (UX-DR21)

**Given** I attempt to open a photo belonging to a resident not linked to me
**When** the request is made
**Then** it is rejected server-side (AD-11)

## Epic 5: Eventos y Salidas

Las familias ven próximos eventos (lista o calendario), se inscriben o cancelan la inscripción de un residente vinculado, y ven sus propias inscripciones; el staff/admin crea, edita y elimina eventos, ve la lista de asistentes y exporta el registro como CSV.

### Story 5.1: Admin/staff crea, edita y elimina eventos de su home

As a home admin (or staff, where permitted),
I want to create, edit, and delete events for my care home,
So that families can find out about and sign up for outings and activities.

**Acceptance Criteria:**

**Given** I am a home admin or staff
**When** I submit a title, date, time, location, description, and capacity
**Then** a new `Event` record is created scoped to my `home_id` (FR34, FR53)

**Given** an event exists
**When** I edit any of its fields
**Then** the changes are reflected immediately to family members viewing it

**Given** publishing an event fails (e.g. a network drop on submit)
**When** the failure occurs
**Then** the form retains my entered data and shows an inline error so I can retry without re-entering everything

**Given** an event exists with registrations
**When** I delete it
**Then** all registered family members' registrations are removed and a cancellation notification is triggered (Epic 7)

**Given** an event is at capacity and I raise the capacity or create a second session
**When** I save that change
**Then** the newly-freed slots or new event become immediately available for sign-up

**Given** I attempt to create, edit, or delete an event outside my `home_id`
**When** the request is made
**Then** it is rejected server-side (NFR7, AD-1)

**Given** I am family, not staff or admin
**When** I attempt to access event creation
**Then** the request is rejected (AD-12)

### Story 5.2: Familia ve próximos eventos (lista o calendario) y su detalle

As a family member,
I want to view upcoming events in a list or calendar, and see event details,
So that I can decide what to sign my resident up for.

**Acceptance Criteria:**

**Given** events exist for my home
**When** I open the Events tab
**Then** I see them in list view by default, using the `event-list-item` component with a date badge, title, and time/location (FR28, FR29, UX-DR10)

**Given** I toggle to calendar view
**When** it renders
**Then** each day cell shows an accent dot for "has event" and a ring for "today," with a minimum 44pt/48dp touch target per cell (FR29, UX-DR11)

**Given** I tap a day with an event dot in calendar view
**When** it opens
**Then** that day's event(s) show in a sheet (UX-DR11)

**Given** I tap an event
**When** the detail view opens
**Then** I see title, date, time, location, description, and capacity (FR30)

**Given** no events are scheduled
**When** I open Events
**Then** I see the empty state "No events scheduled right now" (UX-DR22)

**Given** the screen is cold-loading
**When** data hasn't arrived
**Then** skeleton `event-list-item` placeholders show (UX-DR30)

**Given** I pull to refresh
**When** I release
**Then** the list/calendar re-fetches the latest events (UX-DR31)

**Given** I tap a push notification about an event (reminder/cancellation)
**When** the app opens
**Then** it deep-links directly to that event's detail screen (UX-DR33)

### Story 5.3: Familia inscribe a un residente en un evento

As a family member,
I want to sign up my linked resident for an event with one tap,
So that I don't miss out on activities for them.

**Acceptance Criteria:**

**Given** an event has open capacity
**When** I tap "Sign up"
**Then** my resident is registered with no intermediate confirmation dialog, and a success toast confirms (FR31, UX-DR32)

**Given** an event is at capacity
**When** I view it
**Then** the sign-up button is replaced with a disabled "Fully booked" state rather than hidden (UX-DR29)

**Given** I have 2+ linked residents
**When** I sign up for an event
**Then** the sign-up applies to the currently active resident selected via the resident-switcher

**Given** the sign-up request fails (e.g. connection drop mid-tap)
**When** it fails
**Then** I see an inline error and my resident is not left in an ambiguous registered/unregistered state

**Given** I attempt to sign up a resident not linked to me
**When** the request is made
**Then** it is rejected server-side by `FamilyResidentGuard` (AD-11)

**Given** I sign up while offline
**When** connectivity is unavailable
**Then** the sign-up action is disabled or queued rather than silently failing (UX-DR26)

### Story 5.4: Familia ve sus inscripciones y cancela una

As a family member,
I want to view my registrations and cancel one if plans change,
So that I keep my resident's schedule accurate and free a slot for someone else.

**Acceptance Criteria:**

**Given** I have active registrations
**When** I view an event I'm registered for
**Then** it shows the "registered" state — badge "You're going" + secondary "Cancel" action (FR32, UX-DR10)

**Given** I tap "Cancel" on a registration
**When** the cancellation completes
**Then** the registration is removed and the event returns to the "not registered" state for that resident (FR33, UX-DR10)

**Given** an admin cancels an event or reduces capacity below my registration
**When** that happens
**Then** my registration is auto-removed and I see a banner notice on the event plus a push notification (UX-DR10)

**Given** I attempt to cancel a registration for a resident not linked to me
**When** the request is made
**Then** it is rejected server-side (AD-11)

### Story 5.5: Admin ve la lista de asistentes por evento y exporta CSV

As a home admin (or staff),
I want to view the attendee list for an event and export it as CSV,
So that I can plan capacity and hand off a clean list without manual tallying.

**Acceptance Criteria:**

**Given** an event has registrations
**When** I open its attendee list
**Then** I see every registered resident and the family member who registered them (FR35)

**Given** I click "Export CSV"
**When** the export runs
**Then** it streams the full result set (up to 5,000 rows) as a single-click browser download, completing within 10 seconds (FR36, NFR16, UX-DR34)

**Given** the attendee list is a report of existing data with no separate write action
**When** it renders
**Then** it displays as a standard portal table, not gated by any confirmation step

**Given** I attempt to view attendees or export CSV for an event outside my `home_id`
**When** the request is made
**Then** it is rejected server-side (NFR7, AD-1)

## Epic 6: Pedidos de Comida

Las familias ven el menú semanal por pestañas de día, seleccionan comidas para un residente vinculado, ven los pedidos de la semana actual y los modifican o cancelan; el staff ve los pedidos por día y los exporta como CSV. La porción "menús" de FR51 vive aquí (módulo `meals`), no en Epic 3, por decisión de arquitectura (AD-5: una sola fuente de verdad para el menú).

### Story 6.1: Home admin/staff crea y gestiona el menú semanal por día

As a home admin (or staff, where permitted),
I want to create and manage the weekly menu with meal options per day,
So that families can see and order from an accurate, up-to-date menu.

**Acceptance Criteria:**

**Given** I am a home admin
**When** I create a `MEAL_MENU_ITEM` for a given day with meal options
**Then** it is scoped to my `home_id` and becomes visible to family on that day's tab once published (AD-5)

**Given** a menu item exists
**When** I edit its options
**Then** the changes reflect immediately on the family-facing weekly menu view

**Given** no menu exists yet for the week
**When** staff/admin views the menu editor
**Then** they see the "No menu yet" empty state with a "Create this week's menu" primary action (UX-DR22)

**Given** I attempt to manage a menu outside my `home_id`
**When** the request is made
**Then** it is rejected server-side (NFR7, AD-1)

**Given** I am family, not staff or admin
**When** I attempt to access the menu editor
**Then** the request is rejected (AD-12)

### Story 6.2: Familia ve el menú semanal con pestañas de día

As a family member,
I want to view the weekly menu organized by day tabs,
So that I know what my resident can eat each day.

**Acceptance Criteria:**

**Given** a weekly menu exists
**When** I open the Menu tab
**Then** I see Mon–Sun day tabs, with today's tab active by default, each showing that day's meal options as `meal-row` items (FR15, FR37, UX-DR12)

**Given** a day has no menu published yet
**When** I view that tab
**Then** I see an appropriate empty state rather than a blank screen

**Given** I pull to refresh
**When** I release
**Then** the menu re-fetches the latest data (UX-DR31)

**Given** I have 2+ linked residents
**When** I switch the active resident
**Then** the Menu tab re-scopes to reflect that resident's own orders where applicable (Epic 2, UX-DR9)

**Given** I attempt to view a menu outside my home
**When** the request is made
**Then** it is rejected server-side (NFR7, AD-1)

### Story 6.3: Familia selecciona comidas para un residente vinculado

As a family member,
I want to select meals for my linked resident from the weekly menu,
So that their meal preferences are known ahead of time.

**Acceptance Criteria:**

**Given** a day's meal options are shown
**When** I select an option for my resident
**Then** the order submits with one tap — no multi-step wizard (FR38, UX-DR12)

**Given** the selection succeeds
**When** it is saved
**Then** a success toast confirms without an intermediate confirmation dialog (UX-DR32)

**Given** I attempt to order for a resident not linked to me
**When** the request is made
**Then** it is rejected server-side by `FamilyResidentGuard` (AD-11)

**Given** I am offline
**When** I attempt to submit an order
**Then** the action is disabled or queued rather than silently failing (UX-DR26)

### Story 6.4: Familia ve los pedidos de la semana actual y los modifica o cancela

As a family member,
I want to view my current week's meal orders and modify or cancel them,
So that I can adjust my resident's meal plan as things change.

**Acceptance Criteria:**

**Given** I have placed orders for the current week
**When** I view a day's meal row
**Then** it shows my existing selection pre-filled (FR39, UX-DR12)

**Given** I tap an already-ordered meal row
**When** it re-opens
**Then** I can change the selection, and saving updates the existing order rather than creating a duplicate (FR40)

**Given** I want to cancel an order
**When** I tap "Cancel order" — a destructive-styled text action, not a full button
**Then** the order is removed for that day/resident (FR40, UX-DR12)

**Given** I attempt to modify or cancel an order for a resident not linked to me
**When** the request is made
**Then** it is rejected server-side (AD-11)

### Story 6.5: Staff ve los pedidos por día y los exporta como CSV

As a staff member,
I want to view meal orders by day and export them as CSV,
So that I can hand the kitchen an accurate list without manual tallying.

**Acceptance Criteria:**

**Given** orders exist for a given day
**When** I view the meal orders screen
**Then** I see them grouped by day, listing resident and selected meal (FR41)

**Given** no orders exist yet for a day
**When** I view it
**Then** I see the "No meal orders yet" empty state with no action, matching the "No photos yet" report-view pattern (UX-DR22)

**Given** I click "Export CSV"
**When** the export runs
**Then** it streams the full result set as a single-click download, completing within 10 seconds for up to 5,000 rows (FR42, NFR16, UX-DR34)

**Given** I attempt to view or export orders outside my `home_id`
**When** the request is made
**Then** it is rejected server-side (NFR7, AD-1)

## Epic 7: Notificaciones Push

Las familias reciben notificación push cuando se sube una foto nueva de su residente vinculado, al confirmar una inscripción a un evento, un recordatorio el día previo a un evento registrado, y aviso si un evento o pedido de comida se cancela. Se engancha sobre los flujos ya construidos en Fotos, Eventos y Comidas.

### Story 7.1: Registro y ciclo de vida del device token

As a user (any role) of the mobile app,
I want my device to register for push notifications reliably,
So that I actually receive the notifications the platform sends me.

**Acceptance Criteria:**

**Given** I launch the app while logged in
**When** the app initializes
**Then** it registers a device token with the API, storing `(user_id, device_token, platform, home_id)` (AD-10)

**Given** I log in on a new device
**When** I authenticate
**Then** a new device token record is created for that device without removing tokens for my other devices

**Given** FCM/APNs returns `InvalidRegistration` for a token
**When** the API's next dispatch attempt reports it
**Then** that token is marked dead and excluded from future dispatch queries

**Given** a token was marked dead
**When** I next launch the app
**Then** it re-registers a fresh token automatically

**Given** a dispatch attempt is made
**When** it completes
**Then** the delivery status (`sent | failed | dead_token`) is recorded for staff-visible tracking (NFR14)

**Given** a device token query runs
**When** it dispatches
**Then** it always filters by `home_id` — no push reaches a device outside the resident's home (AD-10, NFR7)

### Story 7.2: Push cuando se sube una foto nueva del residente vinculado

As a family member,
I want to receive a push notification when a new photo of my linked resident is uploaded,
So that I find out about it right away without opening the app to check.

**Acceptance Criteria:**

**Given** staff uploads a photo of my linked resident (Epic 4, Story 4.1)
**When** the upload succeeds
**Then** all family members linked to that resident within the same home receive a push notification within 30 seconds (FR43, NFR4)

**Given** the push payload
**When** it is constructed
**Then** it carries the typed shape `{ type: 'photo', entityId: <photoId>, route }` (AD-10)

**Given** I tap the notification
**When** the app opens
**Then** it deep-links directly to that photo in the gallery, not the app's home screen (UX-DR33)

**Given** I have push notifications disabled in settings
**When** a photo is uploaded
**Then** I don't receive a push, but the photo still appears in-app

**Given** multiple family members are linked to the same resident
**When** the photo is uploaded
**Then** each linked family member's device tokens receive the notification independently

### Story 7.3: Push de confirmación al inscribirse a un evento

As a family member,
I want a push confirmation when I sign up for an event,
So that I have confidence the registration went through.

**Acceptance Criteria:**

**Given** I sign up my resident for an event (Epic 5, Story 5.3)
**When** the registration succeeds
**Then** I receive a push confirmation within 30 seconds (FR44, NFR4)

**Given** the push payload
**When** it is constructed
**Then** it carries `{ type: 'event_confirmation', entityId: <eventId>, route }` (AD-10)

**Given** I tap the notification
**When** the app opens
**Then** it deep-links to that event's detail screen (UX-DR33)

**Given** the sign-up happened while I was actively in the app
**When** the confirmation is shown
**Then** the in-app success toast (Story 5.3) confirms it in the moment — the push is a secondary confirmation, not the only one

### Story 7.4: Push recordatorio el día previo a un evento registrado

As a user (family or staff) registered for an event,
I want a reminder push the day before,
So that I don't forget or miss the event.

**Acceptance Criteria:**

**Given** I am registered for an event happening tomorrow
**When** the reminder job runs
**Then** I receive a push reminder within 30 seconds of the scheduled trigger time (FR45, NFR4)

**Given** the push payload
**When** it is constructed
**Then** it carries `{ type: 'event_reminder', entityId: <eventId>, route }` (AD-10)

**Given** I tap the notification
**When** the app opens
**Then** it deep-links to that event's detail screen (UX-DR33)

**Given** I cancelled my registration before the reminder job runs
**When** the job runs
**Then** I do not receive a reminder for that event

**Given** both family and staff are registered/assigned to an event
**When** the reminder fires
**Then** both roles receive it, per FR45's "Users" (not family-only) wording

### Story 7.5: Push cuando se cancela un evento o pedido de comida

As a user affected by a cancellation,
I want a push notification when an event or meal order I'm registered for is cancelled,
So that I know immediately and can make other plans.

**Acceptance Criteria:**

**Given** an admin deletes/cancels an event I'm registered for (Epic 5, Story 5.1)
**When** the cancellation is saved
**Then** I receive a push notification within 30 seconds (FR46, NFR4)

**Given** a meal order or menu item I depend on is cancelled/removed by staff/admin
**When** that happens
**Then** affected family members receive a push notification (FR46)

**Given** the push payload
**When** it is constructed
**Then** it carries `{ type: 'cancellation', entityId: <eventId|menuItemId>, route }` (AD-10)

**Given** I tap the notification
**When** the app opens
**Then** it deep-links to the affected event or menu screen (UX-DR33)

**Given** the cancellation dispatch runs
**When** it queries recipients
**Then** it filters by `home_id`, never notifying a user outside the affected home (AD-10, NFR7)

## Epic 8: Analytics y Dashboard

Los super admins ven métricas a nivel plataforma (usuarios activos, conteos de contenido por home); los home admins ven métricas a nivel de su home (inscripciones a eventos, subidas de fotos, actividad familiar) — calculadas por agregación sobre los datos ya generados por las épicas anteriores, sin un event-store dedicado en V1.

### Story 8.1: Super admin ve métricas a nivel plataforma

As a super admin,
I want to view platform-level metrics across all care homes,
So that I can see which homes are thriving and which need attention.

**Acceptance Criteria:**

**Given** I am a super admin
**When** I open the platform dashboard
**Then** I see aggregate metrics across all homes: total active family accounts this week, total photos uploaded, total events created, and content counts per home (FR54)

**Given** the aggregation query spans multiple homes
**When** it runs
**Then** it uses the narrow `@BypassTenantScope()` decorator and every use is audit-logged with the acting user's id (AD-1)

**Given** I drill into a specific home
**When** I select it
**Then** I see that home's own metrics as a concrete, actionable signal (e.g. its admin hasn't uploaded a photo in 3 weeks)

**Given** I am not a super admin
**When** I attempt to access the platform dashboard
**Then** the request is rejected server-side (AD-12)

**Given** the platform has 12+ homes
**When** metrics are computed
**Then** they are computed via aggregate queries over existing tables — no dedicated event-tracking store in V1

### Story 8.2: Home admin ve métricas a nivel de su home

As a home admin,
I want to view metrics for my own care home,
So that I understand family engagement and can act on gaps.

**Acceptance Criteria:**

**Given** I am a home admin
**When** I open my home dashboard
**Then** I see metrics scoped to my `home_id`: event sign-ups, photo uploads, and family activity (FR55)

**Given** I attempt to view metrics for a home other than my own
**When** the request is made
**Then** it is rejected server-side — no `@BypassTenantScope()` applies to a home admin (NFR7, AD-1)

**Given** no activity has occurred yet in my home
**When** I view the dashboard
**Then** the panels reflect a zero/empty state rather than an error

**Given** the dashboard renders on the web portal
**When** viewed at `lg`/`md`/`<md` breakpoints
**Then** panels render per UX-DR39's responsive behavior (multi-column at `lg`, fewer columns at `md`, single-column at `<md`)
