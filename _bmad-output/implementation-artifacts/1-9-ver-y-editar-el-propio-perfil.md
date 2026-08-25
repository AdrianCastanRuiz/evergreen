---
baseline_commit: 802ca257e488983e1e8cdffd9a069ce3bf229d73
issue: 24
---

# Story 1.9: Ver y Editar el Propio Perfil

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a logged-in user (any role),
I want to view and edit my own profile (name, email),
so that my account information stays accurate.

## Acceptance Criteria

1. **Given** I am logged in, **when** I open my profile screen, **then** I see my current name and email (FR4).
2. **Given** I edit my name, **when** I save, **then** the change is persisted and reflected immediately on the profile screen.
3. **Given** I edit my email, **when** I save, **then** the change is validated as well-formed and persisted, **and** a duplicate-email conflict shows an inline error rather than a generic failure.
4. **Given** the profile form, **when** it renders, **then** it uses `{components.form-input}` with inline validation on blur, not on every keystroke (UX-DR16, matches Story 1.14's portal-web ACs).

*(Out of scope, explicitly: password change is not part of this story — no field for it. Reaching the profile screen via real role-based navigation is Story 1.10; this story only needs a screen that exists and is reachable, not the final nav chrome. `apps/admin` (portal web) is not in scope — the issue and epics.md both describe this as a mobile screen; the portal's own profile/account surface, if ever needed, is a future story.)*

## Tasks / Subtasks

### `apps/api` — `PATCH /auth/me` (AC: #1, #2, #3)

- [x] **`apps/api/src/auth/dto/update-me.dto.ts`** (new):
  ```ts
  export class UpdateMeDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(255)
    name?: string;

    @IsOptional()
    @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
    @IsEmail()
    @MaxLength(254)
    email?: string;
  }
  ```
  Same trim-before-validate shape as `CreateSuperAdminDto`/`InviteUserDto` (`@Transform` runs before `@IsEmail()` so a padded address doesn't 400 before normalization). `@IsOptional()` on both fields — the form always sends both today (task below), but the DTO itself shouldn't force that; a future caller sending just one field should work.
- [x] **`apps/api/src/auth/auth.controller.ts`**: add `@Patch('me')` alongside the existing `@Get('me')`. **Do not** put this on `UsersController` — that controller is class-level `@Roles('super_admin')` with per-route overrides for specific admin/staff flows; `AuthController` already hosts the self-service `GET /auth/me` with no `@Roles()` at all (any authenticated role, per `RolesGuard`'s "no metadata = open to any authenticated user" rule — confirmed by reading `roles.guard.ts`), which is exactly this story's actor set. Implementation, mirroring `me()`'s existing shape (inline `PrismaService` call, no new service):
  ```ts
  @Patch('me')
  async updateMe(@Body() dto: UpdateMeDto): Promise<MeResponse> {
    const userId = this.tenantContext.getUserId();
    if (!userId) throw new UnauthorizedException();

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.email !== undefined) data.email = dto.email.trim().toLowerCase();

    let user;
    try {
      user = await this.prisma.client.user.update({
        where: { id: userId },
        data,
        select: { id: true, email: true, name: true, role: true, isActive: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A user with this email already exists');
      }
      throw error;
    }

    return { ...user, homeId: this.tenantContext.getHomeId() };
  }
  ```
  `email.trim().toLowerCase()` mirrors `AuthService.login`'s own normalize step and `UsersService`'s convention — even though the DTO's `@Transform` already trims, the service-level (here, controller-level, since there's no service) lowercase+trim is the established double-normalize pattern in this codebase (see Story 1.5 Dev Notes). Import `Prisma` from `'../../generated/prisma'` (same relative path `users.service.ts` uses from its own sibling directory) and `ConflictException`, `Patch` from `@nestjs/common`.
  - No `@Roles()` needed — same reasoning as `me()`.
  - No `@BypassTenantScope()` needed — `User` is not a tenant-scoped model (no RLS policy on `users`; only the 10 tenant-scoped tables from the RLS migration are), so this is a plain `PrismaService` call like `me()`'s own `findUnique`.
- [x] **`packages/shared-types/src/auth.ts`**: add
  ```ts
  // PATCH /auth/me — either field may be omitted; the endpoint updates only
  // what's provided.
  export interface UpdateMeRequest {
    name?: string;
    email?: string;
  }
  ```
  directly below the existing `MeResponse` (reused as-is for the response — no new response type needed).
- [x] **Unit tests** (`apps/api/src/auth/auth.controller.spec.ts`, existing file — extend it): new `describe('updateMe', ...)` block, following the file's existing mock-`PrismaService`-as-`{ client: {...} }` shape (see `users.service.spec.ts` for the mock-shape convention if `auth.controller.spec.ts`'s current `PrismaService` mock is just `{}` — it will need `{ client: { user: { update: jest.fn() } } }` for this block). Cover:
  - Name-only update: `dto.email` undefined → `data` passed to `user.update` has only `name`, no `email` key at all (not `email: undefined` — Prisma treats an explicit `undefined` value differently from an absent key in some contexts; build `data` by conditional assignment as shown above, not object-spread-with-undefined).
  - Email-only update: input `"  Foo@Example.com  "` → `user.update` called with `email: "foo@example.com"` (trimmed + lowercased).
  - No `userId` in tenant context (defensive — `JwtAuthGuard` should already have blocked this, but the method's own guard clause is directly testable) → `UnauthorizedException`, no Prisma call.
  - `P2002` from `user.update` → `ConflictException('A user with this email already exists')`.
  - Any other thrown error → rethrown unchanged (not swallowed into a `ConflictException`).
  - Response shape: `{ ...user, homeId: tenantContext.getHomeId() }` — assert `homeId` comes from `tenantContext`, not from the updated row (the `select` doesn't even fetch a `homeId` column, since `User` has none — `homeId` is derived from `HomeMembership`/JWT via `TenantContextService`, same as `me()`).
- [x] **E2E test** (`apps/api/test/auth-me-update.e2e-spec.ts`, new) — mirror `auth-cookie.e2e-spec.ts`'s real-HTTP-plus-real-Postgres shape (seeded user via the same helpers `users-invite.e2e-spec.ts`/`auth-cookie.e2e-spec.ts` already use). Cover at minimum: authenticated `PATCH /auth/me` with `{ name: "New Name" }` → `200`, `GET /auth/me` afterward reflects the new name, email unchanged; `{ email: "new@example.com" }` → `200`, persisted lowercased; two seeded users, second one `PATCH`es its email to the first's existing email → `409`; malformed email (`"not-an-email"`) → `400`; no `Authorization` header → `401`.
- [x] **Manual verification** (same bar as Story 1.14's backend half — this environment has no browser, but does have `curl` + a running local Postgres): `pnpm --filter @evergreen/api run start:dev`, seed a user, `curl -X PATCH http://localhost:3000/auth/me -H "Authorization: Bearer <token>" -d '{"name":"Test Name"}'` → confirm `200` + updated `GET /auth/me`; repeat for email; repeat for a duplicate email → confirm `409` with the `ConflictException` message in the body, not a raw Prisma error.

### `apps/mobile` — profile screen (AC: #1, #2, #3, #4)

- [x] **`apps/mobile/src/app/profile.tsx`** (new screen, file-based route via expo-router — same convention as every other screen under `src/app/`): form with `name`/`email` fields using the existing `Input` component (already the `form-input` implementation per `apps/admin/src/routes/login.tsx`'s identical use of its own `Input`) and the **touched-on-blur validation pattern that `apps/admin/src/routes/login.tsx` established for UX-DR16** (this is the first time this pattern is needed on the mobile side — mobile's own `login.tsx` only validates via API error response, never per-field client-side, so there is no existing mobile precedent to copy; port the web one instead, adapted to React Native's `onBlur`/`onChangeText` instead of DOM `onBlur`/`onChange`):
  - Local `[name, setName]`/`[email, setEmail]` state seeded from `useAuth().user` (already-loaded from the splash-time `/auth/me` call — no extra fetch needed to satisfy AC #1; `user` can theoretically be `null` only in an unreachable state since this screen is only reachable while authenticated, but guard with `user?.name ?? ""` / `user?.email ?? ""` defensively).
  - `[nameTouched, setNameTouched]` / `[emailTouched, setEmailTouched]`, each field's `onBlur` sets its own touched flag (never both at once, unlike the login screens' submit-time "touch everything" — but do also set both touched on Save-press, exactly like `apps/admin/src/routes/login.tsx`'s `handleSubmit`, so a Save with an untouched-but-invalid field still shows its error instead of silently no-op'ing).
  - Derived errors (not stored in state — computed each render, same as the web login screen): `nameError = nameTouched && name.trim().length === 0 ? "Name is required" : null`; `emailError = emailTouched && !/^\S+@\S+\.\S+$/.test(email) ? "Enter a valid email address" : null` (same regex `apps/admin/src/routes/login.tsx` already uses — no need to invent a stricter one).
  - `handleSave`: touch both fields, bail if either error is non-null, then `authedRequest<MeResponse>("/auth/me", { method: "PATCH", body: { name: name.trim(), email: email.trim() } satisfies UpdateMeRequest })`. On success: update local field state from the **response** (not the locally-typed values — the server is the source of truth for the persisted/normalized email) and show a brief "Profile updated." confirmation (reuse the existing plain-`Text` inline-message convention `login.tsx`/`request-password-reset.tsx` already use for non-error confirmations — no new toast/banner component; `toast-banner` (UX-DR18) is a heavier affordance not established anywhere in this codebase yet and out of scope here).
  - Error branching on failure: `ApiError` with `status === 409` → the specific inline message **"This email is already in use by another account."** (AC #3's "specific, not generic" requirement — this is the one branch that must NOT reuse the generic message); any other `ApiError` or unexpected error → "Something went wrong. Please try again." (same generic fallback string `login.tsx` already uses); `NetworkError` → "No network connection. Check your connection and try again." (verbatim match to the existing string elsewhere, for consistency).
  - Submitting-state disables both inputs and the Save button, same `submitting` boolean pattern as every other mobile form screen in this codebase.
- [x] **`apps/mobile/src/lib/auth.tsx`**: add `updateUser: (user: MeResponse) => void` to `AuthContextValue`, implemented as a thin wrapper around the existing `setUser` (`const updateUser = React.useCallback((u: MeResponse) => setUser(u), [])`). This lets the profile screen push the PATCH response into the shared auth context in one call instead of triggering a second `/auth/me` round-trip — so `home.tsx`'s `user?.name` greeting (and any other consumer of `useAuth().user`) picks up the new name immediately too, not just the profile screen itself. Add `updateUser` to the `useMemo` dependency array alongside the other context values.
- [x] **`apps/mobile/src/app/_layout.tsx`**: add a new `Stack.Protected` block for the `profile` screen, guarded by `status === "authenticated"` (deliberately broader than either the `home` or `onboarding` guard — this screen must be reachable by every role, family included, unlike `home`/`onboarding` which are role-exclusive). This overlapping-guard shape already has a precedent in this exact file (`reset-password`'s guard, `status !== "authenticated"`, overlaps both the `resolving` and `unauthenticated` blocks) — it is not a new pattern, just applied on the authenticated side this time. Add it as its own block, placed after the `onboarding` block and before the `unauthenticated` block, so the Stack's screen-declaration order stays stable across every render (the file's own comment block above `RootNavigator` is explicit that the tree must never restructure conditionally — only add a new sibling block, don't touch the existing ones' guards).
- [x] **`apps/mobile/src/app/home.tsx`** and **`apps/mobile/src/app/onboarding.tsx`**: add a way to actually reach `/profile` — Story 1.10 (real role-based nav) isn't done yet, so today's only entry points are these two placeholder landing screens. Add one small `Button` (`variant="outline"`, same as `home.tsx`'s existing "Log out" button) with `onPress={() => router.push("/profile")}`, labeled "My Profile". This is explicitly an interim affordance, not a design decision — Story 1.10 will replace both placeholder screens (and this button) with the real tab-bar/sidebar navigation; leave a one-line comment saying so (mirroring the existing "Role-based navigation is coming soon" comment already in `home.tsx`) so a future reader doesn't mistake it for intended final UX.
- [x] **`apps/mobile/src/app/profile.tsx`**'s Back affordance: a plain `Button` calling `router.back()` at the top of the screen (there's no shared header/`top-nav` component on mobile yet — every other secondary screen, e.g. `request-password-reset.tsx`/`reset-password.tsx`, either relies on the stack's native back gesture/header or has its own explicit control; check which of those two screens actually renders a visible back control before deciding whether to add one here or rely on `headerShown: false` + a manual button, since `_layout.tsx`'s `Stack` sets `screenOptions={{ headerShown: false }}` globally — meaning there is **no** native back button anywhere in this app, so an explicit in-screen "Back" `Button` is required, not optional).
- [x] **Lint/typecheck**: `pnpm --filter @evergreen/mobile run lint` (`expo lint`) and `pnpm --filter @evergreen/mobile run typecheck` must both be clean — this app has no real automated test suite (`"test": "expo lint"` in `package.json`), same bar as every prior mobile story.
- [x] **Manual verification**: no browser/device/simulator is available in this environment (same limitation flagged in Story 1.14's Dev Agent Record) — flag explicitly in the Debug Log rather than claiming a click-through was done. Verify what IS verifiable without a device: `pnpm --filter @evergreen/mobile run typecheck`/`lint` clean, and the backend contract via the `apps/api` e2e suite + manual `curl` above. Recommend a human/simulator pass before merge, specifically for the on-blur validation UX and the "Profile updated." confirmation timing.

### Review Findings

- [x] [Review][Fix] `UpdateMeDto.name` had no trim, unlike `email` in the same DTO — a whitespace-only or padded name passed `@MinLength(1)` and was persisted as-is [apps/api/src/auth/dto/update-me.dto.ts:15]. **Fixed:** added the same `@Transform` trim `email` already has; a whitespace-only name now trims to empty and correctly 400s. Covered by a new e2e assertion (merged into the existing name-update test to stay under this file's shared 5/min login-throttle budget, NFR10/AD-8). (code-review)
- [x] [Review][Fix] `profile.tsx`'s "Profile updated."/error banners stayed visible after the user edited the form again post-save, misleadingly implying the current on-screen (unsaved) text was already persisted [apps/mobile/src/app/profile.tsx:60]. **Fixed:** `onChangeText` for both fields now clears `saved`/`error` on every edit via new `handleNameChange`/`handleEmailChange` wrappers. (code-review)
- [x] [Review][Fix] The P2002→409 mapping in `updateMe` was an inline check, one of now four near-identical copies across the codebase (`UsersService` x2, `HomesService` x1) [apps/api/src/auth/auth.controller.ts:230]. **Fixed:** extracted into a private `mapUniqueEmailViolation` helper on `AuthController` itself, matching `UsersService`'s existing naming convention — a full cross-file shared-utility extraction was judged out of scope for this story (would touch `users.service.ts`/`homes.service.ts` unrelated to Story 1.9). (code-review)
- [x] [Review][Fix] `profile.tsx`'s client-side `EMAIL_RE` (shared with `apps/admin`'s login screen) is looser than the server's `@IsEmail()` — an address like `a@b@example.com` passes the client regex but the server 400s, previously falling through to the generic "Something went wrong" message instead of a specific one [apps/mobile/src/app/profile.tsx:12]. **Fixed:** added a `status === 400` branch showing "Enter a valid email address." — the regex itself was left unchanged to stay consistent with `apps/admin/src/routes/login.tsx`'s established pattern (narrowing it here alone would create cross-screen validation inconsistency, a larger change than this finding warrants). (code-review)

## Dev Notes

### Where the endpoint lives — `AuthController`, not `UsersController`

`UsersController` (`apps/api/src/users/users.controller.ts`) is `@Controller('users') @Roles('super_admin')` at the class level, with every route needing its own handler-level `@Roles()` override for the specific admin/staff/family cases it's built for (Story 1.4/1.5/1.12) — none of those cases is "any authenticated user editing themselves." `AuthController` already has the self-service `GET /auth/me` with no `@Roles()` at all, open to any authenticated role by `RolesGuard`'s documented "no metadata = open" rule (`roles.guard.ts` line 15's own comment: "Routes with no `@Roles()` metadata are left open to any authenticated user."). `PATCH /auth/me` belongs next to it for the same reason, not bolted onto `UsersController` with yet another one-off `@Roles()` override.

### `User` is not tenant-scoped — no `@BypassTenantScope()`, no RLS interaction

Every RLS-related Dev Note in this codebase so far (Story 1.5, 1.11, 1.12) concerns the 10 tenant-scoped tables from the `20260801125500_row_level_security` migration. `users` is not one of them (identity is global, home membership is the tenant-scoped join). A plain `this.prisma.client.user.update(...)` — same call shape `me()` already makes via `findUnique` — needs no tenant-context interaction at all. Don't add `@BypassTenantScope()` speculatively; it would be a no-op at best and a misleading signal to a future reader at worst.

### Mobile has no client-side field validation precedent — this story ports one from `apps/admin`

Every existing mobile form (`login.tsx`, `request-password-reset.tsx`, `reset-password.tsx`) validates only server-side, surfacing whatever the API rejected as a screen-level error — there is no per-field touched/blur state anywhere in `apps/mobile` today. `apps/admin/src/routes/login.tsx` (Story 1.14) built exactly this pattern for the web login form, explicitly cross-referenced in epics.md's own UX-DR16 note ("matches Story 1.9's mobile ACs" — written before this story existed, meaning epics.md expected this story to be the mobile side of that same pattern). Port `login.tsx`'s `[fieldTouched, setFieldTouched]` + derived-error-on-render shape verbatim in spirit, adapted from DOM `onBlur`/`onChange` to React Native's `onBlur`/`onChangeText` — don't invent a different validation architecture (e.g. a form library) for a two-field form when a working, already-reviewed pattern exists one app over.

### No navigation exists yet to reach this screen — Story 1.10 owns the real fix

`home.tsx` and `onboarding.tsx` are both still Story 1.8/1.10 placeholders (their own header comments say so). Neither has any navigation chrome. This story adds one small outline button to each purely so the feature is reachable and testable — it is explicitly not this story's job to build real navigation (that's Story 1.10, already scoped for both mobile tab-bar and portal sidebar-nav). Don't over-invest in this interim button's polish.

### `headerShown: false` is global — every screen needs its own back control

`_layout.tsx`'s `Stack` sets `screenOptions={{ headerShown: false }}` at the root, so there is no native header/back-chevron anywhere in this app. Confirm how `request-password-reset.tsx`/`reset-password.tsx` handle this (they may rely on `router.back()` themselves, or on the gesture-based swipe-back `GestureHandlerRootView` already provides) before assuming a pattern — do not assume a header exists just because a typical Expo app has one by default.

### Testing standards

- `apps/api`: `pnpm --filter @evergreen/api run build`, `run lint`, `run test`, `run test:e2e` (real local Postgres via `docker compose up -d` + `npx prisma migrate deploy`) must all pass — same bar as every prior backend story in this epic.
- `apps/mobile`: `pnpm --filter @evergreen/mobile run lint` (`expo lint`) and `run typecheck` must pass — there is no automated test suite for this app (same as every prior mobile story); manual/simulator verification is the bar for the actual screen UX, and this environment cannot provide it (no browser/device connected) — say so explicitly in the Debug Log rather than claiming an untested click-through.

### Project Structure Notes

- No Prisma schema changes — `User.name`/`User.email` already exist; `email` already has `@unique`.
- No new env vars.
- New files: `apps/api/src/auth/dto/update-me.dto.ts`, `apps/api/test/auth-me-update.e2e-spec.ts`, `apps/mobile/src/app/profile.tsx`.
- Modified: `apps/api/src/auth/auth.controller.ts`, `apps/api/src/auth/auth.controller.spec.ts`, `packages/shared-types/src/auth.ts`, `apps/mobile/src/lib/auth.tsx`, `apps/mobile/src/app/_layout.tsx`, `apps/mobile/src/app/home.tsx`, `apps/mobile/src/app/onboarding.tsx`.

### References

- [Source: issues-tracker issue #24] — verbatim AC list this story distills
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.9] — acceptance criteria (verbatim Given/When/Then), UX-DR16 cross-reference to Story 1.14
- [Source: _bmad-output/implementation-artifacts/1-14-login-del-portal-web.md] — the on-blur touched-state validation pattern this story ports from web to mobile; the "no browser/device available in this environment" manual-verification precedent
- [Source: _bmad-output/implementation-artifacts/1-5-invite-users-by-email.md] — DTO trim-before-validate pattern, double-normalize (DTO `@Transform` + service/controller-level `.trim().toLowerCase()`) convention
- [Source: apps/api/src/auth/auth.controller.ts, auth.service.ts] — existing `GET /auth/me`, `AuthService.login`'s email-normalize step
- [Source: apps/api/src/common/auth/roles.guard.ts] — confirms no-`@Roles()` routes are open to any authenticated user
- [Source: apps/api/src/users/users.service.ts] — `Prisma.PrismaClientKnownRequestError`/P2002 → `ConflictException` mapping convention this story's inline catch mirrors
- [Source: apps/api/prisma/schema.prisma#User] — `email` `@unique` constraint the conflict check depends on; confirms `User` is outside the RLS-scoped table set
- [Source: apps/mobile/src/lib/auth.tsx, lib/api.ts, app/login.tsx, app/home.tsx, app/onboarding.tsx, app/_layout.tsx] — `AuthProvider`/`authedRequest` to extend, the two placeholder landing screens to add a nav affordance to, the Stack's guard-overlap precedent (`reset-password`)
- [Source: apps/admin/src/routes/login.tsx] — the on-blur validation pattern ported here
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-evergreen-2026-07-01/DESIGN.md#form-input, UX-DR16] — component/interaction spec this story's form must satisfy

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- `pnpm --filter @evergreen/api run build` — clean.
- `pnpm --filter @evergreen/api run lint` — clean (`eslint --fix` only reformatted the new/changed files).
- `pnpm --filter @evergreen/api run test` — 7 suites, 96 tests, all passing (91 pre-existing + 5 new `updateMe` unit tests).
- `pnpm --filter @evergreen/api run test:e2e` (real local Postgres via `docker compose up -d`, `npx prisma migrate deploy` — no pending migrations) — 7 suites, 31 tests, all passing (26 pre-existing + 5 new in `auth-me-update.e2e-spec.ts`). First full run hit the same pre-existing parallel-Postgres-contention flakiness documented in Story 1.5/1.14 (`users-manage-home.e2e-spec.ts`'s `beforeAll` timed out — 8 e2e suites now hitting one local Postgres in parallel); confirmed not a regression by re-running that file in isolation (8/8 passing) and the full suite again (7 suites, 31 tests, all clean).
- Manual verification against the real running dev server (`pnpm --filter @evergreen/api run start:dev`, seeded via `apps/api/prisma/seed.ts`) with `curl`: name-only `PATCH /auth/me` → `200`, `GET /auth/me` reflects it; email `PATCH` with padding/mixed case → persisted trimmed+lowercased; second seeded user `PATCH`ing to the first's email → `409` with the `ConflictException` message (`"A user with this email already exists"`), not a raw Prisma error; malformed email → `400`; no `Authorization` header → `401`. Test users cleaned up from local Postgres afterward.
- `pnpm --filter @evergreen/mobile run typecheck` — clean. Required regenerating the gitignored, locally-generated `apps/mobile/.expo/types/router.d.ts` (stale — didn't know about the new `profile` route yet) by running `npx expo start` briefly until the file updated, then stopping it; this is a local dev-environment artifact, not a repo change.
- `pnpm --filter @evergreen/mobile run lint` (`expo lint`) — clean.
- **No browser/device/simulator was available in this environment** (same limitation as Story 1.14's `apps/admin` half) — the actual profile screen (on-blur validation feel, "Profile updated." confirmation timing, the new "My Profile" buttons on `home.tsx`/`onboarding.tsx`) was **not** click/simulator-tested. Flagging explicitly rather than claiming it was. Recommend a human/simulator pass before merge.
- **Code review** (`/code-review --fix`) found and fixed 4 issues (see Review Findings above): untrimmed `name` in `UpdateMeDto`, stale success/error banners after a post-save edit, a 4th inline copy of the P2002→409 mapping, and a client/server email-validation gap surfacing a generic error instead of a specific one. Re-ran the full bar after fixes: `apps/api` build/lint clean, 96 unit tests passing, 31 e2e tests passing (real local Postgres); `apps/mobile` typecheck/lint clean.

### Completion Notes List

- `apps/api`: added `PATCH /auth/me` (`AuthController`, no new service — mirrors `GET /auth/me`'s inline-`PrismaService` shape) covering AC #1–#3: returns the current user's `name`/`email` after update, validates email format, normalizes (trim+lowercase), and maps a unique-email conflict to `409 ConflictException` with a specific message rather than a raw `500`. New `UpdateMeDto` follows the established trim-before-validate convention. `packages/shared-types` gained `UpdateMeRequest`; `MeResponse` reused as the response type (no new type needed).
- `apps/mobile`: new `profile.tsx` screen — ported the on-blur touched-state validation pattern from `apps/admin/src/routes/login.tsx` (Story 1.14) to React Native, the first time that pattern exists on the mobile side (AC #4). Duplicate-email conflict (`409`) shows the specific message "This email is already in use by another account.", distinct from the generic fallback (AC #3's "specific, not generic" requirement). `AuthProvider` gained `updateUser()` so a successful save reflects immediately both on the profile screen and anywhere else `useAuth().user` is read (e.g. `home.tsx`'s greeting), without a second network round trip. Since Story 1.10 (real role-based nav) isn't done yet, added a small interim "My Profile" button to both placeholder landing screens (`home.tsx`, `onboarding.tsx`) so the feature is actually reachable — explicitly documented as provisional, to be replaced by 1.10.
- All 4 ACs implemented and covered where the environment allows: backend fully covered by automated tests (unit + e2e) and manual `curl` verification; the mobile UI itself has no automated test suite (consistent with every prior mobile story) and was not manually click/simulator-tested in this session (no device/simulator available) — flagged above, not silently skipped.

### File List

**New:**
- `apps/api/src/auth/dto/update-me.dto.ts`
- `apps/api/test/auth-me-update.e2e-spec.ts`
- `apps/mobile/src/app/profile.tsx`

**Modified:**
- `apps/api/src/auth/auth.controller.ts` (added `PATCH /auth/me`)
- `apps/api/src/auth/auth.controller.spec.ts` (added `updateMe` test block, extended `PrismaService`/`TenantContextService` mocks)
- `packages/shared-types/src/auth.ts` (added `UpdateMeRequest`)
- `apps/mobile/src/lib/auth.tsx` (added `updateUser` to `AuthContextValue`)
- `apps/mobile/src/app/_layout.tsx` (new `Stack.Protected` block for `profile`)
- `apps/mobile/src/app/home.tsx` (added "My Profile" interim nav button)
- `apps/mobile/src/app/onboarding.tsx` (added "My Profile" interim nav button)

## Change Log

- 2026-08-25: Story context created (create-story) from issue #24 / epics.md Story 1.9. Status → ready-for-dev.
- 2026-08-25: Story implemented — `PATCH /auth/me` (backend) and a new mobile profile screen with on-blur validation (ported from Story 1.14's web pattern). All 4 ACs covered; 96 unit + 31 e2e tests passing on `apps/api` (build/lint clean), `apps/mobile` typecheck/lint clean. No browser/device available in this environment — the mobile UI itself was not manually click-tested; flagged for a human/simulator pass before merge. Status → review.
- 2026-08-25: Code review (`/code-review --fix`) — 4 fixes applied: trimmed `UpdateMeDto.name` (whitespace-only names now correctly 400), cleared stale success/error banners on further edits in `profile.tsx`, extracted the P2002→409 mapping into a named helper, added a specific inline message for a malformed email that slips past the client's looser regex. See Review Findings above. 96 unit + 31 e2e tests passing, build/lint/typecheck all re-verified clean after the fixes.
- 2026-08-25: PR #23 merged into `develop`. Status → done.
