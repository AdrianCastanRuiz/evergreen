---
baseline_commit: 21dcae3
---

# Story 1.8: Onboarding — familia se une a un care home vía código de invitación

Status: review

<!-- Alcance: FULL-STACK (diferido del pre-plan mobile-only) decidido por ask-first el 2026-08-26:
el mecanismo de "código de invitación" NO existe en el backend (sin campo en schema, sin endpoint),
y Story 1.8 no puede resolver la cuenta family pendiente sin él. El usuario eligió construirlo en
esta story (backend + mobile) en vez de dejarlo como UI contra un contrato inexistente. -->

## Story

As a family member who received an invite from a care home,
I want to enter my invite code in the app and set my password,
so that my pending family account is resolved and I can see my resident's photos, events, menu, and news.

## Acceptance Criteria

1. **Given** I install the app with no session, **when** I land on onboarding, **then** I am prompted to enter an invite code (FR5).
2. **Given** I enter a valid, unused invite code, **when** I submit it with my new password, **then** my pending family account (created via Story 1.5's invite) is resolved, my password is set, the code is consumed once, **and** I land on the Home screen scoped to my linked resident.
3. **Given** I enter an invalid or already-used invite code, **when** I submit it, **then** I see an inline, field-level error ("That invite code isn't valid — check with the home for a new one"), **and** there is no app-level redirect or crash, **and** I remain on the same onboarding screen to re-enter a code (UX-DR24).
4. **Given** my account links to more than one resident, **when** onboarding completes, **then** the resident switcher becomes available on Home/Photos/Events/Menu (UX-DR9); given exactly one resident, the switcher never renders.
5. **Given** onboarding is not yet complete, **when** I have no residents linked, **then** I am routed into this invite-code step rather than a reachable empty "no residents" state elsewhere in the app (UX-DR23).

### Scope delimiters (ask-first decisions, 2026-08-26)

- **AC #4 (resident-switcher) y AC #5 (gate "no residents → invite-code") se DIFIEREN a Epic 2.** Dependen de datos de residentes vinculados (`FamilyLink` / `GET` de residentes) que no existen (Epic 2 backlog). Esta story NO renderiza resident-switcher, NO fabrica datos, NO construye el gate "has linked resident?". Family sigue enrutando a `(tabs)` directo (decisión Story 1.10) — el gate se revisará cuando llegue Epic 2. La AC #5 se cumple en la medida en que el onboarding es la puerta de entrada para un family sin residentes aún (no hay estado vacío "no residents" alcanzable).
- **Alcance backend construido en esta story**: hoy Story 1.5 activa la cuenta family pendiente vía email-link con token (mecanismo de Story 1.7), NO vía código de invitación. Esta story introduce el mecanismo de código de invitación (schema + generación en el invite + endpoint de resolución) y la UI mobile. Ver Dev Notes "Diseño del código de invitación".

## Tasks / Subtasks

### Backend — schema y migración

- [x] **Schema: campos de código de invitación en `HomeMembership`** (`apps/api/prisma/schema.prisma`, migración nueva) (AC: #2):
  - `inviteCodeHash String? @unique @map("invite_code_hash")`
  - `inviteCodeExpiresAt DateTime? @map("invite_code_expires_at")`
  - `inviteCodeUsedAt DateTime? @map("invite_code_used_at")`
  - Nulos por defecto → no rompe filas existentes (staff/admin/active-family memberships no llevan código). El `@unique` fuerza que un código no pueda reutilizarse entre memberships.
  - Migración vía `pnpm --filter @evergreen/api exec prisma migrate dev --name add_home_membership_invite_code` (misma convención que migraciones previas; el `@@map` hace el nombre de columna snake_case). NO añadir RLS nueva aquí: `home_memberships` ya tiene su política; el endpoint de resolución usa `@BypassTenantScope()` (ver Dev Notes RLS).

### Backend — `InviteCodeService` (nuevo, en `apps/api/src/auth/`)

- [x] **`InviteCodeService.generateForMembership(membershipId: string): Promise<string>`** (AC: #2) — genera el código crudo (única vez que existe en claro, fuera del email), calcula su hash, guarda `inviteCodeHash` + `inviteCodeExpiresAt` en el `HomeMembership` indicado y devuelve el código crudo para el email. Reutiliza `PasswordService.hash` para guardar el hash (documentado en Dev Notes "Hash del código").
- [x] **`InviteCodeService.resolveInviteCode(inviteCode: string, newPassword: string): Promise<void>`** (AC: #2, #3) — valida y resuelve:
  - Hash del código, `HomeMembership.findFirst({ where: { inviteCodeHash, inviteCodeUsedAt: null, inviteCodeExpiresAt: { gt: now } }, include: { user: true } })`. Si no hay match → `BadRequestException('That invite code isn\'t valid — check with the home for a new one')` (mismo mensaje para unknown/expired/used — sin oracle, UX-DR24, replica NFR9).
  - Validación defensiva: `membership.user.isActive === false` y `role === 'family'`; si no cumple (código de una membership ya activa, o rol no-family) → mismo `BadRequestException`. No debería ocurrir vía flujo normal pero no debe abrir un bypass.
  - Hash de la nueva password, luego en `$transaction`: **claim atómico** del código con `updateMany({ where: { id: membership.id, inviteCodeUsedAt: null, inviteCodeExpiresAt: { gt: now } }, data: { inviteCodeUsedAt: now } })` — si `count === 0` (concurrencia ya lo consumió) → `BadRequestException` (mismo patrón de `PasswordResetService.confirmReset`); luego `user.update({ passwordHash, isActive: true })`.
  - No devuelve token pair (frontera congelada, igual que `confirm-password-reset`).
- [x] **HTTP endpoint `POST /auth/onboarding/confirm`** en `AuthController` (AC: #2, #3):
  - `@Public()`, `@Throttle({ default: { limit: 10, ttl: 60_000 } })` (mismo límite que `confirm-password-reset`, NFR10), `@HttpCode(HttpStatus.OK)`, devuelve `{ success: true }`.
  - **`@BypassTenantScope()`** — este request es `@Public()` sin JWT, así que no hay tenant context y RLS bloquearía cualquier read/write en `home_memberships` (ver Dev Notes RLS).
  - Nuevo DTO `apps/api/src/auth/dto/confirm-onboarding.dto.ts`: `inviteCode` (string, trim, 1..64) + `newPassword` (mismas cotas que `ConfirmPasswordResetDto`: `@MinLength(8) @MaxLength(128) @Matches(/\S/)`).
- [x] **shared-types** (`packages/shared-types/src/auth.ts`, AD-2): `OnboardingConfirmRequest { inviteCode: string; newPassword: string }` y comentario de que responde `{ success: true }`.

### Backend — integrar generación en el invite de family (Story 1.5)

- [x] **`UsersService.inviteUser` — rama de family-nuevo (AC #3)** (`apps/api/src/users/users.service.ts`): tras crear el `User` pendiente + `HomeMembership` (con el rollback secuencial existente), generar el código con `InviteCodeService.generateForMembership(membership.id)` y enviar `MailService.sendFamilyInviteEmail(email, rawCode, homeName)` en vez de `issueActivationToken` + `sendAccountInviteEmail`.
  - Solo aplica a la rama de family NUEVO (isActive=false, sin password). La rama de family EXISTENTE activo ganando un segundo home (AC #4) se mantiene en `sendHomeAccessAddedEmail` (sin código: ya tiene password). Los invites de staff/admin (targetRole no-family) se mantienen en `issueActivationToken` + `sendAccountInviteEmail` (sin código). NO alterar el rol no-family — estrictamente single-home (AD-1/AD-18).
  - El rollback por fallo de writes/token debe extenderse para cubrir también el fallo del `InviteCodeService` (beta `rollbackHomeMembership` ya existe en Story 1.5).
- [x] **`MailService.sendFamilyInviteEmail(email, inviteCode, homeName)`** (`apps/api/src/notifications/mail.service.ts`) + `buildFamilyInviteHtml(inviteCode, homeName)` (AC: #2): copy nuevo que muestra el CÓDIGO en claro y dice que abra la app y lo ingrese (FR5). `homeName` por `escapeHtml` (precedente inyección, Story 1.3/1.5). Usa el plumbing `attemptSend`/retry compartido.

### Mobile — pantalla de onboarding

- [x] **Reescribir `apps/mobile/src/app/onboarding.tsx`** (AC: #1, #2, #3) como flujo real de código de invitación + set password:
  - Formulario de un paso: input de código de invitación + `PasswordInput` (nueva password) + `PasswordInput` (confirmar) + botón primario. Patrón visual y de validación de `reset-password.tsx`/`login.tsx`.
  - Prefill del código desde deep link: `useLocalSearchParams<{ code?: string }>()` → si viene `?code=...` en la URL (email) se precarga el campo.
  - Submit → `request<{ success: true }>("/auth/onboarding/confirm", { method: "POST", body: { inviteCode, newPassword } })`. En éxito → `router.replace({ pathname: "/login", params: { reset: "success" } })` (frontera congelada: el endpoint no devuelve token pair; el family inicia sesión con la nueva password y aterriza en `(tabs)`).
  - Mapeo de errores (patrón `reset-password.tsx`): 400 → error INLINE a nivel de campo de código (mensaje del backend, UX-DR24), se mantiene en pantalla, sin redirect ni crash; 429 → mensaje humano de throttling sin auto-retry; `NetworkError` → error inline de conexión con datos preservados; otro → genérico.
  - A11y (UX-DR36/37/38): `accessibilityLabel` en inputs, no truncar controles.

### Mobile — reconciliación de navegación (ask-first resuelta en esta story)

- [x] **Hacer `onboarding` alcanzable SIN sesión** (`apps/mobile/src/app/_layout.tsx`) (AC: #1): mover el `Stack.Protected` de `onboarding` del guard `status === "authenticated" && role === "family"` al grupo `status === "unauthenticated"` (junto a `login`/`request-password-reset`). Un family pendiente NO tiene sesión (no puede autenticarse sin password aún), así que el onboarding debe ser alcanzable deslogueado. Mantener el orden de declaración que preserva el anchor: `(tabs)` sigue declarado ANTES, por lo que un family ya autenticado sigue aterrizando en `(tabs)`, no en onboarding (no romper la decisión Story 1.10).
- [x] **Link "Have an invite code?"** en `login.tsx` (AC: #1): botón outline (mismo patrón que "Forgot your password?") que hace `router.push("/onboarding")`, para que un family invitado sin email-deep-link encuentre el onboarding. No altera el flujo de login normal.

### Verification

- [x] Backend: `pnpm --filter @evergreen/api run build|lint|test` + `test:e2e` contra Postgres local (barra de Stories 1.3/1.4/1.5).
- [x] Mobile: `pnpm --filter @evergreen/mobile run typecheck` + `pnpm exec eslint .` + `expo export` (build).

## Dev Notes

### Diseño del código de invitación (decisión full-stack, 2026-08-26)

- Hoy NO existe el mecanismo. Story 1.5 activa la cuenta family pendiente por email-link con token (mecanismo de Story 1.7). El "código de invitación" de FR5/Story 1.8 es un mecanismo NUEVO: un código humano-tipable que el family ingresa en la app para resolver su cuenta pendiente y fijar password.
- **Granularidad por membership (AD-18 multi-home):** el código vive en `HomeMembership` porque un family puede pertenecer a varios homes, y cada unión a un home es una membership. Resolver el código activa la cuenta (User) y esa membership. Un family ya activo ganando un segundo home (Story 1.5 AC #4) NO necesita código (ya tiene password) — recibe `sendHomeAccessAddedEmail`.
- **Formato:** código humano-tipable y sin caracteres ambiguos. Proponer 10 caracteres de un alfabeto desambiguado (sin `0/O`, `1/I`, `L`), p.ej. `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. Longitud y formato definidos para que un humano lo ingrese sin error. TTL por env `INVITE_CODE_TTL_HOURS` (default 168h = 7 días): un invitado de family puede tardar en instalar la app, así que un TTL de 1h (el de los tokens de activación) sería demasiado corto — decisión de producto documentada, no copiada de `PasswordResetToken`.
- **Hash del código (no guardar en claro):** el código crudo solo existe en memoria durante su generación y en el email. Para poder hacer lookup por código (`findFirst where inviteCodeHash`) necesitamos un hash determinista, igual que `PasswordResetToken`, en vez de bcrypt (cuya sal rompería el lookup). La defensa contra fuerza bruta online es el `@Throttle` del endpoint (NFR10) + TTL + single-use atómico; el hash no se expone por ninguna respuesta. Documentado para que un futuro lector no "arregle" esto como bug.

### RLS: el endpoint público requiere `@BypassTenantScope()`

- `home_memberships` es tenant-scoped con RLS forzada. `POST /auth/onboarding/confirm` es `@Public()` sin JWT → no hay tenant context → cualquier read/write en `home_memberships` sería bloqueado por RLS (por eso el endpoint necesita `@BypassTenantScope()`, mismo patrón que las writes de super_admin en Story 1.3/1.5 que tampoco llevan `homeId`).
- El bypass es seguro porque la resolución se hace por un código de alta entropía + hash opaco + throttle; no hay enumeración posible (no se lista nada, no se devuelve qué home es). Reconstruir el fix RLS de Story 1.5 (`NULLIF(current_setting(...),'' )`) NO es necesario aquí (el GUC `app.current_home_id` no se setea en un request `@BypassTenantScope()`).

### Frontera congelada: el endpoint NO devuelve token pair

- Igual que `confirm-password-reset` (Story 1.7, "frozen spec boundary"): `onboarding/confirm` resuelve la cuenta y devuelve `{ success: true }`. El client navega a login; el family inicia sesión con la nueva password (lo que además confirma que la activación funcionó). No crear una sesión implícita aquí.

### Reconciliación con la navegación por rol (Story 1.10)

- Story 1.10 decidió (ask-first) que family autenticado → `(tabs)` directo, porque el gate "has linked resident?" no tiene fuente de datos (Epic 2 backlog). Esa decisión se MANTIENE. Lo que esta story añade es la PUERTA DE ENTRADA del family pendiente: onboarding alcanzable sin sesión (código de invitación). Ambas conviven porque operan en estados distintos: `(tabs)` requiere `authenticated`; onboarding ahora vive en `unauthenticated`.
- **Regla de anchor de expo-router** (lección Story 1.10): expo-router redirige a la PRIMERA pantalla disponible; hay que mantener `(tabs)` declarado ANTES que onboarding para que family autenticado no caiga en onboarding. El comentario del guard de onboarding en `_layout.tsx` debe actualizarse (hoy dice "family-only so the route is never reachable unauthenticated" — Story 1.8 lo invierte a propósito).
- No fabricar datos de residentes y no renderizar resident-switcher (UX-DR9) ni el gate (UX-DR23) — diferidos a Epic 2.

### Testing standards

- **Unit (backend):** `InviteCodeService.spec.ts` (generación: hash guardado, TTL seteado, raw devuelto; resolución: password set + user activado + código consumido; invalid/expired/usado → `BadRequestException` genérica; single-use atómico con concurrencia → el perdedor falla; rollback si el write de user falla). Actualizar `users.service.spec.ts` para la rama family-nuevo (ahora llama a `generateForMembership` + `sendFamilyInviteEmail`, NO a `issueActivationToken`). `mail.service.spec.ts` → `sendFamilyInviteEmail` (subject, código en el body, `escapeHtml`, retry).
- **E2E (backend, Postgres local):** `POST /auth/onboarding/confirm` happy path (family pendiente invitado → código → resuelve → puede login); código inválido → 400; código ya usado → 400; reuso concurrente → un solo éxito. Y que el invite de staff/admin sigue con token (sin código) y el de family-existente-activo sigue sin código.
- **Mobile:** lint + typecheck + build (expo export). No hay runner de tests en mobile (misma realidad que Story 1.10).
- Mantener green: la barra completa `api test` + `api test:e2e` como en Stories 1.3/1.4/1.5.

### Project Structure Notes

- **New:** `apps/api/src/auth/invite-code.service.ts`, `apps/api/src/auth/dto/confirm-onboarding.dto.ts`, `apps/api/prisma/migrations/<ts>_add_home_membership_invite_code/migration.sql`, `apps/api/src/auth/invite-code.service.spec.ts`, posible e2e `apps/api/test/onboarding.e2e-spec.ts`.
- **Modified (backend):** `schema.prisma`, `users.service.ts` (rama family-nuevo), `users.service.spec.ts`, `mail.service.ts` + spec, `auth.controller.ts` (endpoint), `packages/shared-types/src/auth.ts`.
- **Modified (mobile):** `apps/mobile/src/app/onboarding.tsx` (reescrito), `apps/mobile/src/app/_layout.tsx` (guard de onboarding → unauthenticated), `apps/mobile/src/app/login.tsx` (link "Have an invite code?").
- No tocar `(tabs)`, no tocar `apps/admin`. `InviteCodeService` debe estar provided/exportado de AuthModule (mismo patrón que `PasswordResetService`, que ya inyecta `UsersService` sin circularidad); si surge una circularidad de módulos, inyectar `PrismaService` directamente (precedente Story 1.5) en vez de pelearse con el grafo.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.8] — ACs verbatim; FR5 (#37, #218); UX-DR9 (#167), UX-DR23 (#187), UX-DR24 (#188)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-evergreen-2026-07-01/EXPERIENCE.md:89-90] — "No residents linked → invite-code onboarding" y "Invalid/expired invite code" copy
- [Source: _bmad-output/implementation-artifacts/1-5-invite-users-by-email.md] — `inviteUser` (ramas family-new / family-active / staff-admin), `rollbackHomeMembership`, `PendingUserResponse`, convención de email + `escapeHtml`
- [Source: _bmad-output/implementation-artifacts/1-7-... y spec-1-7] — `PasswordResetService.confirmReset` (claim atómico single-use con `updateMany`), hash sha256 por lookup, frontera "sin token pair", DTO password cotas; `MailService.sendAccountInviteEmail`
- [Source: _bmad-output/implementation-artifacts/1-10-navegacion-basada-en-rol-tras-login.md#Critical risk #1 y guards] — decisión family → `(tabs)`; orden de anchor de expo-router; `_layout.tsx` estable
- [Source: apps/api/src/auth/auth.controller.ts, password-reset.service.ts, dto/confirm-password-reset.dto.ts] — patrón de endpoint público throttled + DTO
- [Source: apps/api/src/notifications/mail.service.ts] — `attemptSend`/retry/`escapeHtml` a reutilizar
- [Source: apps/api/prisma/schema.prisma#HomeMembership] — modelo a extender; RLS de `home_memberships` (migración row_level_security)
- [Source: issue-tracker #23] — issue original (Story 1.8, mobile, high, not_started)
- [Source: Story 1.10 ask-first e issue-tracker #25] — reconciliación con family → (tabs)

## Dev Agent Record

### Agent Model Used

deepseek-v4-flash (opencode)

### Debug Log References

- `npx prisma migrate deploy` (apps/api) — migración `20260826120000_add_home_membership_invite_code` aplicada (también aplicó localmente `20260820120000_fix_rls_empty_current_home_id`, que el DB local no tenía).
- `npx tsc --noEmit` (api) — clean; `pnpm run build` (nest build) — clean.
- `npx jest` (api) — 106 unit tests, 8 suites, todos en verde.
- `npx jest --config ./test/jest-e2e.json --runInBand --testTimeout=20000` (api) — 34 tests / 8 suites, todos en verde, incl. el nuevo `onboarding.e2e-spec.ts` (3 tests: happy path resuelve cuenta y permite login, código inválido → 400, reuso → 400).
  - Nota de infraestructura: ejecutar las 8 suites e2e en paralelo en un solo proceso Jest hace flakear `users-manage-home` (timeout/WASM "Transaction not found" en `auth.service.ts resolveFixedHomeId`, patrón lazy-promise en `runBypassed` documentado en Story 1.3/1.6). En serie pasan todas; fuera del alcance de esta story.
- `npx eslint "src/**/*.ts" "test/**/*.ts"` (api) — clean tras `--fix` + arreglos de unused vars.
- Mobile (`apps/mobile`): `npx tsc --noEmit` clean, `npx eslint .` clean, `npx expo export --platform web` ok (exporta `/onboarding`; tarda ~4 min en esta shell Windows, no bloquea CI porque mobile no está en CI).

### Completion Notes List

- **Backend full-stack del código de invitación (FR5)**: `HomeMembership` gana `inviteCodeHash` (unique), `inviteCodeExpiresAt`, `inviteCodeUsedAt` (migración aditiva). Nuevo `InviteCodeService` (generación de código humano-tipable de 10 chars con alfabeto desambiguado + resolución con claim atómico single-use en transacción). El endpoint `POST /auth/onboarding/confirm` (Public, throttled 10/min) resuelve la cuenta family pendiente y fija password; **no** devuelve token pair (frontera congelada → el family inicia sesión con la nueva password).
- **RLS descubierto en implementación (corregido)**: el interceptor `@BypassTenantScope()` solo honra `super_admin` (AD-1 rule 5) — no sirve para una ruta pública sin sesión. La resolución usa `TenantContextService.runBypassed()` dentro del servicio (el middleware siempre crea un store, incluso en rutas públicas). Seguro: resolución por código de alta entropía + throttle, sin enumeración.
- **Story 1.5 integrada**: la rama de family NUEVO de `UsersService.inviteUser` ahora genera el código de invitación y envía `sendFamilyInviteEmail` (el código en claro va SOLO en el email); staff/admin mantienen el token/link de `sendAccountInviteEmail`; family existente activo mantiene `sendHomeAccessAddedEmail`. El rollback se extendió para cubrir el fallo de generación del código.
- **Mobile**: `onboarding.tsx` reescrito como flujo real (invite code + password + confirm, error inline de campo UX-DR24, prefill `?code=`, navega a login tras éxito). Onboarding movido al guard `unauthenticated` para que un family pendiente sin sesión pueda entrar (vía link "Have an invite code?" en login o deep link), preservando el anchor de family → `(tabs)` declarado antes.
- **Diferidos a Epic 2 (ask-first 2026-08-26)**: resident-switcher (UX-DR9) y gate "no residents → invite-code" (UX-DR23) — dependen de datos de residentes vinculados inexistentes. Family sigue aterrizando en `(tabs)` (Story 1.10).

### File List

**Backend:**
- `apps/api/prisma/schema.prisma` (migración nueva: campos de código en HomeMembership)
- `apps/api/prisma/migrations/20260826120000_add_home_membership_invite_code/migration.sql` (nuevo)
- `apps/api/src/auth/invite-code.service.ts` (nuevo)
- `apps/api/src/auth/invite-code.service.spec.ts` (nuevo)
- `apps/api/src/auth/dto/confirm-onboarding.dto.ts` (nuevo)
- `apps/api/src/auth/auth.module.ts` (registra/exporta InviteCodeService)
- `apps/api/src/auth/auth.controller.ts` (`POST /auth/onboarding/confirm`)
- `apps/api/src/auth/auth.controller.spec.ts` (mock de InviteCodeService)
- `apps/api/src/users/users.service.ts` (rama family-nuevo genera código + email; rollback extendido)
- `apps/api/src/users/users.service.spec.ts` (tests family-nuevo actualizados/nuevos)
- `apps/api/src/notifications/mail.service.ts` (`sendFamilyInviteEmail` + `buildFamilyInviteHtml`)
- `apps/api/src/notifications/mail.service.spec.ts` (cobertura `sendFamilyInviteEmail`)
- `apps/api/test/onboarding.e2e-spec.ts` (nuevo)
- `packages/shared-types/src/auth.ts` (`OnboardingConfirmRequest`)

**Mobile:**
- `apps/mobile/src/app/onboarding.tsx` (reescrito: flujo invite-code + set password)
- `apps/mobile/src/app/_layout.tsx` (guard de onboarding → unauthenticated)
- `apps/mobile/src/app/login.tsx` (link "Have an invite code?")

## Change Log

- 2026-08-26: Story creada full-stack (ask-first) — el mecanismo de código de invitación no existía en backend. Status → ready-for-dev. (create-story)
- 2026-08-26: Implementación completa — migración `add_home_membership_invite_code`, `InviteCodeService`, endpoint público `POST /auth/onboarding/confirm` (resolución single-use + set password), `sendFamilyInviteEmail` con el código, integración en la rama family-nuevo de `inviteUser` (Story 1.5). Mobile: onboarding reescrito + guard `unauthenticated` + link en login. RLS resuelto vía `runBypassed` (el interceptor solo honra super_admin). 106 unit + 34 e2e verdes; mobile typecheck/lint/build verdes. Status → review.
