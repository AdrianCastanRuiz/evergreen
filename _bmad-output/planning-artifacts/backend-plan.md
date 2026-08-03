# Plan de construcción del backend — Evergreen (`apps/api`)

**Fecha:** 2026-08-01
**Fuentes:** `prd.md`, `architecture/architecture-evergreen-2026-07-02/ARCHITECTURE-SPINE.md`, `architecture/architecture-evergreen-2026-07-02/erd.mmd`, `epics.md`

Este plan sigue las decisiones ya tomadas en la arquitectura (NestJS 11 + Prisma 7 + Postgres 17 en Neon, RLS, multi-tenant por `home_id`, etc.) y respeta el orden de los Epics 1–8 definidos en `epics.md`. Al momento de escribir este documento no existe código todavía (no hay `apps/api` ni `package.json`).

## Fase 0 — Scaffolding y fundación multi-tenant (Story 1.1)

1. **Monorepo pnpm workspaces**: crear `apps/api`, `apps/admin`, `apps/mobile`, `packages/shared-types` (aunque admin/mobile se implementen después, la carpeta y el paquete de tipos deben existir desde ya — AD-2).
2. **NestJS 11 (Express adapter)** en `apps/api` con estructura de módulos por capacidad: `auth/`, `homes/`, `users/`, `residents/`, `content/`, `photos/`, `events/`, `meals/`, `notifications/`, `analytics/`, `prisma/`.
3. **Prisma 7 + Postgres 17 (Neon)**: `schema.prisma` inicial con `Home`, `User`, `HomeMembership`, y el resto de modelos del ERD. `DATABASE_URL` apuntando al **pooler** de Neon (AD-17), no a la conexión directa.
4. **Aislamiento multi-tenant (AD-1)**, en este orden porque cada pieza depende de la anterior:
   - Middleware de auth que resuelve `home_id` en `AsyncLocalStorage`.
   - Prisma Client Extension que inyecta `home_id` automáticamente en cada query.
   - Row-Level Security en Postgres con `FORCE ROW LEVEL SECURITY` en cada tabla tenant-scoped.
   - Índice compuesto liderado por `home_id` en esas tablas.
   - Decorator `@BypassTenantScope()` para las operaciones legítimas de `super_admin`.
5. **Validación de entorno al boot** (fail-fast si falta una env var) y **Sentry** conectado desde el día 1 (AD-15).
6. **CI/CD base**: GitHub Actions con migraciones Prisma corriendo solo en pipeline (AD-6), branch-per-PR en Neon, y el gate de aprobación manual para producción (AD-7).

## Fase 1 — Auth, RBAC y Homes (Epic 1)

7. **Modelo de roles y guards**: enum `Role` (`family|staff|admin|super_admin`) en Prisma, `RolesGuard` global + decorator `@Roles(...)` (AD-12).
8. **Auth module**: login (email/password), JWT access+refresh, `@nestjs/throttler` en login/reset (NFR10), splash/resolución de sesión, logout. Para `family`, resolución de `home_id` vía header `X-Active-Home-Id` validado contra `HomeMembership` (AD-18); para `staff/admin/super_admin`, `home_id` fijo en el JWT.
9. **Alta jerárquica de cuentas**: `homes` (CRUD de super_admin), invitaciones por email (`super_admin→admin`, `admin/staff→staff|family`) vía Resend con reintentos (AD-14/NFR15), `PasswordResetToken` con expiración 1h (AD-8/NFR9), activación de cuenta pendiente.
10. **Onboarding por código de invitación** (family) y gestión de perfil propio.
11. **Gestión de usuarios/roles por home admin** dentro de su `home_id`.

## Fase 2 — Residentes y vínculo familiar (Epic 2)

12. CRUD de `Resident` (scoped a `home_id`), `FamilyLink` (user↔resident), y el `FamilyResidentGuard` (AD-11) que exige tanto `FamilyLink` como `HomeMembership` antes de dejar pasar cualquier request family con `residentId`.

## Fase 3 — Contenido del home (Epic 3)

13. Módulo `content` con la tabla genérica `ContentItem` (enum `ContentType`: news/notice/announcement/static_page/document/schedule) — **no incluye menús** (AD-5). CRUD para admin/staff, lectura para family.

## Fase 4 — Fotos (Epic 4)

14. Módulo `photos`: firma de subida a Cloudinary (nunca proxy por la API — AD-4), metadata en Postgres (`cloudinary_public_id`, no URLs pre-construidas), compresión/tamaño máx. 10MB validado también server-side, política de reintento/cola (AD-9).

## Fase 5 — Eventos (Epic 5)

15. Módulo `events`: CRUD de eventos, `EventRegistration`, listado de asistentes, export CSV streaming (no paginado, tope 5000 filas — NFR16).

## Fase 6 — Comidas (Epic 6)

16. Módulo `meals`: `MealMenuItem` (cubre también FR15, la vista de menú semanal) y `MealOrder`, export CSV.

## Fase 7 — Notificaciones push (Epic 7)

17. Módulo `notifications`: `DeviceToken` por `(user_id, device_token, platform, home_id)`, dispatch vía FCM/APNs siempre filtrado por `home_id`, manejo de `InvalidRegistration`, tracking de estado (`sent|failed|dead_token` — NFR14), payload tipado `{type, entityId, route}` para deep-link. Se engancha a los eventos de fotos/eventos/comidas ya construidos.

## Fase 8 — Analytics (Epic 8)

18. Módulo `analytics`: agregados calculados sobre las tablas existentes (sin event store dedicado por ahora), dashboard por home (admin) y por plataforma (super_admin, con `@BypassTenantScope`).

## Fase 9 — Endurecimiento y despliegue

19. **Contrato de API**: completar `packages/shared-types`, validación en CI de que las respuestas reales coinciden con los tipos (AD-2, AD-13 para cambios aditivos/versionado).
20. **Tests de aislamiento multi-tenant** automatizados (cruce de `home_id`) — condición para eventualmente relajar el gate manual de AD-7.
21. **Despliegue**: Render (Web Service) apuntando a Neon staging/production por entorno, siguiendo la tabla de entornos del spine.

---

**Nota de secuenciación:** las Fases 0 y 1 son bloqueantes para todo lo demás (sin `home_id` scoping ni RBAC no se puede construir con seguridad ningún otro módulo). Las Fases 2–8 siguen el orden de dependencia de datos del ERD (`Resident` antes que `Photo`/`Event`/`MealOrder`, que dependen de él).
