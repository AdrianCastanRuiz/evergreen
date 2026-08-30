# Story 2.3: Familia ve la lista de residentes vinculados

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a family member,
I want to see the list of residents linked to my account,
so that I know which of my loved ones I can follow in the app.

## Acceptance Criteria

1. **Given** I am logged in as family with one linked resident, **when** I open the app, **then** my Home screen shows that resident's profile card with no switcher (FR20, UX-DR9). *(The card's own visual detail — skeleton states, exact layout — is Story 2.4's scope; this story renders a minimal-but-real card, not a placeholder, using the same data Story 2.4 will elaborate on.)*
2. **Given** I have 2+ linked residents, **when** I open the app, **then** the resident-switcher renders as a pill row (2–3) or dropdown (4+), with a visible scroll-cue peek in the pill-row case (UX-DR9).
3. **Given** I switch the active resident via the switcher, **when** the switch completes, **then** Home/Photos/Events/Menu re-scope to the newly selected resident with a brief skeleton reload, **and** the selection persists across app foreground/background within the session.
4. **Given** I attempt to view a resident not linked to me, **when** the request is made, **then** it is rejected server-side by `FamilyResidentGuard` (AD-11, NFR7).

## Tasks / Subtasks

- [ ] Task 1: Backend — self-scoped linked-residents list (AC #1, #2)
  - [ ] `GET /residents/linked` on `apps/api/src/residents/residents.controller.ts` (extends Story 2.1's module) — `@Roles('family')`, no `residentId` param, so no guard needed: the service queries `FamilyLink` filtered by `WHERE userId = store.userId`, joined to `Resident` — inherently self-scoped by construction, cannot leak another family's resident
  - [ ] Returns an array (name, room, dob, profilePhotoPublicId, id) — empty array is valid (zero-links edge case, see Dev Notes)
- [ ] Task 2: Backend — guard the single-resident fetch (AC #4)
  - [ ] Extend `GET /residents/:id` (Story 2.1, currently `@Roles('admin')` only) to also allow `family`: `@Roles('admin', 'family')`, plus `@UseGuards(FamilyResidentGuard)` (built in Story 2.2) applied at the controller method level — the guard is a no-op for `admin` (AD-11: staff/admin/super_admin exempt) and enforces the dual `FamilyLink` + `HomeMembership` check for `family`
  - [ ] This is the first real consumer of `FamilyResidentGuard` since it was built in Story 2.2 — if Story 2.2 built the guard but only unit-tested it (per that story's own scope note), this is where it gets wired into a live route for the first time. Verify the guard's unit tests still cover this exact shape before assuming it "just works."
- [ ] Task 3: Mobile — active-resident state (AC #3)
  - [ ] New `apps/mobile/src/lib/resident-context.tsx`, same provider pattern as `apps/mobile/src/lib/auth.tsx` (React Context + hook, e.g. `useActiveResident()`) — holds the fetched linked-residents list (TanStack Query, AD-16) + the currently-active resident id
  - [ ] In-memory only, session-scoped (AC #3: "persists across foreground/background **within the session**" — not across app restarts; do not persist to `AsyncStorage`/`expo-secure-store`, that would over-scope this AC)
  - [ ] Mount the provider inside `apps/mobile/src/app/_layout.tsx`'s tree, scoped to the family branch only (staff/admin never need it)
- [ ] Task 4: Mobile — resident switcher component (AC #2)
  - [ ] New `apps/mobile/src/components/resident-switcher.tsx`: pill row for 2–3 residents (horizontal `ScrollView`, visible partial-next-pill peek per UX-DR9's "scroll-cue"), dropdown for 4+ — check `apps/mobile/src/components/ui/` for an existing dropdown/select primitive before building one; none currently exists (only `button`, `text`, `empty-state` were found at last check — verify at implementation time) so you likely need a minimal one, don't pull in a heavy new dependency for it
- [ ] Task 5: Mobile — wire the Home tab (AC #1, #2)
  - [ ] Replace `apps/mobile/src/app/(tabs)/index.tsx`'s placeholder body: render the switcher (if 2+ residents) above a minimal resident summary card (name/room/photo — full card polish is Story 2.4's)
  - [ ] Zero-linked-residents case: do not render an empty state here — see Task 6, this should be structurally unreachable once Task 6 lands
- [ ] Task 6: Mobile — close the "no linked residents" navigation gap (AC #1 precondition)
  - [ ] `apps/mobile/src/app/_layout.tsx`'s `RootNavigator` has a standing comment: *"a family member is routed here directly — the 'has a linked resident?' gate has no data source yet (Epic 2 backlog)."* That data source now exists (Task 1's endpoint). Wire the gate: a family user with zero linked residents is routed to `onboarding` instead of `(tabs)` (EXPERIENCE.md State Patterns: "No residents linked → routed instead into the invite-code onboarding step... should not be reachable post-onboarding")
  - [ ] This requires the linked-residents list to be fetched before the `Stack.Protected` guards evaluate — check how `status` is resolved in `useAuth()`/`AuthProvider` today and extend the same resolving pattern rather than adding a second, parallel loading state
- [ ] Task 7: Tests
  - [ ] Backend unit: `residents.service.spec.ts` — `findLinkedForUser` (or equivalent) returns only the caller's links, never another user's
  - [ ] Backend e2e: extend `residents-manage-home.e2e-spec.ts` or add `residents-family-view.e2e-spec.ts` — AC #4 (family requests a non-linked resident id → rejected, not 200)
  - [ ] Mobile: no test harness currently exists for screens beyond `expo lint`/`tsc --noEmit` (checked — no Jest/RN Testing Library config found in `apps/mobile/package.json`'s `test` script, which just runs `expo lint`). Don't introduce a new test runner for this story alone; note the gap in Completion Notes if manual verification is all that's feasible.

## Dev Notes

### This story is the first real integration point across Stories 2.1/2.2 and Story 1.10's mobile shell

Read all three before starting:
- Story 2.1 (`2-1-...md`) — `residents` module, `GET /residents/:id`
- Story 2.2 (`2-2-...md`) — `FamilyResidentGuard`, `FamilyLink` tenant-scoping fix
- Both were `ready-for-dev` (not yet implemented) at the time this story file was written — if they're already merged when you pick this up, verify the actual shipped shapes of `residents.controller.ts` and `family-resident.guard.ts` before assuming this file's predictions are exact.

### The Home/Staff screen split (Story 1.10) — don't confuse the two

`apps/mobile/src/app/home.tsx` is **not** the family Home screen — it's the staff/admin/super_admin single-screen landing (misleading filename, established by Story 1.10). The actual family Home tab is `apps/mobile/src/app/(tabs)/index.tsx`. This story only touches the `(tabs)` group; `home.tsx` is out of scope.

### AC #3's "re-scope Home/Photos/Events/Menu" — infrastructure only, not per-tab features

Photos/Events/Menu tabs (`apps/mobile/src/app/(tabs)/{photos,events,menu}.tsx`) are still Story-1.10 placeholders — their real content ships in Epics 4/5/6, not here. This story's job is only to make the **active-resident id available** (via the Task 3 context) so those future stories can read it when they build real content. Do not build placeholder data-fetching in those tabs against a `residentId` query param that doesn't have a real backend yet elsewhere — that would be speculative work with nothing to verify it against.

### Zero-linked-residents is a real, reachable edge case today

Story 1.5's original invite flow (pre-2.2) never created a `FamilyLink`. Story 2.2 adds the *option* to link a resident at invite time, but doesn't make it mandatory in the DTO. **A home admin can still invite a family member with no resident selected.** Combined with Story 1.8 (invite-code onboarding), a family account can reach "active" status with zero links. Task 6 must handle this by routing to `onboarding`, per EXPERIENCE.md's State Patterns table — not by crashing or rendering a bare empty screen. This is exactly the gap the `_layout.tsx` comment already flags as deferred to Epic 2; closing it is this story's job, not a future one's.

### Project Structure Notes

- Backend: edits (not new files) to `apps/api/src/residents/residents.controller.ts`, `residents.service.ts` (from Story 2.1).
- Mobile: new `apps/mobile/src/lib/resident-context.tsx`, `apps/mobile/src/components/resident-switcher.tsx`; edits to `apps/mobile/src/app/_layout.tsx` and `apps/mobile/src/app/(tabs)/index.tsx`.
- Shared types: extend `packages/shared-types/src/residents.ts` (from Story 2.1/2.2) with a `LinkedResident` response shape if it differs from the admin-facing `Resident` type (e.g., family doesn't need `homeId` echoed back).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.3] — AC source
- [Source: ARCHITECTURE-SPINE.md#AD-11] — `FamilyResidentGuard`, staff/admin/super_admin exemption
- [Source: ARCHITECTURE-SPINE.md#AD-16] — TanStack Query on mobile (persisted cache) — use it for the linked-residents fetch, don't hand-roll fetch/state
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-evergreen-2026-07-01/EXPERIENCE.md#State Patterns] — "No residents linked" routing rule (verbatim), pill-row/dropdown switcher thresholds (UX-DR9)
- [Source: apps/mobile/src/app/_layout.tsx] — `RootNavigator`, the exact deferred-gate comment this story resolves
- [Source: apps/mobile/src/app/(tabs)/index.tsx] — current placeholder being replaced
- [Source: apps/mobile/src/lib/auth.tsx] — Context/provider pattern to mirror for `resident-context.tsx`
- [Source: apps/mobile/src/components/ui/empty-state.tsx] — reuse for the (now-unreachable-in-normal-flow, but still defensively handled) empty case

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
