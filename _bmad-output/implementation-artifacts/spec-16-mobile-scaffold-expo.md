---
title: 'Scaffold Expo mobile app (issue #16, Block A prereq)'
type: 'feature'
created: '2026-08-10'
status: 'done'
context: []
baseline_commit: '2e2117c5585138d9f607ba69c9fd5ae050f7f63d'
---

## Intent

**Problem:** `apps/mobile` is an empty stub (placeholder `package.json`), but Stories 1.6, 1.7, 1.11 (login/refresh, password reset, logout/session) need a working Expo app with secure token storage, a typed API client, and the Evergreen design token system.

**Approach:** Scaffold the Expo app in `apps/mobile` (Expo SDK 57, expo-router, NativeWind 4 + React Native Reusables), wire `expo-secure-store` as the keychain, build a small API client honoring the shared-types error envelope, add TanStack Query with an AsyncStorage persister (AD-16), add Sentry (AD-15), and extend `packages/shared-types/src/auth.ts` with the types the auth stories need (AD-2).

## Boundaries & Constraints

**Always:**
- Use Expo SDK 57 / RN 0.86 / NativeWind 4 / expo-router 4 (versions verified against registry 2026-08-10).
- Tokens must go through `expo-secure-store` only — never `AsyncStorage` or any plain storage (NFR8, AD-8).
- The API client must consume the `{ error: { code, message, details? } }` envelope from `@evergreen/shared-types` and normalize 429/401/network into typed client errors usable by Stories 1.6/1.11 (do not build full 429/401 handling yet — just the error types and mapping primitives).
- Design tokens must live in ONE NativeWind config and match DESIGN.md exactly: `colors.primary #1B853F`, `rounded.sm/DEFAULT/md/lg/full` (3/8/11/16/9999px), typography including `hero` (Roboto 600/34px), spacing scale (UX-DR1).
- All API request/response types imported from `@evergreen/shared-types` via `workspace:*` — none re-declared (AD-2).

**Ask First:**
- If a package version must deviate from the registry-latest Expo SDK 57 set, HALT and confirm (native module compatibility is fragile).
- If the API base URL for dev should point somewhere other than `http://localhost:3000`, confirm before hardcoding.

**Never:**
- No auth screens, no token refresh logic, no splash auth-resolution — those are Stories 1.6/1.11.
- No offline queued-writes, photo upload, or resident features.
- No plain-text token storage anywhere, even temporarily.
- No copying web admin scaffolding into mobile.

## Code Map

- `apps/mobile/` -- currently a stub; becomes the Expo app (package.json, app.json, app/, src/)
- `packages/shared-types/src/auth.ts` -- extend with MeResponse, RefreshRequest, RequestPasswordResetRequest, ConfirmPasswordResetRequest, AuthenticatedUser additions (homeId already present)
- `apps/api/src/auth/auth.controller.ts` -- source of truth for the endpoint shapes the mobile client consumes (read-only reference)

## Tasks & Acceptance

**Execution:**
- [x] `apps/mobile` -- run `create-expo-app` with the SDK 57 default template, then prune to workspace conventions (pnpm `workspace:*`, no nested lockfile, scripts dev/build/test/lint) -- establishes the app root
- [x] `apps/mobile/app.json` + `apps/mobile/app/_layout.tsx` -- expo-router entry with root layout hosting QueryClientProvider, SafeAreaProvider, and a minimal theme placeholder -- navigation + providers baseline
- [x] `apps/mobile/global.css` + `apps/mobile/tailwind.config.js` (+ metro.config.js) -- NativeWind 4 setup wired to the Evergreen DESIGN.md tokens (colors/rounded/spacing/typography incl. `hero`) -- token system per UX-DR1
- [x] `apps/mobile/src/lib/api.ts` -- fetch-based client: base URL from `EXPO_PUBLIC_API_URL` (default `http://localhost:3000`), JSON headers, `ApiError` type carrying `code`/`message`/`status`, a `NetworkError` type, and a `request<T>` helper typed by shared-types -- typed API foundation for 1.6/1.7/1.11
- [x] `apps/mobile/src/lib/keychain.ts` -- thin `expo-secure-store` wrapper: `saveTokens`, `loadTokens`, `clearTokens` (async, error-tolerant) -- keychain per NFR8/AD-8
- [x] `apps/mobile/src/lib/query-client.ts` -- TanStack Query `QueryClient` + AsyncStorage persister (AD-16) -- offline-cache baseline
- [x] `apps/mobile/src/components/ui/` -- base React Native Reusables primitives only (button, input, text, card) via `@react-native-reusables/cli` -- UI kit baseline
- [x] `packages/shared-types/src/auth.ts` -- add `MeResponse` (id, email, name, role, isActive, homeId), `RefreshRequest { refreshToken }`, `RequestPasswordResetRequest { email }`, `ConfirmPasswordResetRequest { token, newPassword }` -- single contract source (AD-2)
- [x] `apps/mobile` -- add Sentry init in the root layout using the `@sentry/react-native` pattern (AD-15); add `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_SENTRY_DSN` to `.env.example`
- [x] `apps/mobile` -- `pnpm install` at repo root and `typecheck` (add `tsc --noEmit` script) -- verifies the workspace resolves

**Acceptance Criteria:**
- Given a clean `pnpm install` at repo root, when `pnpm --filter @evergreen/mobile run typecheck` runs, then it passes with no errors and no missing-module complaints for `@evergreen/shared-types`.
- Given the DESIGN.md token block, when the NativeWind config is read, then `primary #1B853F`, `rounded.md 11px`, and `typography.hero` (Roboto 600/34px) are present with no hardcoded hex scattered in components.
- Given any future auth story code, when it needs a token, then it can only reach storage through `src/lib/keychain.ts` (expo-secure-store) — no direct AsyncStorage token usage anywhere.
- Given the API client, when a 429/401/network failure is parsed, then it returns an `ApiError` with the shared-types `code`/`message` or a `NetworkError` — never a raw `unknown`/`any`.
- Given `apps/mobile`, when its `package.json` is read, then `@evergreen/shared-types` is a `workspace:*` dependency and the scripts `dev/build/test/lint` are real Expo commands, not "not implemented yet" echoes.

## Design Notes

**RN Reusables installs via CLI, not npm.** There is no `react-native-reusables` npm package; the correct tool is `@react-native-reusables/cli` (v0.7.x), which generates primitives into the project. The `create-expo-app` default template already ships NativeWind 4 + expo-router, so the NativeWind wiring is mostly token config, not bootstrap.

**Implementation deviation (2026-08-10):** the CLI's `add` command is a TUI that requires a real terminal (prompts for `components.json` via clack) — it hangs silently under a non-interactive shell even with `-y`/stdin answers, and `winpty` fails without a console window. The four primitives (button, text, input, card) were instead written by hand following the RN Reusables NativeWind pattern (`src/components/ui/`), plus `src/lib/utils.ts` (`cn` via clsx + tailwind-merge) and `class-variance-authority`. Also required beyond the spec's version notes: `@tanstack/query-async-storage-persister` (v5 moved `createAsyncStoragePersister` out of `react-query-persist-client`), `react-native-css-interop` (peer of nativewind's `jsxImportSource` that Metro needs to resolve), and `eslint` itself (expo lint installs `eslint-config-expo` but not the binary).

**shared-types is plain-TS, so mobile consumes it directly.** Its `exports` point at `./src/index.ts` and it has no build step — Metro must be able to resolve TS from a workspace package. The SDK 57 default template's `metro.config.js` already watches `node_modules`; confirm the `pnpm-workspace.yaml` symlink (`packages/*`) is traversed, or add a `watchFolders`/`extraNodeModules` entry.

## Spec Change Log

- **2026-08-10 — bad_spec → patch (review finding #1):** Env var Sentry named `SENTRY_DSN` in the spec task, but Expo only inlines `EXPO_PUBLIC_*` into the client bundle — Sentry would never initialize at runtime. Amended spec task, `_layout.tsx`, and `.env.example` to `EXPO_PUBLIC_SENTRY_DSN`. Avoids a silent no-op Sentry (AD-15) that typecheck/lint/build cannot catch (they don't run the bundle). KEEP: fetch-based API client with ApiError/NetworkError; keychain module as sole owner of expo-secure-store; token classes in ONE NativeWind config.
- **2026-08-10 — patch (review finding #2):** `input.tsx` had a hardcoded `placeholderTextColor="#5C5C5C"`, violating the "no hardcoded hex scattered in components" AC. Removed it — the `placeholder:text-muted-foreground` class already carries the muted-foreground token (NativeWind 4 cssInterop covers RN core TextInput). Avoids hex drift from the DESIGN.md palette. KEEP: token-driven classes over inline colors.

## Deferred (manual review, subagents unavailable)

- keychain `saveTokens` uses `Promise.all` with no rollback — a single failed write leaves a partial pair (access saved, refresh not). Relevant when Story 1.6 stores a real token pair; consider sequential writes or a versioned payload.
- `request<T>` on a 200 with an empty body calls `response.json()` which throws a raw SyntaxError (untyped). No current endpoint returns 200-empty (logout/reset are 204, confirm-reset returns JSON), so deferred until one does.
- DESIGN.md fonts (Roboto/Oswald/Open Sans) are declared as tokens but not bundled via `expo-font`. Token classes resolve to the fallback sans until Story 1.6 loads fonts.

## Verification

**Commands:**
- `pnpm install` -- expected: succeeds, workspace resolves `@evergreen/shared-types`
- `pnpm --filter @evergreen/shared-types run typecheck` -- expected: passes
- `pnpm --filter @evergreen/mobile run typecheck` -- expected: passes (add `tsc --noEmit` script if template lacks it)
- `pnpm --filter @evergreen/mobile run lint` -- expected: passes

**Manual checks (if no CLI):**
- `apps/mobile/app/_layout.tsx` mounts QueryClientProvider + Sentry init before any screen.
- `apps/mobile/src/lib/keychain.ts` is the only module importing `expo-secure-store`.
- NativeWind config contains `typography.hero` and the full DESIGN.md color palette.

## Suggested Review Order

**Entry point & providers**

- Root layout composes providers (Query/SafeArea/Sentry) and gates on hydration
  [`_layout.tsx:17`](../../apps/mobile/src/app/_layout.tsx#L17)

**Data layer**

- Typed fetch wrapper: error envelope, 429/401 as ApiError, transport as NetworkError
  [`api.ts:50`](../../apps/mobile/src/lib/api.ts#L50)
- Keychain is the sole owner of expo-secure-store (NFR8/AD-8)
  [`keychain.ts:15`](../../apps/mobile/src/lib/keychain.ts#L15)
- TanStack Query client + AsyncStorage persister (AD-16)
  [`query-client.ts:8`](../../apps/mobile/src/lib/query-client.ts#L8)

**Design tokens & UI primitives**

- Single NativeWind config carrying all DESIGN.md tokens (UX-DR1)
  [`tailwind.config.js:3`](../../apps/mobile/tailwind.config.js#L3)
- Button with cva variants + text-class context, 44pt floor
  [`button.tsx:7`](../../apps/mobile/src/components/ui/button.tsx#L7)
- Card follows `rounded.md` + card-padding tokens
  [`card.tsx:14`](../../apps/mobile/src/components/ui/card.tsx#L14)
- Input: token placeholder color, `rounded-lg`, min touch target
  [`input.tsx:9`](../../apps/mobile/src/components/ui/input.tsx#L9)

**Contract types (AD-2)**

- Additive auth request/response types for Stories 1.6/1.7/1.11
  [`auth.ts:20`](../../packages/shared-types/src/auth.ts#L20)

**Build & workspace integration**

- Metro resolves the plain-TS workspace package + NativeWind
  [`metro.config.js:1`](../../apps/mobile/metro.config.js#L1)
- Workspace member: scripts real, shared-types via `workspace:*`
  [`package.json:1`](../../apps/mobile/package.json#L1)
