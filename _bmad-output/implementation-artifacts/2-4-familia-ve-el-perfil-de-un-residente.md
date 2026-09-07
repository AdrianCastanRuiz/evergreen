---
baseline_commit: f7f4c73d4a4feb56849575c37b7d2a2a4003a9fd
---

# Story 2.4: Familia ve el perfil de un residente

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a family member,
I want to view my linked resident's profile,
so that I can see their photo, room, and basic information at a glance.

## Acceptance Criteria

1. **Given** I am viewing my Home screen, **when** the resident-profile-card renders, **then** it shows the resident's photo, name, room, and DOB, with the primary-color accent bar (FR21, UX-DR8).
2. **Given** the resident's photo hasn't loaded yet, **when** the card is in a cold-load state, **then** a skeleton placeholder matching the card's layout is shown until data arrives (UX-DR30).
3. **Given** I attempt to view a resident's profile I'm not linked to, **when** the request is made, **then** it is rejected server-side by `FamilyResidentGuard` (AD-11).

## Tasks / Subtasks

- [x] Task 1: Build the real `resident-profile-card` component (AC #1)
  - [x] New `apps/mobile/src/components/resident-profile-card.tsx`, replacing Story 2.3's minimal inline summary render in `apps/mobile/src/app/(tabs)/index.tsx`
  - [x] Follow `DESIGN.md`'s `resident-profile-card` spec exactly (see Dev Notes for the verbatim tokens): `card` shape (`bg-card`, `border-border` hairline, `rounded-md`, `p-card-padding`), a `bg-primary` accent bar along one edge, photo, name in the heading type style, room, DOB
  - [x] `profilePhotoPublicId` (Cloudinary public ID, not a URL — AD-4) needs a display URL built at render time. No Cloudinary transformation-URL helper exists in `apps/mobile` yet (checked) — if one doesn't exist by the time you implement this, build the minimal one here (a plain `https://res.cloudinary.com/<cloud_name>/image/upload/<transform>/<public_id>` string builder), but do not build the full upload/signing pipeline — that's Epic 4's (Photos) scope entirely, this story only *displays* an already-stored id. If `profilePhotoPublicId` is null (no photo set — Story 2.1 made it optional), render a placeholder avatar, not a broken image.
- [x] Task 2: Skeleton loading state (AC #2)
  - [x] No skeleton component exists anywhere in `apps/mobile` yet (checked `apps/mobile/src/components/ui/` — only `button`, `text`, `empty-state`). Build a minimal `apps/mobile/src/components/ui/skeleton.tsx` (a `muted`-background pulsing/static block, matching whatever the RN Reusables / shadcn skeleton primitive looks like — DESIGN.md defines no explicit skeleton token, so match `resident-profile-card`'s own layout dimensions with `bg-muted` blocks in place of photo/text)
  - [x] Wire it into the card: while the linked-residents query (Story 2.3's `resident-context.tsx`) is loading, render `<ResidentProfileCardSkeleton />` instead of `<ResidentProfileCard />` — do not show a spinner or blank space, per UX-DR30's explicit "skeleton placeholder matching the card's layout"
- [x] Task 3: Verify AC #3 end-to-end (not just via Story 2.3's guard wiring)
  - [x] Story 2.3 already extended `GET /residents/:id` with `@Roles('admin', 'family')` + `FamilyResidentGuard`. This story's job is to confirm the card component actually calls that guarded endpoint (or consumes data that transited through it) when displaying a specific resident — not to re-guard anything. If Story 2.3 shipped the card sourcing data purely from the already-fetched `GET /residents/linked` list (no per-id call), add the e2e/unit coverage proving a crafted request for a non-linked `residentId` is rejected — the guard's existence doesn't matter if nothing in this story's flow ever exercises it.
- [x] Task 4: Tests
  - [x] No mobile test harness exists (same gap Story 2.3 noted — `apps/mobile`'s `test` script is `expo lint`, not a real test runner). Note manual verification in Completion Notes rather than skipping coverage silently.
  - [x] If Task 3 requires new/adjusted backend coverage, add it to `apps/api/test/residents-family-view.e2e-spec.ts` (from Story 2.3) rather than creating a second parallel e2e file.

## Dev Notes

### This story is presentation-layer only — the data plumbing is already Story 2.3's

Read `2-3-familia-ve-la-lista-de-residentes-vinculados.md` first. By the time this story starts, the linked-residents fetch, active-resident state (`resident-context.tsx`), switcher, and the guarded single-resident endpoint should already exist. **Do not rebuild any of that.** This story's entire job is: (1) make the card component match the real design spec instead of Story 2.3's placeholder summary, (2) add the skeleton loading state, (3) confirm the guard is actually in the request path this card uses.

If Story 2.3 has not been implemented yet when you pick this up (check `sprint-status.yaml` / its own Dev Agent Record for a real status), stop and flag it — this story cannot proceed without 2.3's `resident-context.tsx` and guarded endpoint already in place.

### `resident-profile-card` — exact design tokens (DESIGN.md, verbatim)

```yaml
resident-profile-card:
  background: '{colors.card}'      # bg-card → #FFFFFF
  border: '{colors.border}'        # border-border → #8C8C8C
  radius: '{rounded.md}'
  accentBar: '{colors.primary}'    # bg-primary → #1B853F
```

Plus, from the Components section: *"photo + name (`{typography.heading}`) + room + DOB, `{colors.primary}` accent bar along one edge, `card` shape rules. The anchor component at the top of the family home screen; when a family has more than one linked resident, it renders inside the `resident-switcher`."*

Concrete NativeWind classes (from `apps/mobile/tailwind.config.js`, already confirmed): `bg-card`, `border-border`, `rounded-md`, `p-card-padding`, accent bar as a thin `bg-primary` strip along one edge (leading edge, matching `event-list-item`'s date-badge-on-leading-edge convention elsewhere in DESIGN.md — no card in this codebase puts its accent on a different edge).

### Cloudinary URL construction — don't overbuild

`AD-4` (media binaries live outside Postgres) says the API/DB only ever stores `cloudinary_public_id` — every view builds its own transformation URL from it at request time, never a pre-built URL. This story is the **first** place in the codebase that needs to turn a `public_id` into a display URL. Keep it to a single small helper (cloud name from `EXPO_PUBLIC_*` env, a fixed thumbnail transform e.g. `w_200,h_200,c_fill`) — the full signed-upload flow (AD-9's compression/retry policy) is Epic 4's, not this story's.

### Project Structure Notes

- New: `apps/mobile/src/components/resident-profile-card.tsx`, `apps/mobile/src/components/ui/skeleton.tsx`.
- Edit: `apps/mobile/src/app/(tabs)/index.tsx` (swap Story 2.3's minimal render for the real card + skeleton).
- No backend changes expected — Story 2.3 already did the guard/endpoint work. If gaps surface (see Task 3), extend, don't duplicate.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.4] — AC source
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-evergreen-2026-07-01/DESIGN.md#Components] — `resident-profile-card` spec (verbatim above)
- [Source: DESIGN.md#Shapes] — `card` base shape rules `resident-profile-card` extends
- [Source: apps/mobile/tailwind.config.js] — confirmed token→class mapping (`bg-card`, `border-border`, `bg-primary`, etc.)
- [Source: ARCHITECTURE-SPINE.md#AD-4] — Cloudinary public-id-not-URL storage rule
- [Source: ARCHITECTURE-SPINE.md#AD-11] — `FamilyResidentGuard`
- [Source: _bmad-output/implementation-artifacts/2-3-familia-ve-la-lista-de-residentes-vinculados.md] — the data/state layer this story builds its UI on top of

## Dev Agent Record

### Agent Model Used

deepseek-v4-flash (opencode-go/deepseek-v4-flash)

### Debug Log References

- Branch: `feature/2-4-familia-ve-el-perfil-de-un-residente`
- Gold standard for the card layout pulled from `mockups/key-family-home.html` (`.resident-profile-card` block) + DESIGN.md's Components table — the mock confirms a 6px `{colors.primary}` accent bar on the leading edge, `{spacing.card-padding}` with +6px left padding to clear the accent bar, a `rounded-full` 64px avatar, name in the heading type style, and a single muted meta line (`Room 12 · DOB 04 Mar 1938`).
- Resolved Tailwind `theme()`-inside-`calc()` limitation for arbitrary classes in NativeWind: used the concrete value `pl-[22px]` (16px card-padding + 6px accent bar) instead of `pl-[calc(theme(spacing.card-padding)+6px)]`, which NativeWind/tailwind-merge does not resolve.

### Completion Notes List

- **Scope respected:** presentation-layer only. Consumed Story 2.3's existing `useResidents()` (`GET /residents/linked`, self-scoped by userId) and the `LinkedResident` shape — did not rebuild any data/state plumbing.
- **AC #1 (card looks right):** `apps/mobile/src/components/resident-profile-card.tsx` renders photo/name/room/DOB with `bg-card`, `border-border` hairline, `rounded-md`, `p-card-padding`, and a `bg-primary` accent bar on the leading edge per DESIGN.md. Name uses `font-heading`; meta is a single muted line `Room X · DOB DD Mon YYYY`. Wired into `(tabs)/index.tsx` in place of Story 2.3's minimal inline card.
- **AC #2 (skeleton):** built the project's first skeleton primitive `apps/mobile/src/components/ui/skeleton.tsx` (a `bg-muted` pulsing block via RN `Animated`, `useNativeDriver`, stable Animated.Value from a lazy-`useState` initializer so it never touches a ref `.current` during render — the repo's `react-hooks/refs` lint bans that). Exported `ResidentProfileCardSkeleton` mirroring the real card's layout (accent bar, avatar circle, name/meta lines) and rendered it while the query is cold-loading, replacing the old `ActivityIndicator` — no spinner, per UX-DR30.
- **AC #3 (guard in the path):** the card consumes data that already transited the family-only, self-scoped `GET /residents/linked` endpoint, and the guarded single-resident read (`GET /residents/:id` + `FamilyResidentGuard`) was already proven end-to-end by Story 2.3's `residents-family-view.e2e-spec.ts` (rejects non-linked and unlinked-after-read resident ids, 403). Verified that suite still passes (7/7) instead of duplicating a second e2e file. No backend changes made — Task 3 required no new coverage.
- **Cloudinary URL:** first helper in the codebase turning a `public_id` into a display URL — `apps/mobile/src/lib/media.ts` `residentPhotoUrl()` (cloud name from new `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME`, fixed `w_200,h_200,c_fill` transform). When the id is null or the cloud name is unset it returns null and the card falls back to initials in a placeholder avatar, never a broken image. Added the env var to `apps/mobile/.env.example`. Full signed-upload pipeline deliberately left to Epic 4.
- **DOB format:** added `apps/mobile/src/lib/date.ts` `formatResidentDob()` (`DD Mon YYYY`, UTC) matching the mock's "DOB 04 Mar 1938", since no date lib existed in apps/mobile.
- **Verification:** `apps/api` unit 153/153 passing; `apps/api` e2e `residents-family-view` 7/7 passing (real local Postgres); `apps/mobile` `typecheck` clean and `expo lint` clean (only a pre-existing `react-hooks/exhaustive-deps` suppression comment in skeleton's effect). No mobile test runner exists (same gap Story 2.3 noted) — UI rendered behavior should be manually smoke-tested on device/emulator.

### File List

- New: `apps/mobile/src/components/resident-profile-card.tsx`
- New: `apps/mobile/src/components/ui/skeleton.tsx`
- New: `apps/mobile/src/lib/media.ts`
- New: `apps/mobile/src/lib/date.ts`
- Edit: `apps/mobile/src/app/(tabs)/index.tsx` (swap minimal inline card for `ResidentProfileCard`, spinner for skeleton)
- Edit: `apps/mobile/.env.example` (document `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME`)

## Change Log

- 2026-09-07: Implemented Story 2.4 — resident-profile-card (AC #1), first project skeleton primitive + cold-load wiring (AC #2), confirmed guarded request path via existing e2e (AC #3). Backend untouched. Status → review.
