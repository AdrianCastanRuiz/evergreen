---
baseline_commit: d5f90b4684debdfc4950f754ff48b1ffc32b2fda
---

# Story 3.1: Home admin/staff gestiona contenido del home

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a home admin (or staff, where permitted),
I want to create, edit, publish, and delete content items for my care home,
so that families always see accurate, up-to-date news, documents, schedules, notices, static pages, and announcements.

## Acceptance Criteria

1. **Given** I am a home admin or staff member, **when** I create a content item of type `news`, `document`, `schedule`, `notice`, `static_page`, or `announcement` with a title and body, **then** a new `ContentItem` record is created scoped to my `home_id` with the given `type` enum value (FR51, AD-5).
2. **Given** a content item of type `document`, **when** I attach a file (a URL), **then** `attachmentUrl` is populated and the link is retrievable by family members with access to that item once published.
3. **Given** I submit an invalid `type` not among the defined enum values, **when** I save, **then** the request is rejected — `type` is a Prisma enum, never a free string; extending it requires a migration (AD-5).
4. **Given** a content item is in draft (`publishedAt` is `null`), **when** I publish it, **then** `publishedAt` is set and it becomes immediately visible to family members on the corresponding tab (Story 3.2's scope to render — this story only needs `publishedAt` to be a correct, queryable signal).
5. **Given** a published content item, **when** I edit it, **then** the changes are reflected immediately without needing to re-publish.
6. **Given** a content item, **when** I delete it, **then** it is removed and immediately disappears from the family view.
7. **Given** no content items exist yet of a given type, **when** I view that content editor tab, **then** I see the empty state "No content yet" with a primary "Create the first [x]" action (UX-DR22).
8. **Given** I attempt to create or edit content outside my `home_id`, **when** the request is made, **then** it is rejected server-side (NFR7, AD-1).
9. **Given** I am family, not staff or admin, **when** I attempt to access the content editor, **then** the request is rejected (AD-12).

## Tasks / Subtasks

- [x] Task 1: Backend — `content` module (AC #1, #2, #3, #4, #5, #6, #8, #9)
  - [x] Create `apps/api/src/content/dto/create-content-item.dto.ts` — `type` (`@IsEnum(ContentType)`, required), `title` (`@IsString @MinLength(1) @MaxLength(255)`, required), `body` (`@IsString @MinLength(1)`, required), `attachmentUrl` (`@IsOptional @IsUrl @MaxLength(2048)`, optional — genuinely a URL, not a Cloudinary public id like `Resident.profilePhotoPublicId`, so `@IsUrl()` is correct here where it wasn't there)
  - [x] Create `apps/api/src/content/dto/update-content-item.dto.ts` — `title?`, `body?` (same validators, optional), `attachmentUrl?` typed to accept `string | null` (bake in Story 2.1's review-learned `undefined`-vs-`null` distinction from day one: `undefined` = field not sent, leave untouched; `null` = explicit clear). **Deliberately excludes `type`** — no AC requires changing an item's type after creation, and the module's admin UI is organized per-type-tab, so re-typing an existing item has no clear affordance; if a future story needs this, it's a new AC, not an oversight here.
  - [x] Create `apps/api/src/content/dto/query-content.dto.ts` for `GET /content` — `type?` (`@IsOptional @IsEnum(ContentType)`), `page?` (`@IsOptional @Type(() => Number) @IsInt @Min(1)`, default 1 in the service), `pageSize?` (`@IsOptional @Type(() => Number) @IsInt @Min(1) @Max(100)`, default 20). This is the API's **first** endpoint to use `@Query()` — no existing controller does (`app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))` in `apps/api/src/main.ts` already has `transform: true`, so the `@Type(() => Number)` coercion from query-string to number works without extra setup).
  - [x] Create `apps/api/src/content/content.service.ts`: `create`, `findAll(query)` — **paginated**, `findOne`, `update` (with the `null`-vs-`undefined` `attachmentUrl` handling), `publish`, `remove` — all via `this.prisma.client.contentItem.*`, no manual `home_id` filtering (`ContentItem` is already in `TENANT_SCOPED_MODELS`, confirmed — see Dev Notes)
  - [x] Create `apps/api/src/content/content.controller.ts`: `@Controller('content')`, `@Roles('admin', 'staff')` at class level (**not** admin-only — see Dev Notes on why this differs from `ResidentsController`), routes `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `POST /:id/publish`, `DELETE /:id`
  - [x] Create `apps/api/src/content/content.module.ts`, register in `AppModule.imports` (`apps/api/src/app.module.ts`)
  - [x] Unit tests: `content.service.spec.ts` (mock `PrismaService`, same shape as `apps/api/src/residents/residents.service.spec.ts`) — cover the `attachmentUrl: null`-clears-vs-`undefined`-leaves-untouched branches directly (don't wait for review to catch it, per Story 2.1's own history)
  - [x] E2e test: `apps/api/test/content-manage-home.e2e-spec.ts` (pattern: `apps/api/test/residents-manage-home.e2e-spec.ts`) — covers AC #3 (invalid type → 400), AC #7 (empty list per type), AC #8 (cross-home 404, not 200-with-someone-else's-data), AC #9 (403 for `family`), plus a pagination-envelope shape assertion (`{ data, meta: { page, pageSize, total } }`) since this is the first endpoint to actually emit it
- [x] Task 2: Shared types (AC #1, #2, #4)
  - [x] Add `packages/shared-types/src/content.ts`: `ContentType` (string union, mirrors `packages/shared-types/src/common.ts`'s existing `Role` mirroring convention — the API's Prisma enum is never imported into shared-types), `ContentItem`, `CreateContentItemRequest`, `UpdateContentItemRequest` interfaces; export from `index.ts`
  - [x] `GET /content`'s response type is `PaginatedResponse<ContentItem>` — **already declared** in `packages/shared-types/src/common.ts` but **never yet consumed by any endpoint** (every list endpoint so far — `GET /residents`, `GET /users`, `GET /residents/:id/family-links` — returns a bare array, not the `{ data, meta }` envelope the architecture's Consistency Conventions table actually specifies for "every list endpoint"). This story is the first to follow the documented convention for real. **Do not retrofit the older endpoints** — that's a separate, pre-existing gap, out of this story's scope.
- [x] Task 3: Frontend — Content screen in `apps/admin` (AC #1, #2, #4, #5, #6, #7)
  - [x] Add `apps/admin/src/routes/content.tsx`: route under `protectedLayoutRoute`, register in `apps/admin/src/router.ts` (same pattern as `residentsRoute`)
  - [x] Wire the existing "Content" `sidebar-nav.tsx` entry: it already exists with `roles: ["admin", "staff"]` but **no `to`** (unwired, same state "Residents" was in before Story 2.1) — add `to: "/content"`, following the exact precedent comment in that file ("Once a section gets a real route, set `to` instead and drop `disabled`")
  - [x] Build a tabbed content editor: one tab per `ContentType` (News, Documents, Schedules, Notices, Static Pages, Announcements — a `TYPE_LABELS: Record<ContentType, string>` map for both tab labels and the per-type empty-state "Create the first [x]" text, e.g. "Create the first news post"). Each tab calls `GET /content?type=<X>`, scoped by the active tab — do not fetch all types at once and filter client-side, the backend already filters.
  - [x] Empty state per tab: "No content yet" + primary "Create the first [x]" button (UX-DR22, EXPERIENCE.md's State Patterns table — same pattern as Story 2.1's Residents empty state). **Bake in Story 2.1's own review finding proactively**: the "Create the first [x]" / "Add" button must stay visible on a transient list-load *error* too, not just on an empty *success* result — copy the exact visibility condition Story 2.1 landed on (`residentsQuery.isError || (data && data.length > 0)`), don't let this story rediscover the same bug.
  - [x] Create/edit dialog (reuse `Dialog`/`Label`/`Input`/`Button` primitives already installed — no new shadcn components needed for the form itself): `title`, `body` (plain `<textarea>` — no rich-text/markdown editor exists in this codebase and none is required by any AC), `attachmentUrl` (plain URL input, shown only for the `document` tab per AC #2 — optional on every other type at the API level, but don't surface the field where no AC calls for it). `type` is **not** a form field — it's implicit from which tab's "Create the first..." / "Add" button was clicked.
  - [x] **Bake in Story 2.1's double-submit-guard review finding proactively**: `handleSubmit` must `return` synchronously on `mutation.isPending` before any state update, exactly like `ResidentForm` in `residents.tsx` — don't rely on `disabled={mutation.isPending}` alone (it lags a render behind a fast second click).
  - [x] Publish action: a "Publish" button on a draft item (`publishedAt === null`), calling `POST /content/:id/publish`; a published item shows a "Published" indicator instead (no unpublish action — no AC calls for one). Edit stays available regardless of publish state (AC #5).
  - [x] Delete action: reuse the `AlertDialog` confirm pattern from `residents.tsx`'s "Remove" family-link button — same established convention for this class of destructive action in this app, don't invent a bare `window.confirm` or a second confirm pattern.
  - [x] Call the API via `authedRequest` from `apps/admin/src/lib/api.ts` — do not build a parallel fetch path. `path` is a plain string, so append the query string directly (e.g. `` `/content?type=${type}&page=${page}` ``) — no existing query-building helper to reuse or duplicate.
- [x] Task 4: Verification
  - [x] Run the **real** compile, not just `jest`/`eslint`: `npx nest build` (or `npx tsc -b --noEmit -p tsconfig.build.json`) for `apps/api`. Story 2.1 shipped with a `homeId`-missing bug that `jest`/`eslint`/an ad-hoc `tsc --noEmit` all missed — only `nest start`'s real `ts-loader` compile caught it, post-`done`, while booting the dev server. Do this **before** marking the story done, not after.
  - [x] `npx vite build` for `apps/admin` (same reasoning — a real production build catches what dev-mode HMR papers over).
  - [x] Per the Epic 2 retrospective's new action item: **manually smoke-test the Content screen** (create, publish, edit, delete, empty state per tab) — this story is admin-portal-only, so the "no browser extension" gap that affected Epic 2 doesn't block this the way it blocked mobile; if a browser tool is available this session, use it before marking the story done. If not, say so explicitly in Completion Notes, same as every Epic 2 story did.

### Review Findings

Reviewed 2026-09-12 by 3 parallel layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor) against this story's spec. 0 decision-needed, 6 patch, 5 defer, 8 dismissed.

- [x] [Review][Patch] `ContentService.update()`'s `attachmentUrl` ternary is a no-op identity expression (`dto.attachmentUrl === undefined ? undefined : dto.attachmentUrl` always equals `dto.attachmentUrl`) — simplify to a plain assignment [apps/api/src/content/content.service.ts]
- [x] [Review][Patch] `update`/`publish`/`remove` don't catch a concurrent-delete race between their `findOne` check and the mutating call — an unhandled Prisma `P2025` would surface as a raw 500 instead of a clean 404 [apps/api/src/content/content.service.ts]
- [x] [Review][Patch] Tab row uses `role="tablist"`/`role="tab"`/`aria-selected` with no keyboard navigation or `aria-controls` — promises ARIA tab semantics assistive tech doesn't get; remove the misleading roles rather than half-implement them [apps/admin/src/routes/content.tsx]
- [x] [Review][Patch] `PublishButton`/`DeleteItemButton` have no `onError` handler (a failed publish/delete fails silently) and rely only on `disabled={mutation.isPending}` for the double-submit guard Story 2.1 already learned needs a synchronous `if (mutation.isPending) return` [apps/admin/src/routes/content.tsx]
- [x] [Review][Patch] `ContentForm` validates `title` client-side (inline "required" error) but not `body`, even though both are equally required by the API — add the same inline guard for `body` [apps/admin/src/routes/content.tsx]
- [x] [Review][Patch] `content-manage-home.e2e-spec.ts`'s `seedContentItem` hand-rolls a local `ContentType` union instead of importing the real enum — a future enum rename wouldn't fail this test at compile time [apps/api/test/content-manage-home.e2e-spec.ts]
- [x] [Review][Defer] Whitespace-only `title`/`body` passes `@MinLength(1)` (no `@Transform` trim) — deferred, pre-existing: `CreateResidentDto.name` has the identical untrimmed-string gap already merged, no project-wide trim convention exists for non-email fields
- [x] [Review][Defer] Admin Content screen has no pagination UI beyond the API's default `pageSize=20` — deferred, no AC requires it; the pagination envelope is in place so adding a "load more" control later is non-breaking
- [x] [Review][Defer] `ContentController.assertHomeContext()` only checks `homeId`, not `userId`, before `create()` non-null-asserts `getUserId()!` — deferred, mirrors `ResidentsController`'s identical precedent (non-null-asserts `getHomeId()!` the same way); no reachable path found where an authenticated admin/staff request has `homeId` set without `userId`
- [x] [Review][Defer] No frontend automated tests for `content.tsx` (dialog, tab switching, publish/delete) — deferred, pre-existing: `apps/admin` has zero frontend test files anywhere (confirmed), same gap `residents.tsx` already has
- [x] [Review][Defer] `findAll`'s `findMany`/`count` run as two non-atomic queries, so `meta.total` can drift under concurrent writes — deferred, standard pagination tradeoff, not a defect

**Dismissed (8):** `attachmentUrl` settable server-side on any type regardless of the UI's document-only field (matches Dev Notes' explicit intent — API-level optionality on every type is deliberate); `assertHomeContext()` repeated per controller method (mirrors `ResidentsController`'s identical, already-reviewed convention); unconstrained `@IsUrl()` protocol allowlist (class-validator's default `protocols` list already excludes non-http(s)/ftp schemes like `javascript:`); no `key` prop on `ContentForm` (mirrors `ResidentsController`'s `ResidentForm`, same non-issue given the dialog fully unmounts between items); redundant explicit `@HttpCode(HttpStatus.CREATED)` on `POST /` (mirrors `ResidentsController`'s identical precedent); the Acceptance Auditor's claim that "no console errors" is contradicted by a Radix `DialogContent`-without-`Description` warning (refuted — `read_console_messages` was actually run against the live smoke-test tab and returned only vite/React-DevTools debug/info entries, zero warnings/errors); the Acceptance Auditor's doubt that the Claude-in-Chrome smoke-test claim is credible, citing a stale session memory note from 2026-08-24 saying the extension wasn't connected (refuted — the extension was confirmed connected and used earlier in this same session, evidenced by real screenshots of the demo site and of the live create/publish/edit/delete flow against `localhost:5173/content`).

## Dev Notes

### Ground truth already confirmed — no migration needed, no `TENANT_SCOPED_MODELS` gap

Unlike Story 2.2's `FamilyLink` (which was missing from `TENANT_SCOPED_MODELS` and had to be added), **`ContentItem` is already fully modeled, migrated, and registered**:
- `apps/api/prisma/schema.prisma`'s `ContentItem` model already has every field the ACs need: `id`, `homeId`, `type` (`ContentType` enum), `title`, `body`, `attachmentUrl` (nullable), `publishedAt` (nullable — this **is** the draft/published signal, no separate status field), `createdById`, `createdAt`, `updatedAt`. The `ContentType` enum (`news | notice | announcement | static_page | document | schedule`) is already defined.
- `apps/api/src/prisma/tenant-scoped-models.ts` already includes `'ContentItem'` — confirmed by direct read. Every `this.prisma.client.contentItem.*` call is auto-scoped to the caller's `home_id` by the tenant-scoping Prisma extension, same as `ResidentsService`. No manual `home_id` filter, no extension registration needed.
- No `apps/api/src/content/` directory exists yet — this is a real new module, matching `ARCHITECTURE-SPINE.md`'s Source Tree, which already names it: `content/ # generic ContentItem (AD-5) — news/notice/announcement/static_page/document/schedule only`.

### Role scoping: `@Roles('admin', 'staff')`, not admin-only — this differs from `ResidentsController`

The PRD's FR51 text says only "Home admins can manage content," but the epic's own AC #9 ("Given I am family, **not staff or admin**...") and — more concretely — `apps/admin/src/components/layout/sidebar-nav.tsx`'s `NAV_SECTIONS` **already ships** a "Content" entry with `roles: ["admin", "staff"]` (unwired, no `to` yet — this story wires it). That entry's own comment states the intended split explicitly: *"home admin manages their own home's users/residents/content/events/menu... staff uploads/manages content for their home but never user/role management."* Follow what's already shipped in the nav, not the PRD's narrower one-line FR summary — `@Roles('admin', 'staff')` at the controller's class level, same shape as `ResidentsController`'s `@Roles('admin')` but with one more role. Do not restrict to `admin`-only; that would strand the already-shipped nav entry the same way Story 2.1's Review Finding caught for the old "Residents" nav entry showing to `staff` with an admin-only backend — this time in the opposite direction (backend too narrow, not the nav too broad).

### File attachment: a plain URL field, no upload pipeline — deliberate scope limit, mirrors Story 2.1's precedent

No Cloudinary integration exists anywhere in this codebase yet (confirmed: no `cloudinary` dependency in `apps/api/package.json`, no reference in `apps/api/src`). Epic 4 (Photos) — which owns the signed-upload flow per `AD-4` and the Architecture Spine's Capability Map — hasn't started (`sprint-status.yaml`: `epic-4: backlog`). AC #2 only requires that `attachmentUrl` be *populated and retrievable* — it does not require building an upload UI. Treat `attachmentUrl` exactly the way Story 2.1 treated `Resident.profilePhotoPublicId`: an optional field the admin pastes (a link to an already-hosted file — e.g. a Google Drive/Dropbox share link, or a future Cloudinary URL once Epic 4 ships) or leaves blank. **Do not build any upload/signing plumbing here** — that is Epic 4's scope entirely, not this story's, and building it early would be exactly the kind of speculative work Story 2.3's Dev Notes explicitly warned against for an analogous case (Photos-tab placeholder data-fetching). The one difference from `profilePhotoPublicId`: this field genuinely is a URL, not an opaque Cloudinary id, so `@IsUrl()` is the correct validator here (`profilePhotoPublicId` deliberately used `@IsString()` since a Cloudinary public id is not itself a URL).

### Pagination: this is the first endpoint to actually use the documented envelope

`ARCHITECTURE-SPINE.md`'s Consistency Conventions table states, for **every** list endpoint (except CSV export): `{ data: [...], meta: { page, pageSize, total } }`. `packages/shared-types/src/common.ts` already declares `PaginatedResponse<T>`/`PaginationMeta` for exactly this — but **no shipped endpoint uses it yet**: `GET /residents`, `GET /users`, `GET /residents/:residentId/family-links` all return bare arrays, a pre-existing gap from Epic 1/2 that this story does not need to fix. `GET /content` is a good candidate to finally follow the documented convention for real, since a home's content list (years of news/notices/documents) can plausibly outgrow the small, bounded lists (residents, staff) the prior bare-array endpoints serve. Implement `findAll` with real `skip`/`take`/`count` against `this.prisma.client.contentItem`, defaulting `page=1`, `pageSize=20` when omitted from `query-content.dto.ts`.

### Publish is a dedicated action, not a PATCH field

AC #4's "publish" and AC #5's "edit a published item" are two different operations with two different endpoints: `POST /content/:id/publish` sets `publishedAt` (only when currently `null` — calling it again on an already-published item is a harmless no-op, not an error, which avoids a surprising timestamp jump from an accidental double-click). `PATCH /content/:id` never touches `publishedAt` — editing a draft leaves it a draft, editing a published item leaves it published, satisfying AC #5's "no need to re-publish" without any special-casing in `update()`.

### `type` is immutable after creation

No AC requires changing an existing item's type, and the frontend UI is organized as one tab per type with no obvious affordance to "move" an item between tabs. `UpdateContentItemDto` deliberately has no `type` field. If this needs to change later, it's a new AC — don't guess ahead of it.

### Frontend precedent to follow exactly: `apps/admin/src/routes/residents.tsx`

This is Epic 3's first story, same shape as Story 2.1 (Epic 2's first story) — a brand-new tenant-scoped module with a brand-new admin-portal screen. `residents.tsx` is the closest and most complete precedent, **already carrying its own code-review's lessons baked in**: the double-submit synchronous re-entrancy guard, the "primary action button stays visible on a list-load error" fix, the `AlertDialog` confirm pattern for destructive actions, and the `usersQuery.isError`-must-have-its-own-branch fix (relevant here too if this story's dialog ever needs a secondary list query). Task 3 above calls these out individually so this story ships with them from the start rather than needing its own review round to rediscover each one.

### Testing

- Unit: mock `PrismaService` exactly like `apps/api/src/residents/residents.service.spec.ts`.
- E2e: model on `apps/api/test/residents-manage-home.e2e-spec.ts` for the AC #8 cross-home-404 and AC #9 role-403 shape. This story additionally needs a pagination-envelope assertion (new territory — no existing e2e spec asserts a `{ data, meta }` shape today, since no endpoint returns one yet).
- No mobile changes in this story (Story 3.2 owns the family-facing consumption side) — the Epic 2 retro's new "manual mobile smoke-test before done" action item does not apply here.

### Project Structure Notes

- New backend module: `apps/api/src/content/` (matches `ARCHITECTURE-SPINE.md`'s Source Tree).
- Register `ContentModule` in `apps/api/src/app.module.ts`'s `imports` array, alongside `ResidentsModule`.
- New frontend route: `apps/admin/src/routes/content.tsx`, added as a child of `protectedLayoutRoute` in `apps/admin/src/router.ts`.
- Edit (not create): `apps/admin/src/components/layout/sidebar-nav.tsx` (add `to: "/content"` to the existing "Content" entry — do not touch the "Events"/"Menu" entries, which stay unwired until their own epics).
- **shadcn CLI gotcha on this Windows checkout** (known issue, not this story's bug — see Story 2.1's Dev Notes): the CLI sometimes writes new components to a stray `./@/` folder at the repo root instead of `apps/admin/src/`. This story shouldn't need any new shadcn primitives (`dialog`, `label`, `input`, `button`, `alert-dialog` are all already installed from Story 2.1/2.2) — if one turns out to be needed, check for this after running `npx shadcn add <component>`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.1] — AC source (verbatim above)
- [Source: ARCHITECTURE-SPINE.md#AD-5] — `ContentItem` generic table, `ContentType` enum, menus explicitly excluded
- [Source: ARCHITECTURE-SPINE.md#AD-1] — tenant isolation mechanism (Prisma extension + RLS), no manual `home_id` filtering
- [Source: ARCHITECTURE-SPINE.md#AD-12] — `@Roles(...)` / `RolesGuard`, no inline role-string comparisons
- [Source: ARCHITECTURE-SPINE.md#Consistency Conventions] — pagination envelope (`{ data, meta }`), the convention this story is first to actually follow
- [Source: ARCHITECTURE-SPINE.md#Source Tree] — `apps/api/src/content/` target location
- [Source: apps/api/prisma/schema.prisma#ContentItem] — existing model, already migrated, verbatim field list above
- [Source: apps/api/src/prisma/tenant-scoped-models.ts] — confirmed `ContentItem` already present
- [Source: apps/api/src/main.ts] — global `ValidationPipe({ whitelist: true, transform: true })`, needed for the query-DTO's numeric coercion
- [Source: apps/api/src/residents/residents.controller.ts, residents.service.ts] — closest existing controller/service pattern (tenant-scoped module, no bypass)
- [Source: apps/admin/src/routes/residents.tsx] — closest existing frontend pattern, already carrying its own review-learned fixes to replicate proactively
- [Source: apps/admin/src/components/layout/sidebar-nav.tsx] — "Content" nav entry already exists (`roles: ["admin", "staff"]`), unwired; resolves the role-scoping question the PRD alone leaves ambiguous
- [Source: packages/shared-types/src/common.ts] — `PaginatedResponse<T>`, `Role`-mirroring convention to follow for `ContentType`
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-evergreen-2026-07-01/EXPERIENCE.md#State Patterns] — "No content yet" / "Create the first [x]" empty-state copy (verbatim)
- [Source: _bmad-output/implementation-artifacts/2-1-admins-crean-y-gestionan-perfiles-de-residentes-por-care-home.md] — the "post-done, nest-build-only bug" lesson driving Task 4's verification step
- [Source: _bmad-output/implementation-artifacts/epic-2-retro-2026-09-10.md] — Action Item 2 (manual UI smoke-test), noted as not applicable to mobile here but worth doing for this admin screen if a browser tool is available

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- Branch: `feature/3-1-home-admin-staff-gestiona-contenido-del-home`
- Confirmed `ContentItem`/`ContentType` were already fully migrated (schema.prisma:169-186, 31-40) and `ContentItem` already in `TENANT_SCOPED_MODELS` before writing any code — no migration, no extension registration needed, matching the Dev Notes.
- `nest build` and `vite build` (Task 4) both ran clean on the first attempt except one `tsc -b` (admin's `typecheck` script, stricter than `vite build`'s esbuild transform) catching an unused `formatError` import in `content.tsx` — removed; not a repeat of Story 2.1's `homeId`-missing class of bug, just an unused-import lint-adjacent error `vite build` doesn't check for.
- Manual smoke-test done via Claude-in-Chrome (connected this session) against the local dev stack (Postgres via `docker compose`, `nest start --watch`, `vite`) logged in as `admin@evergreen.test` (`apps/api/scripts/seed-demo-family.ts`).

### Completion Notes List

- **AC #1, #3, #8, #9:** `ContentService`/`ContentController` (`apps/api/src/content/`) — tenant-scoped via the existing Prisma extension, no manual `home_id` filtering. `@Roles('admin', 'staff')` at class level (not admin-only), per the Dev Notes' rationale (the already-shipped `sidebar-nav.tsx` entry + AC #9 only excluding `family`).
- **AC #2:** `attachmentUrl` is a plain optional `@IsUrl()` string field, no upload pipeline (Epic 4's scope) — verified end-to-end: created a `document` item with a URL, it round-tripped and rendered as a clickable "Attachment" link in the admin UI.
- **AC #4, #5:** `POST /content/:id/publish` is a dedicated action (idempotent no-op on an already-published item, unit-tested) separate from `PATCH /content/:id`, which never touches `publishedAt` — manually verified editing a published item's title leaves it "Published", no re-publish needed.
- **AC #6, #7:** delete removes the row immediately (e2e + manual); empty-state "No content yet" + "Create the first [x]" verified per-tab in the browser (News and Documents both checked empty → populated → empty again).
- **Pagination envelope:** `GET /content` is the first endpoint in this codebase to actually emit `{ data, meta: { page, pageSize, total } }` per `ARCHITECTURE-SPINE.md`'s Consistency Conventions — implemented with real `skip`/`take`/`count`, defaults `page=1`/`pageSize=20`. Deliberately did not retrofit `GET /residents`/`GET /users`/family-links (pre-existing gap, out of scope).
- **Shared types:** `packages/shared-types/src/content.ts` mirrors the API's `ContentType` enum as a string union (never imports the Prisma enum), following `Role`'s existing convention. `apps/api` itself declares its own local `PaginatedContentItems` interface (mirroring `common.ts`'s `PaginatedResponse<T>`) rather than importing shared-types at runtime — apps/api never actually imports from `@evergreen/shared-types` anywhere in this codebase, confirmed before choosing this shape.
- **Frontend:** `apps/admin/src/routes/content.tsx` — one tab per `ContentType`, each fetching `GET /content?type=<X>` independently (no client-side filtering of an all-types fetch). Baked in Story 2.1's three review-learned fixes proactively: the "Create the first/Create a…" button stays visible on a list-load error, the `handleSubmit` synchronous re-entrancy guard, and the `AlertDialog` confirm pattern for delete. `attachmentUrl` only renders as a form field on the `document` tab. No new shadcn primitives — the type-tab row is a plain button row (`role="tablist"`), since no `Tabs` component is installed and none of the ACs need more than an active/inactive state.
- **Verification:** `apps/api` unit 170/170 passing (17 new for `ContentService`); `apps/api` e2e 67/67 passing (10 new for `content-manage-home.e2e-spec.ts`, covering AC #3/#7/#8/#9 plus the pagination envelope); real `nest build` clean; real `vite build` clean; `apps/admin` `typecheck`/`lint` clean. Manually smoke-tested the Content screen end-to-end via Claude-in-Chrome (browser extension was connected this session) — create, publish, edit-while-published, delete with confirm, and empty state on two different tabs all behaved correctly, no console errors.
- **Not built (deliberately, per Dev Notes):** no file-upload/Cloudinary pipeline (Epic 4's scope), no `type` re-assignment after creation, no unpublish action, no admin-side pagination controls (no AC requires them; the API's envelope supports adding them later without a breaking change).

### File List

- New: `apps/api/src/content/dto/create-content-item.dto.ts`
- New: `apps/api/src/content/dto/update-content-item.dto.ts`
- New: `apps/api/src/content/dto/query-content.dto.ts`
- New: `apps/api/src/content/content.service.ts`
- New: `apps/api/src/content/content.controller.ts`
- New: `apps/api/src/content/content.module.ts`
- New: `apps/api/src/content/content.service.spec.ts`
- New: `apps/api/test/content-manage-home.e2e-spec.ts`
- New: `packages/shared-types/src/content.ts`
- Edit: `packages/shared-types/src/index.ts` (export `./content`)
- Edit: `apps/api/src/app.module.ts` (register `ContentModule`)
- New: `apps/admin/src/routes/content.tsx`
- Edit: `apps/admin/src/router.ts` (register `contentRoute`)
- Edit: `apps/admin/src/components/layout/sidebar-nav.tsx` (wire "Content" entry's `to: "/content"`)

## Change Log

- 2026-09-12: Implemented Story 3.1 — `content` backend module (AC #1-#9), shared types, tabbed admin Content screen (AC #1, #2, #4, #5, #6, #7). Manually smoke-tested via Claude-in-Chrome. Status → review.
- 2026-09-12: Code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor) — 6 patches applied (no-op ternary simplified, `update`/`publish`/`remove` now map a concurrent-delete race to 404 instead of a raw 500, removed misleading ARIA tab roles, `Publish`/`Delete` now surface failures + guard against double-submit, `ContentForm` validates `body` client-side same as `title`, e2e test imports the real `ContentType` enum instead of duplicating it), 5 pre-existing gaps deferred to `deferred-work.md`, 8 findings dismissed (2 of which were refuted with direct evidence from this session's own browser verification). All 173 unit + 67 e2e tests passing, `nest build`/`vite build`/`tsc -b`/`eslint` all clean. Status → done.
