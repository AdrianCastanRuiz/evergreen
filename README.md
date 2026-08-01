# Evergreen

Multi-tenant platform connecting care home residents' families to their daily
lives through photos, events, meals, and news — with a single admin portal
for staff to manage content across every home.

- **Family (mobile app):** photos, events, weekly menu, news for their linked resident.
- **Staff / home admin (admin portal + mobile):** content, residents, events, meal orders, per-home.
- **Super admin (admin portal):** onboards care homes, assigns home admins, platform-wide analytics.

Strict multi-tenant data isolation by `home_id`: family sees only their
resident, staff/admin see only their home, super admin sees all — enforced at
the database level (Postgres Row-Level Security), not just in application
code. See [Architecture Spine](_bmad-output/planning-artifacts/architecture/architecture-evergreen-2026-07-02/ARCHITECTURE-SPINE.md)
for the full rationale (AD-1).

## Stack

| Layer | Tech |
| --- | --- |
| API | NestJS 11, Prisma 7, PostgreSQL 17 (Neon) |
| Admin portal | Vite + React, shadcn/ui, TanStack Router/Query |
| Mobile | Expo (React Native), NativeWind, TanStack Query |
| Shared contract | `packages/shared-types` (API request/response types) |
| Media | Cloudinary |
| Email | Resend |
| Push | FCM / APNs |
| Hosting | Render (API + admin), Neon (Postgres), Expo EAS (mobile) |
| Errors/monitoring | Sentry |

## Repo structure

```
apps/
  api/                 # NestJS REST API — see apps/api/prisma/schema.prisma for the data model
  admin/                # Vite + React admin portal (staff/admin/super_admin) — not yet implemented
  mobile/               # Expo React Native app (family/staff) — not yet implemented
packages/
  shared-types/         # API contract types, imported by api + admin + mobile
_bmad-output/planning-artifacts/
  prd.md                                  # Product requirements
  epics.md                                # Epics & user stories
  backend-plan.md                         # Phased backend build plan
  architecture/architecture-evergreen-2026-07-02/
    ARCHITECTURE-SPINE.md                 # Architecture decisions (AD-1..AD-18) and stack
    erd.mmd                               # Entity-relationship diagram
```

## Getting started

Requirements: Node 20+, [pnpm](https://pnpm.io) 10.x, Docker (for local Postgres).

```bash
pnpm install

# Start local Postgres (docker-compose.yml at repo root)
docker compose up -d

# Apply database migrations
cd apps/api
cp .env.example .env   # already points at the local docker-compose Postgres
npx prisma migrate deploy

# Run the API
pnpm --filter @evergreen/api run start:dev
```

The API boots on `http://localhost:3000` (`GET /health` for a liveness check).
Env vars are validated at boot — see `apps/api/src/config/env.validation.ts`
for what's required.

## Development

```bash
pnpm --filter @evergreen/api run build   # compile
pnpm --filter @evergreen/api run lint    # eslint --fix
pnpm --filter @evergreen/api run test    # unit tests
pnpm --filter @evergreen/api run test:e2e
```

`packages/shared-types` is the single source of truth for API request/response
types — `apps/api`, `apps/admin`, and `apps/mobile` all import from it via the
`workspace:*` protocol; none re-declares its own copy (AD-2).

## Status

Backend build follows the phased plan in
[`backend-plan.md`](_bmad-output/planning-artifacts/backend-plan.md). Phase 0
(monorepo scaffold, Prisma schema, multi-tenant isolation foundation, env
validation, Sentry, CI/CD) is done on the `develop` branch. Phases 1–8 (auth,
residents, content, photos, events, meals, push notifications, analytics)
follow the epics in [`epics.md`](_bmad-output/planning-artifacts/epics.md).
