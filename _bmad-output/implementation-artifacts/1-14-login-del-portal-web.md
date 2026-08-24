---
baseline_commit: d5157ce945a1f2bf58bcad8408cafae28c96ec92
issue: 28
---

# Story 1.14: Login del Portal Web (apps/admin) — Pantalla, Guardado de Tokens y Rutas Protegidas

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a staff/home-admin/super-admin user of the web portal,
I want to log in to `apps/admin` and stay in a protected session with automatic token refresh,
so that I can access the portal at all — today the `Shell` renders with no auth guard, no login screen, and no way to log out.

## Acceptance Criteria

1. **Given** an unauthenticated visitor opens any `apps/admin` route, **when** the app loads, **then** they are redirected to `/login`; conversely an authenticated user who navigates to `/login` is redirected away from it.
2. **Given** the login screen, **when** it renders, **then** the greeting uses `{typography.hero}` and the email/password fields use the `form-input` component with inline validation on blur, not on every keystroke (UX-DR16, matches Story 1.9's mobile ACs).
3. **Given** valid credentials, **when** login succeeds, **then** the API sets the refresh token as an `httpOnly`/`Secure` cookie and the access token is held in memory only inside `apps/admin` (never `localStorage`/`sessionStorage`) — the user lands on the portal home/dashboard.
4. **Given** invalid credentials, **when** login is submitted, **then** an inline error shows ("Invalid email or password") and no cookie/access token is set.
5. **Given** `429` on `POST /auth/login` (5/min, AD-8), **when** it's hit, **then** a human throttling message shows ("Too many attempts. Please wait a minute and try again.") with no client auto-retry (NFR10).
6. **Given** an authenticated session, **when** the access token expires during normal use, **then** it is refreshed transparently via `POST /auth/refresh` (the browser sends the httpOnly cookie automatically) without interrupting the current screen (FR6).
7. **Given** any `authedRequest` returns `401` for a reason other than a refresh attempt itself, **when** the ensuing refresh also fails (cookie missing/invalid/expired), **then** the app redirects to `/login` exactly once with "Your session ended. Please log in again." — concurrent 401s from multiple in-flight requests must not produce more than one redirect/message (mirrors Story 1.11's mobile single-fire guard, UX-DR27).
8. **Given** an authenticated session, **when** the user triggers "Log out" from the top-nav (replacing the current static "Admin" label), **then** `POST /auth/logout` fires, the API clears the refresh cookie, the in-memory access token is cleared, and the user lands on `/login` with no expiry message (deliberate logout ≠ forced expiry, same distinction as Story 1.11).
9. **Given** the existing mobile app (Story 1.6/1.11, bearer-token-in-body flow), **when** this story ships, **then** its login/refresh/logout behavior is completely unchanged — the API changes are additive only (AD-13).

*(Out of scope, explicitly: role-based sidebar-nav content is Story 1.10 — this story only needs a successful landing page after login, reusing the existing placeholder index route. No changes to `apps/mobile`. No "remember me" beyond the cookie's own 30-day life.)*

## Tasks / Subtasks

### `apps/api` — cookie plumbing, additive only (AC: #3, #6, #7, #8, #9)

- [x] **New dependency**: `cookie-parser` + `@types/cookie-parser` (dev) in `apps/api/package.json`. No other new deps — `@types/express` (`^5.0.0`) is already present for `Request`/`Response` types.
- [x] **`apps/api/src/main.ts`**: `app.use(cookieParser())`; `app.enableCors({ origin: configService.get('ADMIN_APP_URL'), credentials: true })`. **Must NOT be `origin: '*'`** — browsers reject `credentials: true` responses paired with a wildcard origin, so this has to be the literal configured admin URL string, not a pattern. There is currently **no CORS configuration at all** in this codebase (`NestFactory.create(AppModule)` with nothing else) — `apps/admin` cannot call the API cross-origin today; this story is what turns that on for the first time.
- [x] **New env var `ADMIN_APP_URL`** — add to `apps/api/src/config/env.validation.ts` (`Joi.string().uri().required()`, same shape as the existing `RESET_PASSWORD_URL`) and to `apps/api/.env.example` (`ADMIN_APP_URL="http://localhost:5173"` for local dev, matching `apps/admin`'s Vite dev port from `vite.config.ts`). Also added to `apps/api/.env` (local dev, untracked) and `.github/workflows/ci.yml`'s `build-and-test` job env block (same treatment as `RESET_PASSWORD_URL` — required at boot, any syntactically valid URL satisfies Joi in CI). `deploy-staging.yml`/`deploy-production.yml` don't need it — those jobs only run `prisma migrate deploy`, never boot the Nest app.
- [x] **`apps/api/src/auth/auth.controller.ts`**:
  - Add a module-level `REFRESH_COOKIE_OPTIONS` const: `{ httpOnly: true, secure: true, sameSite: 'none' as const, path: '/auth', maxAge: <30d in ms> }`. Cross-reference `AuthService`'s `REFRESH_TOKEN_TTL = '30d'` for the `maxAge` value rather than inventing a second unrelated literal — keep them numerically in sync (30 * 24 * 60 * 60 * 1000).
  - `login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response)`: after `authService.login(...)` resolves, `res.cookie('refresh_token', tokens.refreshToken, REFRESH_COOKIE_OPTIONS)`. **Response body is unchanged** — still the full `TokenPair` JSON (mobile needs both fields; see Dev Notes on why `apps/admin` must discard `refreshToken` from this body itself rather than the API omitting it).
  - `refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response)`: resolve the token as `dto.refreshToken ?? req.cookies?.refresh_token`; if neither is present, `throw new UnauthorizedException()` before calling the service. On success, re-set the cookie with the newly rotated refresh token (`AuthService.refresh` already rotates both tokens every call — confirmed in `auth.service.ts`, no service change needed).
  - `logout(@Res({ passthrough: true }) res: Response)`: `res.clearCookie('refresh_token', { path: '/auth' })` before the existing `204`. Stays `@Public()`, still no server-side session to destroy (stateless JWT, per `deferred-work.md`) — this is purely clearing the browser-held cookie.
  - **Do not touch `AuthService`** — token issuance/rotation logic is unchanged; this is a controller-only, additive change. (Added one export, `REFRESH_TOKEN_TTL_MS`, alongside the existing `REFRESH_TOKEN_TTL` string, so the cookie's `maxAge` can't silently drift from the JWT's own TTL — no behavior change.)
- [x] **`apps/api/src/auth/dto/refresh.dto.ts`**: `refreshToken` becomes optional — `@IsOptional() @IsString() @MaxLength(4096) refreshToken?: string;`. Mobile's existing body-only calls are unaffected (still validated the same way when present).
- [x] **Unit tests** (`apps/api/src/auth/auth.controller.spec.ts`, new — didn't exist): mocks `Response`/`Request`, asserts `login` sets the cookie with the right name/options and unchanged body; `refresh` accepts a cookie-only call (no body) and re-sets the cookie; `refresh` still accepts a body-only call (mobile, no cookie) unchanged; `refresh` 401s with neither source; `logout` calls `clearCookie` with the same `path`. 5 new tests, all passing.
- [x] **E2E test** (`apps/api/test/auth-cookie.e2e-spec.ts`, new): real HTTP round-trip (supertest) asserting the `Set-Cookie` header's shape on `login` (`HttpOnly`, `Secure`, `Path=/auth`, `SameSite=None`) with the JSON body unchanged; `/auth/refresh` succeeds cookie-only (no body) and re-sets the cookie; `/auth/refresh` still succeeds body-only with no cookie (mobile regression guard); `/auth/refresh` 401s with neither; `/auth/logout` clears the cookie. 5 new tests, all passing against local Postgres. (One assertion — "the rotated cookie differs from the original" — was dropped: `AuthService`'s refresh JWT has no nonce, so two calls within the same `iat` second produce a byte-identical token; a pre-existing characteristic of the token design, not a bug. Documented inline in the test.)

### `apps/admin` — auth context, login screen, route guard (AC: #1, #2, #3, #4, #5, #6, #7, #8)

- [x] **`apps/admin/.env.example`**: `VITE_API_URL` already exists as a placeholder with the comment "No API client reads this yet ... once one exists" — this story is that client; comment updated.
- [x] **New `apps/admin/src/lib/api.ts`** — ported `apps/mobile/src/lib/api.ts`'s `request()`/`ApiError`/`NetworkError`/15s-timeout pattern. `credentials: "include"` on every fetch; refresh sends no body; `authedRequest`/`onSessionExpired` bus ported. **Deviation from the plan** (documented, not silent): the access token is NOT threaded through a param the caller supplies — it's a module-scoped `currentAccessToken` variable in `api.ts` itself, with `getAccessToken()`/`setAccessToken()` exports. `authedRequest(path, options)` reads/writes it directly (matching mobile's original two-arg signature) instead of taking a third `accessToken` param, which would have required every call site to manually re-sync the ref after an internal refresh. This is still in-memory-only (module state is not React state, not persisted) — same AC #3 guarantee, cleaner implementation. `authedRequest` also proactively calls `refreshTokens()` when there's no token yet (not just on a 401) — necessary because, unlike mobile's keychain, a page reload always starts with `currentAccessToken === null` even when a valid `refresh_token` cookie exists; without this, a reload could never recover the session via the cookie.
- [x] **New `apps/admin/src/lib/auth.tsx`** — `AuthProvider`/`useAuth`, same state machine as mobile. Uses `getAccessToken`/`setAccessToken` from `api.ts` (see deviation above) instead of a local `React.useRef`. `signIn` discards `data.refreshToken` from the login response, only calls `setAccessToken(data.accessToken)`. `signOut` fire-and-forgets `/auth/logout`, calls `setAccessToken(null)`, clears the query cache. Single-fire session-expiry transition ported verbatim from mobile's `onSessionExpired` + `statusRef` pattern.
- [x] **Route guard** — implemented as TWO route-tree pieces rather than one root-level check, because `/login` must render with NO Shell chrome at all (the root-level single-check plan in this task would have wrapped `/login` in the Shell too):
  - `routes/root.tsx` (`rootRoute`): shows a "Loading…" splash while `status === "resolving"`, otherwise `<Outlet/>`. No Shell, no redirect logic.
  - `routes/protected-layout.tsx` (new file, not in the original plan): a pathless layout route (`id: "_protected"`) that renders `<Navigate to="/login"/>` when not authenticated, otherwise `<Shell><Outlet/></Shell>`. `indexRoute` is now its child (was a direct child of `rootRoute` before this story).
  - `routes/login.tsx` is a direct child of `rootRoute` (sibling of the protected layout, NOT nested under it) and self-redirects via `<Navigate to="/"/>` when already authenticated.
  - `router.ts` updated: `rootRoute.addChildren([protectedLayoutRoute.addChildren([indexRoute]), loginRoute])`.
- [x] **New `apps/admin/src/components/ui/input.tsx`** — added via `npx shadcn@latest add input`. Note: the CLI mis-resolved the `@` path alias on this Windows checkout and wrote to a stray `./@/components/ui/input.tsx` at the app root instead of `src/`; moved the generated file to the correct path and deleted the stray `@/` directory by hand. Adjusted sizing from the CLI's generic default (`h-9`/`rounded-md`/`text-base`) to match `form-input` per DESIGN.md and `Button`'s own scale (`h-11`/`rounded-sm`/`text-[15px]`, 44px touch target).
- [x] **New login route** (`apps/admin/src/routes/login.tsx`): email/password form using `Input`, `{typography.hero}` greeting (Roboto 600 34px — composed as literal Tailwind arbitrary values, since `tailwind.config.ts` only defines `fontFamily.hero`, no matching `fontSize` token; same one-off-value convention mobile's login screen already uses for its own DESIGN.md literals), on-blur inline validation. Error-message branching mirrors mobile's `handleSubmit` exactly (429/401/network/generic, same four message strings).
- [x] **`apps/admin/src/components/layout/top-nav.tsx`**: static `<span>Admin</span>` replaced with a "Log out" button that opens a confirmation dialog (shadcn/ui `AlertDialog`, added via CLI same as `Input` — hit the same `@/` alias-resolution bug, fixed the same way) before calling `useAuth().signOut()`; canceling leaves the session untouched (requested as a follow-up after the initial implementation, 2026-08-24).
- [x] **`apps/admin/src/main.tsx`**: `<RouterProvider>` wrapped in `<AuthProvider>` inside `<QueryClientProvider>`.
- [x] **Manual verification** — `apps/admin` has no test runner (`package.json`'s `test` script is a placeholder no-op). No browser was available in this environment (Claude-in-Chrome extension not connected), so full click-through in an actual browser tab was **not** performed and still needs a human pass. What WAS verified against both dev servers actually running (`pnpm --filter @evergreen/api run start:dev` + `pnpm --filter @evergreen/admin run dev`, seeded via `apps/api/prisma/seed.ts`), using `curl` with an `Origin: http://localhost:5173` header to exercise the exact cross-origin path a browser would take:
  - `OPTIONS /auth/login` preflight → `204`, `Access-Control-Allow-Origin`/`-Credentials`/`-Methods`/`-Headers` all correct.
  - `POST /auth/login` → `200`, `Set-Cookie: refresh_token=...; Path=/auth; HttpOnly; Secure; SameSite=None`, body has both tokens (mobile-compatible).
  - `GET /auth/me` with the returned access token → `200`, correct user.
  - `POST /auth/refresh` with only the cookie (no body, no bearer) → `200`, cookie re-set.
  - `POST /auth/refresh` with neither cookie nor body → `401`.
  - `POST /auth/logout` → `204`, `Set-Cookie: refresh_token=; Expires=Thu, 01 Jan 1970 ...` (cleared).
  This proves the server side of the contract `apps/admin`'s code is written against. **Still needs a human/browser pass**: the actual login form UI, the `/login` ↔ protected-route redirect behavior, the reload-recovers-session flow, and — most importantly — whether a real browser actually accepts `SameSite=None; Secure` over plain `http://localhost` in practice (curl doesn't enforce cookie security attributes the way a browser does, so this specific interaction is unverified). Flagging this explicitly rather than claiming full verification.

### Review Findings

- [x] [Review][Fix] `apps/admin/src/lib/auth.tsx`'s `onSessionExpired` listener guard included `"resolving"`, mirrored verbatim from mobile — but on web, `authedRequest`'s mount-time proactive refresh (no keychain to check first) always hits the network, so a **first-ever anonymous visit with no `refresh_token` cookie** produced a real 401, which unconditionally called `notifySessionExpired()` and (since `status` was still `"resolving"` at that instant) showed "Your session ended. Please log in again." to a visitor who was never logged in. **Fixed:** guard narrowed to `current !== "authenticated"` only — the banner now fires solely when a previously-confirmed session's background refresh fails; a fresh/anonymous load's silent 401 is still handled correctly by `resolveSession`'s own catch (unauthenticated, no banner), unaffected by this change. (code-review)
- [x] [Review][Fix] `apps/api/src/main.ts` read `process.env.ADMIN_APP_URL` directly for the CORS origin instead of `ConfigService`, diverging from this codebase's established pattern for required env vars (`MailService`'s `RESET_PASSWORD_URL` via `config.getOrThrow`) and from the story's own task spec. Worked only because `ConfigModule.forRoot()` happens to mirror validated values into `process.env` as a side effect — not guaranteed. **Fixed:** `app.get(ConfigService).getOrThrow<string>('ADMIN_APP_URL')`. Re-verified against the live dev server (hot-reloaded) that the CORS preflight still returns the correct headers. (code-review)
- [x] [Review][Note] `apps/admin/src/lib/api.ts` exported a `getAccessToken()` alongside `setAccessToken()`, but nothing in `apps/admin` ever called it — dead public API surface left over from mirroring the setter/getter shape. **Fixed:** removed the unused export; `setAccessToken` and the module-scoped `currentAccessToken` variable are unaffected (still the single in-memory source of truth `authedRequest` reads/writes). (code-review)

## Dev Notes

### The `refreshToken` field in the login/refresh JSON body is an accepted, documented tradeoff — not a gap to silently fix

The resolved token-storage decision (issue #28, 2026-08-24) is: refresh token in an `httpOnly` cookie, access token in memory only, for `apps/admin`. `AuthService.issueTokenPair` returns `{ accessToken, refreshToken }` and `apps/mobile` still needs the raw `refreshToken` in the body (it has no cookie jar, only a keychain) — so the response body is **not** changed for this story; distinguishing "this caller is a browser vs. a mobile client" server-side would require inventing a new signal (e.g. a client-type header) that nothing in this codebase has today, which is disproportionate scope for this story. Instead, `apps/admin`'s `signIn` must discard `data.refreshToken` immediately after the call and never assign it anywhere that outlives that scope. This narrows but does not eliminate the XSS exposure window to the single login response — flag this in a `deferred-work.md` entry after implementation if you want it tracked as future hardening (a client-type-aware response would close the gap fully); don't silently "fix" it by having the API omit the field, since that would break mobile.

### `SameSite` depends on whether `apps/admin` and `apps/api`'s deployed origins are same-site

No `render.yaml` or deploy-domain config exists in this repo (Render env is configured outside the repo). If the deployed admin/API URLs share a registrable domain (e.g. both `*.evergreen.app`), `SameSite=Lax` would work. If they're on separate `*.onrender.com` subdomains (a plausible default, and `onrender.com`-style PaaS subdomains are commonly registered on the Public Suffix List, which would make them cross-**site**, not just cross-origin), `Lax` silently drops the cookie on `fetch`/XHR calls — only `SameSite=None; Secure` works in both the same-site and cross-site case, which is why the Tasks above default to `'none'`. `Secure` requires HTTPS, but modern browsers special-case `localhost` to still allow it over plain HTTP in dev — verify this holds in your actual dev setup; if not, gate `secure: NODE_ENV !== 'development'` rather than dropping `Secure` entirely in a shared code path.

### Current state of `apps/admin` (Story 1.13 scaffold, issue #27) — read before touching

- `router.ts` builds `routeTree` from `rootRoute.addChildren([indexRoute])` — code-based (not file-based) TanStack Router; a new `login` route must be added the same way, not by dropping a file into a routes-convention folder.
- `rootRoute` (`routes/root.tsx`) unconditionally renders `<Shell><Outlet/></Shell>` today — no auth check at all. This is exactly what AC #1 requires gating.
- `Shell`/`SidebarNav`/`TopNav` (`components/layout/*`) are all presentational — `SidebarNav`'s items are `disabled` placeholders (Story 1.10 wires them up later); don't enable them as part of this story.
- `main.tsx` nesting today: `StrictMode > QueryClientProvider > RouterProvider`. Add `AuthProvider` between `QueryClientProvider` and `RouterProvider`.
- `components.json` confirms shadcn/ui is already wired ("new-york" style) — use its CLI for `Input`, don't hand-roll a component that conflicts with the existing design-token setup.

### Current state of `apps/api`'s auth module — read before touching

- `AuthController` (`auth/auth.controller.ts`) has `login`/`refresh`/`password-reset(/confirm)`/`logout`/`me` — all currently `@Public()` except `me`. `logout` is a literal no-op body (`logout(): void {}`) relying on the client to be the one that actually destroys the session (stateless JWT, per `deferred-work.md`'s "no per-request re-validation... no refresh-token revocation" entry) — this story does not change that model, it only adds a browser-cookie side-effect on top of it.
- `AuthService.refresh` already rotates **both** tokens on every call (`issueTokenPair` is called fresh) — the cookie must be re-set on every successful refresh, not just on login, or the browser would keep sending an already-rotated-away refresh token on the next call.
- `RefreshDto` currently requires `refreshToken` (`@IsString() @MaxLength(4096)`) — the change to optional must not weaken the `@MaxLength(4096)` bound on the case where it IS present (mobile's existing behavior).
- No CORS is configured anywhere in `apps/api` today (`main.ts` is a 5-line bootstrap) — `app.enableCors(...)` is entirely new, not a tweak to an existing config.

### Testing standards

- `apps/api`: `pnpm --filter @evergreen/api run build`, `run lint`, `run test`, `run test:e2e` (real local Postgres via `docker compose up -d` + `npx prisma migrate deploy`) must all pass — same bar as every prior Epic 1 backend story. The e2e regression assertion for the unchanged mobile flow (Task list above) is not optional — this is the first story to add a second, parallel auth transport (cookie) alongside the existing bearer-body one, and the existing suite is what proves the old path still works.
- `apps/admin`: `pnpm --filter @evergreen/admin run build`, `run lint`, `run typecheck` must pass. No automated test suite exists for this app yet (`run test` is a placeholder) — manual verification per the Tasks checklist above is the bar for this story, matching how Story 1.13 was verified.

### Project Structure Notes

- No `packages/shared-types` changes needed — `LoginRequest`/`LoginResponse`/`MeResponse`/`RefreshRequest` (in `auth.ts`) are already generic enough to serve both clients; `apps/admin` imports them the same way `apps/mobile` does (AD-2).
- No Prisma schema changes.
- New files: `apps/api/src/auth/auth.controller.spec.ts`, `apps/api/test/auth-cookie.e2e-spec.ts`; `apps/admin/src/lib/api.ts`, `apps/admin/src/lib/auth.tsx`, `apps/admin/src/routes/login.tsx`, `apps/admin/src/routes/protected-layout.tsx`, `apps/admin/src/components/ui/input.tsx`.
- Modified: `apps/api/src/main.ts`, `apps/api/src/auth/auth.controller.ts`, `apps/api/src/auth/auth.service.ts` (added `REFRESH_TOKEN_TTL_MS` export only), `apps/api/src/auth/dto/refresh.dto.ts`, `apps/api/src/config/env.validation.ts`, `apps/api/.env.example`, `apps/api/package.json`, `.github/workflows/ci.yml`; `apps/admin/src/main.tsx`, `apps/admin/src/router.ts`, `apps/admin/src/routes/root.tsx`, `apps/admin/src/routes/index.tsx`, `apps/admin/src/components/layout/top-nav.tsx`, `apps/admin/.env.example`.
- Not committed (gitignored, local-only): `apps/api/.env` — also got `ADMIN_APP_URL` added, matching `.env.example`.

### References

- [Source: issues-tracker issue #28] — verbatim AC list this story distills, and the Ask-First token-storage callout it raised
- [Source: memory: project_story-1-14-token-storage-decision] — the resolved decision (httpOnly cookie for refresh, in-memory access token), decided 2026-08-24 by Adrian
- [Source: _bmad-output/planning-artifacts/architecture/architecture-evergreen-2026-07-02/ARCHITECTURE-SPINE.md#AD-8, AD-13] — JWT/refresh design this story extends (not replaces); additive-only API evolution rule
- [Source: apps/api/src/auth/auth.controller.ts, auth.service.ts, dto/refresh.dto.ts] — existing login/refresh/logout/me implementation this story adds cookie plumbing to
- [Source: apps/api/src/config/env.validation.ts] — `RESET_PASSWORD_URL` pattern `ADMIN_APP_URL` follows
- [Source: apps/mobile/src/lib/api.ts, lib/auth.tsx, app/login.tsx] — the mobile Story 1.6/1.7/1.11 implementation this story ports the request/refresh/session-expiry/error-message patterns from
- [Source: apps/admin/src/router.ts, routes/root.tsx, components/layout/shell.tsx, top-nav.tsx, sidebar-nav.tsx, main.tsx, components.json] — current Story 1.13 scaffold state this story builds directly on top of
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-evergreen-2026-07-01/DESIGN.md#typography.hero, form-input] — login screen visual requirements
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — stateless-JWT/no-revocation tradeoff this story's `logout` continues to rely on, unchanged
- [Source: _bmad-output/implementation-artifacts/spec-19-mobile-logout-session-expiry.md] — the single-fire session-expiry guard pattern this story's web equivalent (AC #7) is modeled on

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- `pnpm --filter @evergreen/api run build` — clean.
- `pnpm --filter @evergreen/api run lint` — clean (one `eslint --fix` pass reformatted the new spec file; one manual fix for `expect.any(Number)` triggering `@typescript-eslint/no-unsafe-assignment`, cast `as number`).
- `pnpm --filter @evergreen/api run test` — 7 suites, 91 tests, all passing (86 pre-existing + 5 new `AuthController` cookie tests).
- `pnpm --filter @evergreen/api run test:e2e` (real local Postgres via docker-compose, `npx prisma migrate deploy`) — 6 suites, 26 tests, all passing (21 pre-existing, unaffected + 5 new in `auth-cookie.e2e-spec.ts`). One transient `beforeAll` timeout in the pre-existing `users-manage-home.e2e-spec.ts` on the first full-suite run (resource contention from 6 parallel e2e apps hitting one local Postgres) — reproduced clean on 3 subsequent full runs; confirmed not a regression by running that file in isolation (passed). One test-design bug caught and fixed during the first e2e run: an assertion that a rotated refresh cookie differs byte-for-byte from the original fails when both calls land within the same JWT `iat` second (the refresh token payload has no nonce) — this is a pre-existing characteristic of `AuthService`'s token signing, not a bug introduced here; the assertion was changed to check the cookie is re-set at all, not that its value differs, with an inline comment explaining why.
- `pnpm --filter @evergreen/admin run build`, `run lint`, `run typecheck` — all clean (lint: 6 pre-existing-pattern `react-refresh/only-export-components` warnings across route files that export both a route object and a component — same shape as the already-existing `routes/index.tsx`, 0 errors).
- Manual verification: both dev servers started (`start:dev` / `dev`), a `super_admin` test account seeded via `apps/api/prisma/seed.ts`, and the full cookie contract exercised with `curl -H "Origin: http://localhost:5173"` (CORS preflight, login sets the cookie with correct attributes + unchanged mobile-compatible body, `/auth/me` with the access token, cookie-only refresh, refresh-with-neither → 401, logout clears the cookie) — all behaved exactly as designed. **No real browser was available in this environment** (Claude-in-Chrome extension not connected) — the actual login form, redirect behavior, and reload-recovers-session flow were NOT click-tested, and `SameSite=None; Secure` over plain `http://localhost` (curl doesn't enforce cookie security attributes the way a real browser does) is unverified. Flagged explicitly rather than claimed.

### Completion Notes List

- `apps/api`: added `httpOnly`/`Secure`/`SameSite=None` refresh-cookie plumbing to `AuthController.login/refresh/logout`, additive to the existing mobile bearer-body flow (verified unchanged via e2e regression assertions). `RefreshDto.refreshToken` is now optional (cookie is the alternate source). New `ADMIN_APP_URL` env var powers the first CORS configuration this codebase has ever had (`app.enableCors({ origin, credentials: true })` in `main.ts`) — previously `apps/admin` could not call this API cross-origin at all.
- `apps/admin`: new `lib/api.ts` (ported from `apps/mobile`, `credentials: "include"`, module-scoped in-memory access token — see the documented deviation from the story's original "React ref" plan) and `lib/auth.tsx` (`AuthProvider`/`useAuth`, same state machine as mobile). Route tree restructured into `rootRoute` (splash only) → `protectedLayoutRoute` (auth guard + `Shell`, new file) → `indexRoute`, with `loginRoute` as a Shell-free sibling — needed because the story's single-root-guard sketch would have wrapped `/login` in the admin chrome too. New `Input` (shadcn/ui, adjusted to `form-input`/`Button` sizing) and `routes/login.tsx` (email/password, `{typography.hero}` greeting, mobile-matching error messages). `top-nav.tsx`'s static "Admin" label is now a working logout button.
- All 9 ACs implemented and covered by automated tests where the API contract is concerned (10 new backend tests, all passing); the `apps/admin` UI itself has no automated coverage (consistent with this app having no test runner since Story 1.13) and — per the Debug Log note above — was not manually click-tested in a real browser in this session. Recommend a human/browser pass before merging, specifically to confirm the `SameSite=None`+`Secure`-over-`localhost` cookie behavior a real browser exhibits (the one part curl cannot prove).

### File List

**New:**
- `apps/api/src/auth/auth.controller.spec.ts`
- `apps/api/test/auth-cookie.e2e-spec.ts`
- `apps/admin/src/lib/api.ts`
- `apps/admin/src/lib/auth.tsx`
- `apps/admin/src/routes/login.tsx`
- `apps/admin/src/routes/protected-layout.tsx`
- `apps/admin/src/components/ui/input.tsx`
- `apps/admin/src/components/ui/alert-dialog.tsx`

**Modified:**
- `apps/api/src/main.ts` (cookie-parser + CORS)
- `apps/api/src/auth/auth.controller.ts` (cookie set/read/clear on login/refresh/logout)
- `apps/api/src/auth/auth.service.ts` (added `REFRESH_TOKEN_TTL_MS` export only, no behavior change)
- `apps/api/src/auth/dto/refresh.dto.ts` (`refreshToken` now optional)
- `apps/api/src/config/env.validation.ts` (`ADMIN_APP_URL`)
- `apps/api/.env.example`, `apps/api/.env` (not committed — gitignored)
- `apps/api/package.json` (+`cookie-parser`, +`@types/cookie-parser`)
- `.github/workflows/ci.yml` (`ADMIN_APP_URL` in the `build-and-test` job env)
- `apps/admin/src/main.tsx` (`AuthProvider`)
- `apps/admin/src/router.ts` (route tree restructure)
- `apps/admin/src/routes/root.tsx` (splash-while-resolving only)
- `apps/admin/src/routes/index.tsx` (now a child of `protectedLayoutRoute`)
- `apps/admin/src/components/layout/top-nav.tsx` (real logout button + confirmation dialog)
- `apps/admin/.env.example`
- `pnpm-lock.yaml` (root, from `pnpm add`)

## Change Log

- 2026-08-24: Story implemented — `apps/api` gained additive httpOnly-cookie refresh-token support (login/refresh/logout) alongside the unchanged mobile bearer-body flow, plus the first CORS configuration this codebase has had; `apps/admin` gained a full login/session/logout implementation (in-memory access token, route guard, login screen) per the resolved Ask-First token-storage decision. 10 new backend tests (5 unit + 5 e2e), all passing; build/lint/typecheck clean on both apps. Manual verification done via `curl` against real running dev servers (no browser available in this environment) — a human/browser pass is still recommended before merge, specifically for the `SameSite=None`/`Secure`-over-`localhost` cookie behavior. Status → review.
- 2026-08-24: Follow-up — added a confirmation dialog (shadcn/ui `AlertDialog`) before "Log out" actually signs the user out, per explicit request. `apps/admin` build/lint/typecheck re-verified clean; no `apps/api` changes.
- 2026-08-24: Code review (`/code-review`) — 2 real bugs fixed (false "session expired" banner on a first-ever anonymous visit; CORS origin read via raw `process.env` instead of `ConfigService`, diverging from codebase convention), 1 dead-code export removed (unused `getAccessToken`). See Review Findings above. Build/lint/typecheck/unit/e2e all re-verified clean on both apps after the fixes.
