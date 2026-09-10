---
baseline_commit: d5f90b4684debdfc4950f754ff48b1ffc32b2fda
---

# Story 3.2: Familia ve el contenido publicado de su home

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a family member,
I want to view news, documents, schedules, notices, static pages, and announcements for my care home,
so that I stay informed without calling reception.

## Acceptance Criteria

1. **Given** published news posts exist for my home, **when** I open the News tab, **then** I see them listed using the `event-list-item`/`card` row shape — title + meta, no date badge (FR13, UX-DR20).
2. **Given** published documents exist, **when** I view the News tab, **then** I see them listed the same way, and tapping one opens the attached URL (FR14).
3. **Given** published schedules, notices, static pages, or announcements exist, **when** I view the News tab, **then** I see them rendered with the same reused row/card shape (FR16, FR17, FR18, FR19) — see Dev Notes ("Where do the other 4 content types render?") for why this story renders all six types in one combined feed rather than six separate screens.
4. **Given** no content of any type has been published yet for my home, **when** I open the News tab, **then** I see the empty state "Nothing posted yet" (UX-DR22).
5. **Given** the screen is cold-loading, **when** data hasn't arrived yet, **then** skeleton rows matching the expected layout are shown (UX-DR30).
6. **Given** I pull to refresh on the News tab, **when** I release, **then** the list re-fetches the latest published items (UX-DR31).
7. **Given** I attempt to view content from a different home, **when** the request is made, **then** it is rejected server-side (NFR7, AD-1) — enforced by home-scoping, not a per-item guard (see Dev Notes).
8. **Given** a content item is unpublished (draft) or deleted, **when** I view the News tab, **then** it never appears — only published items are visible to family, regardless of what an admin/staff view of the same home would show.

## Tasks / Subtasks

- [ ] Task 1: Backend — open `GET /content`/`GET /content/:id` to family, published-only (AC #1, #2, #3, #4, #7, #8)
  - [ ] Extend `apps/api/src/content/content.controller.ts` (built by Story 3.1): change `GET /content` and `GET /content/:id` from `@Roles('admin', 'staff')` (class-level, inherited) to method-level `@Roles('admin', 'staff', 'family')` — every write route (`POST /`, `PATCH /:id`, `POST /:id/publish`, `DELETE /:id`) stays admin/staff-only via the class-level decorator, unchanged. This is the same method-level-override-of-a-class-level-decorator shape Story 2.3 used to open `GET /residents/:id` to family while `POST/PATCH /residents` stayed admin-only.
  - [ ] In `apps/api/src/content/content.service.ts`'s `findAll`/`findOne` (built by Story 3.1 — **read its actual shipped shape first**, this story's predictions are based on 3.1's story file, not merged code, since 3.1 was still `ready-for-dev` with zero implementation when this story was written — same caveat Story 2.2's Dev Notes carried relative to unbuilt Story 2.1), add a `callerRole` (or equivalent) parameter/check: when the caller is `family`, force `publishedAt: { not: null }` into the Prisma `where` clause regardless of any client-supplied filter — **never trust a query param to hide drafts from family**, this is authorization-shaping business logic, not the tenant-scoping extension's job (that extension only handles `home_id`, not publish status). Admin/staff continue to see drafts and published items both, unchanged.
  - [ ] No `FamilyResidentGuard` involved — content is home-scoped, not resident-scoped (AD-11's guard is for `Resident`/`FamilyLink`-backed access only). AC #7's cross-home rejection is enforced by the tenant-scoping Prisma extension's normal `home_id` auto-injection, the same mechanism that already protects every other tenant-scoped model — nothing new to build here, but Task 3 below is what makes it actually reachable for a family caller (see next bullet).
  - [ ] **Critical, easy-to-miss prerequisite**: a family JWT carries no fixed `home_id` (`AuthService.resolveFixedHomeId` returns `null` for `family`, confirmed in `apps/api/src/auth/auth.service.ts`). The tenant-scoping extension needs a `home_id` in the `AsyncLocalStorage` store before `contentItem.findMany`/`findUnique` can run for a family caller — that comes from `TenantContextMiddleware`'s existing `resolveFamilyActiveHomeId`, which reads the `X-Active-Home-Id` request header and validates it against the caller's `HomeMembership` rows (`apps/api/src/common/tenant/tenant-context.middleware.ts:61-103` — **this mechanism already exists and is already wired into every request**, built before this story, but **no client has ever sent this header yet** — Story 2.3's own Completion Notes confirm "family callers carry `homeId = null` in the tenant store (no `X-Active-Home-Id` header from mobile)" because `/residents/linked` and the guarded single-resident read both used `tenantContext.runBypassed()` instead, sidestepping the header entirely. This story is the **first** to actually need the mobile client to send it — see Task 2.
- [ ] Task 2: Backend + shared-types — expose `homeId` on `LinkedResident` (AC #7 prerequisite, mobile can't build the header without it)
  - [ ] `apps/api/src/residents/residents.service.ts`'s `findLinkedForUser` (built by Story 2.3) selects `id`, `name`, `room`, `dob`, `profilePhotoPublicId` from the joined `resident` — add `homeId: true` to that `select` and `homeId: link.resident.homeId` to the mapped return object.
  - [ ] `packages/shared-types/src/residents.ts`'s `LinkedResident` interface — add `homeId: string`.
  - [ ] Unit test: extend `apps/api/src/residents/residents.service.spec.ts`'s `findLinkedForUser` describe block to assert `homeId` is present on the returned shape.
  - [ ] This is a small, surgical extension to a Story-2.3-owned file, not a rebuild — do not touch `findLinkedForUser`'s query shape otherwise.
- [ ] Task 3: Shared types — `content.ts` mobile-facing additions (AC #1-#8)
  - [ ] `packages/shared-types/src/content.ts` (created by Story 3.1) already has `ContentType`/`ContentItem`. No new interface needed for the family read path — `ContentItem` and `PaginatedResponse<ContentItem>` (from `common.ts`) are shape-compatible for both admin and family callers; family callers simply always receive a `publishedAt`-non-null subset. Confirm this when 3.1 has actually shipped rather than assuming; flag a gap here in Completion Notes if 3.1's shipped `ContentItem` type diverges.
- [ ] Task 4: Mobile — active-resident-home header plumbing (AC #7 prerequisite)
  - [ ] `apps/mobile/src/lib/resident-context.tsx`'s `useResidents()` hook already exposes `activeResidentId` and the full `residents` list. Add a derived value (e.g. `activeResidentHomeId`, computed via `residents?.find(r => r.id === activeResidentId)?.homeId`) — either inline at each call site or added to `ResidentContextValue` if more than one screen ends up needing it (this story only has one caller — the News tab — so start with a local derivation in that screen unless a second consumer appears; don't widen the shared context speculatively).
  - [ ] Every `/content` call from mobile must pass `headers: { "X-Active-Home-Id": activeResidentHomeId }` via `authedRequest`'s existing `headers` option (`apps/mobile/src/lib/api.ts` — no change needed to `api.ts` itself, this option already exists and is unused so far). Gate the query with `enabled: !!activeResidentHomeId` (same pattern `resident-context.tsx` already uses to gate on `status === "authenticated"`) so it never fires with an empty header while residents are still loading.
  - [ ] **Edge case worth a deliberate, documented decision, not a guess**: a family member linked to residents across *different* homes (EXPERIENCE.md's IA explicitly describes this — "a mother in Sunrise Lodge and a father in Evergreen Heights") would see the News tab's content scoped to whichever resident is currently active, re-fetching when the active resident switches homes — exactly mirroring how Photos/Events/Menu already re-scope on resident switch per Story 2.3's AC #3. No new "home switcher" UI component exists yet (EXPERIENCE.md mentions one conceptually but it isn't built) — this story does **not** build one; it reuses the existing resident-switcher's side effect (switching resident already switches the effective home for every re-scoped tab) rather than inventing a parallel home-switching control. If a future story needs an explicit home switcher independent of resident switching, that's new scope, not an oversight here.
- [ ] Task 5: Mobile — build the real News tab (AC #1-#6)
  - [ ] Replace `apps/mobile/src/app/(tabs)/news.tsx`'s placeholder (currently a bare `<EmptyState title="News" body="Nothing posted yet." />`, explicitly commented "the home's published news posts land in Epic 3 (Story 3.2)" — this is exactly the file this story finishes).
  - [ ] Fetch via TanStack Query (AD-16, same pattern as `resident-context.tsx`): `authedRequest<PaginatedResponse<ContentItem>>(\`/content\`, { headers: { "X-Active-Home-Id": activeResidentHomeId } })`. Start with `pageSize` large enough to avoid building pagination UI this story doesn't need (no AC calls for a "load more"/infinite-scroll interaction) — e.g. request `pageSize=50` and don't implement a second page fetch; if a home's content ever exceeds that, that's a future story's problem, flag it in Completion Notes rather than over-building pagination UI speculatively.
  - [ ] Render each item as a row reusing the `event-list-item`/`card` shape per DESIGN.md's "News & Documents (populated state)" spec (verbatim: *"reuses `event-list-item`'s card-row shape (title in `{typography.heading-sm}`, date/meta in `{typography.caption}`) without the date badge, or plain `card` for longer document/notice entries"*) — no dedicated per-type component, same "honest reuse" DESIGN.md calls for. `apps/mobile/src/components/` has no existing `event-list-item` component yet (Events tab is still a Story-1.10 placeholder, per Story 2.3's own Dev Notes) — build the minimal row shape directly in this story rather than waiting on Epic 5 to build a shared component neither story strictly needs yet; if Epic 5 later extracts a shared `EventListItem`, that's a refactor for that story, not a blocker for this one.
  - [ ] Tap behavior per type: `document` → open `attachmentUrl` (if present) via `Linking.openURL` (Expo's standard external-link API, no new dependency); every other type → open the item inline (a simple detail view showing `title`+`body`, since no AC calls for a separate document-style external-open behavior for news/notice/announcement/schedule/static_page, and no rich content/markdown exists in `body` — it's `apps/api`'s plain `@IsString` text field per Story 3.1's DTOs). Keep the detail view minimal — a modal or a pushed screen showing title/body/meta, no new design system component required.
  - [ ] Skeleton loading state (AC #5): reuse the pattern established by `apps/mobile/src/components/ui/skeleton.tsx` (Story 2.4's `bg-muted` pulsing-block primitive) — build 3 skeleton rows matching the list row's layout while the query is cold-loading, mirroring `ResidentProfileCardSkeleton`'s approach but for a list instead of a single card. Do not show a spinner.
  - [ ] Empty state (AC #4): reuse `apps/mobile/src/components/ui/empty-state.tsx` (already used by the current placeholder) with the copy "Nothing posted yet." — this is already EXPERIENCE.md's exact specified copy for this exact case (State Patterns: "No news/documents | News (family) | `empty-state`: 'Nothing posted yet.'"), no new copy to invent.
  - [ ] Pull-to-refresh (AC #6): React Native's `RefreshControl` on the list's `ScrollView`/`FlatList`, calling the query's `refetch()`. **This is the first pull-to-refresh implementation anywhere in `apps/mobile`** (confirmed — no existing screen uses `RefreshControl`) — a plain, standard `refreshing={query.isRefetching} onRefresh={() => query.refetch()}` wiring is sufficient, no custom affordance needed per EXPERIENCE.md's Interaction Primitives ("standard native gesture, no custom affordance needed").
- [ ] Task 6: Tests
  - [ ] Backend unit: extend `apps/api/src/content/content.service.spec.ts` (from Story 3.1) with cases proving `findAll`/`findOne` force `publishedAt: { not: null }` for a `family` caller and do NOT for `admin`/`staff` callers, even when a draft item exists in the mocked data.
  - [ ] Backend e2e: extend `apps/api/test/content-manage-home.e2e-spec.ts` (from Story 3.1) — new cases: family sees only published items (seed one draft + one published, assert the draft is absent from a family `GET /content`), family requesting a different home's content via a spoofed/invalid `X-Active-Home-Id` is rejected (AC #7 — mirrors `test/residents-family-view.e2e-spec.ts`'s or `test/homes-invite.e2e-spec.ts`'s existing invalid-header-handling shape), and a `GET /content/:id` for a draft item by a family caller 404s (not 200-with-hidden-draft — never leak draft existence).
  - [ ] Mobile: no test harness exists (same gap every prior mobile story has noted — `apps/mobile`'s `test` script is `expo lint`). Note manual verification in Completion Notes.

## Dev Notes

### This story sits directly on top of Story 3.1 — and 3.1 was unbuilt when this file was written

Read `3-1-home-admin-staff-gestiona-contenido-del-home.md` first. At the time this story file was written, Story 3.1 was still `ready-for-dev` with **zero implementation** — no `apps/api/src/content/` directory exists yet. Every file path and shape referenced above (`content.controller.ts`, `content.service.ts`, `ContentItem`/`PaginatedResponse<ContentItem>` in shared-types) is a *prediction* based on 3.1's own story file, not a verified merged reality. **If Story 3.1 is already implemented by the time you pick this up, re-check its actual shipped controller/service/DTO shapes before extending them** — same caveat Story 2.2's Dev Notes carried relative to unbuilt Story 2.1, and it turned out to matter there (2.1 shipped slightly differently than 2.2's predictions in at least one place).

### Where do the other 4 content types render? A real gap between epics.md and the finalized UX spine

`epics.md`'s AC text for this story says schedules/notices/static_pages/announcements render "on the relevant screen" — vague, no screen named. Checked the finalized UX spine (`ux-designs/ux-evergreen-2026-07-01/EXPERIENCE.md`, `status: final`) directly for the answer:
- The mobile bottom tab bar has exactly 5 tabs: Home, Photos, Events, Menu, **News** (`apps/mobile/src/app/(tabs)/_layout.tsx`, confirmed) — no Documents/Schedules/Notices/StaticPages/Announcements tab exists or is planned.
- EXPERIENCE.md's Information Architecture table (Maria's persona row) lists the mobile screens as "...Menu → **News & Documents** → Settings" — a single combined destination, not two.
- EXPERIENCE.md's Component Patterns table: *"News post / document row (reuses `event-list-item`/`card`) | **News & Documents (family)** | No dedicated component... Tapping a row opens the full post/document..."* — again, one combined pattern for exactly two of the six types.
- DESIGN.md's Components section, same combined heading: *"News & Documents (populated state)... or plain `card` for longer document/**notice** entries"* — this is the only place a third type (`notice`) gets named as sharing the same feed.
- **Schedules, static pages, and announcements are never mentioned by name anywhere in either finalized UX document.** No tab, no screen, no mockup, no empty-state copy specific to them.

This is a genuine spec gap, not something to silently paper over by inventing three new screens the UX spine never designed. **Decision, confirmed by Adrian (2026-09-10):** treat the News tab as a single combined feed across **all six** `ContentType` values, sorted together (most-recent-first, same as a news feed), each rendered with the same reused row shape — this satisfies every AC's literal text ("I see them listed... rendered with the same row/card shape") without requiring UI surfaces the UX spine never specified, and it matches the backend's uniform `GET /content` querying (Story 3.1 built one endpoint for all six types, not six). This is final — implement against it directly, no need to re-flag.

### AC #7's cross-home enforcement depends on new mobile plumbing this story must build (Task 2 + Task 4)

This is the least obvious dependency in this story, worth restating plainly: without Task 2 (adding `homeId` to `LinkedResident`) and Task 4 (the mobile client actually sending `X-Active-Home-Id`), `GET /content` from a family caller has **no `home_id` in its tenant context at all** — the existing `TenantContextMiddleware` leaves `store.homeId = null` when the header is absent, and the tenant-scoping extension throws "no home_id in request context" rather than silently leaking data. So the failure mode of skipping Task 2/4 is a broken feature (every request errors), not a security hole — but AC #7's "rejected server-side" language should read as "requests for a home the caller doesn't belong to are rejected" (the header-validation path in `resolveFamilyActiveHomeId` already 401/silently-nulls an invalid home id), not "requests with no plumbing at all happen to fail." Build Task 2/4 for real, don't skip them assuming AC #7 is "free" because the extension fails closed.

### Publish-status filtering is service-layer logic, not a guard

Unlike `FamilyResidentGuard` (a `CanActivate` that runs before the handler), the family-sees-published-only rule in Task 1 is a `where`-clause condition inside `ContentService`. There's no per-item resource check needed (content isn't resident-scoped, so there's no "is this family member linked to this specific item" question — only "is this family member in this item's home," which the tenant-scoping extension already answers) — the only additional rule is "and also, if the caller is family, never return a draft," which is naturally a query predicate, not a can-activate/can-not-activate boundary.

### Testing

- Unit: mock `PrismaService` per `apps/api/src/content/content.service.spec.ts`'s existing shape (from Story 3.1) — add the role-based `publishedAt` filtering cases.
- E2e: extend `apps/api/test/content-manage-home.e2e-spec.ts` — model the family-vs-admin visibility split on how `apps/api/test/residents-family-view.e2e-spec.ts` proves self-scoping, and model the invalid/missing `X-Active-Home-Id` handling on `apps/api/test/homes-invite.e2e-spec.ts`'s or `tenant-context.middleware`'s existing invalid-header behavior if a spec already covers it directly — check first rather than assuming none does.
- Mobile: no test runner exists (`apps/mobile`'s `test` script is `expo lint`) — same gap every prior mobile story (2.3, 2.4) has noted. Manual verification only; say so explicitly in Completion Notes.
- **Epic 2 retrospective action item applies directly here**: this is a mobile-facing story (unlike Story 3.1, which is admin-portal-only and explicitly exempted from this action item in its own Dev Notes) — manually smoke-test the News tab (list render, tap-to-open for a document vs. a news post, empty state, pull-to-refresh, resident-switch re-scoping) on a real emulator/device before marking this story done, not just `expo lint`/`tsc --noEmit`.

### Project Structure Notes

- Backend: edits (not new files) to `apps/api/src/content/content.controller.ts`, `content.service.ts` (from Story 3.1), and `apps/api/src/residents/residents.service.ts` (from Story 2.3, for the `homeId` addition to `findLinkedForUser`).
- Shared types: edit `packages/shared-types/src/residents.ts` (`LinkedResident.homeId`); `packages/shared-types/src/content.ts` likely needs no change (verify against 3.1's actual shipped shape).
- Mobile: edit `apps/mobile/src/app/(tabs)/news.tsx` (replace the placeholder), `apps/mobile/src/lib/resident-context.tsx` (only if the derived `activeResidentHomeId` ends up needing to live in shared context rather than a local derivation — see Task 4). No new files strictly required, but a small local row/detail-view component under `apps/mobile/src/components/` is reasonable if `news.tsx` would otherwise get unwieldy — team's call, no existing precedent forces a specific split (Story 2.4's `resident-profile-card.tsx` split it out as a separate file; Story 2.3's `news.tsx` predecessor was inline — either is consistent with this codebase's existing variance).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.2] — AC source (verbatim above)
- [Source: _bmad-output/implementation-artifacts/3-1-home-admin-staff-gestiona-contenido-del-home.md] — the (unbuilt-as-of-writing) backend this story extends
- [Source: ARCHITECTURE-SPINE.md#AD-1] — tenant isolation, `home_id` scoping, `X-Active-Home-Id` mechanism (rule 7)
- [Source: ARCHITECTURE-SPINE.md#AD-11] — `FamilyResidentGuard` scope (confirmed not applicable here — content is home-scoped, not resident-scoped)
- [Source: apps/api/src/common/tenant/tenant-context.middleware.ts] — `resolveFamilyActiveHomeId`, the existing-but-unused-by-mobile-so-far header mechanism this story is the first to actually wire up end-to-end
- [Source: apps/api/src/auth/auth.service.ts#resolveFixedHomeId] — confirms family JWTs carry no fixed home_id
- [Source: apps/api/src/residents/residents.service.ts#findLinkedForUser] — exact current shape, the `homeId`-add target
- [Source: packages/shared-types/src/residents.ts#LinkedResident] — confirmed missing `homeId` today
- [Source: apps/mobile/src/lib/resident-context.tsx] — `useResidents()`/`activeResidentId`, the state this story derives `activeResidentHomeId` from
- [Source: apps/mobile/src/lib/api.ts#authedRequest] — confirmed the `headers` option already exists, unused for this purpose so far
- [Source: apps/mobile/src/app/(tabs)/news.tsx, _layout.tsx] — the exact placeholder this story replaces, and the confirmed 5-tab bottom nav (no per-type tabs)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-evergreen-2026-07-01/EXPERIENCE.md#Information Architecture, #Component Patterns, #State Patterns, #Interaction Primitives] — "News & Documents" combined IA, empty-state copy, pull-to-refresh convention, the source of the schedules/notices/static_pages/announcements gap flagged above
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-evergreen-2026-07-01/DESIGN.md#Components] — "News & Documents (populated state)" row-shape spec (verbatim above)
- [Source: _bmad-output/implementation-artifacts/2-3-familia-ve-la-lista-de-residentes-vinculados.md] — confirms `X-Active-Home-Id` was never sent by mobile before this story, and the resident-switch re-scoping pattern this story's multi-home edge case reuses
- [Source: _bmad-output/implementation-artifacts/2-4-familia-ve-el-perfil-de-un-residente.md] — skeleton primitive precedent, Cloudinary-URL-construction precedent (not needed here, but the "first helper of its kind" pattern this story's `RefreshControl` use repeats)
- [Source: _bmad-output/implementation-artifacts/epic-2-retro-2026-09-10.md] — Action Item 2 (mobile UI must be manually smoke-tested), directly applicable to this story unlike 3.1

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
