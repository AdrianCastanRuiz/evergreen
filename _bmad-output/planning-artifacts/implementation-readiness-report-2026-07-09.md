---
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
inputDocuments:
  - source: "prd.md"
    type: prd
    path: "_bmad-output/planning-artifacts/prd.md"
  - source: "ARCHITECTURE-SPINE.md"
    type: architecture
    path: "_bmad-output/planning-artifacts/architecture/architecture-evergreen-2026-07-02/ARCHITECTURE-SPINE.md"
  - source: "DESIGN.md + EXPERIENCE.md"
    type: ux
    path: "_bmad-output/planning-artifacts/ux-designs/ux-evergreen-2026-07-01/"
  - source: "epics.md"
    type: epics-stories
    path: "_bmad-output/planning-artifacts/epics.md"
---

# Implementation Readiness Assessment Report

**Date:** 2026-07-09
**Project:** Evergreen

## Document Inventory

### PRD

**Whole Documents:**
- prd.md (1 file, whole document)

### Architecture

**Whole Documents:**
- architecture/architecture-evergreen-2026-07-02/ARCHITECTURE-SPINE.md (status: final)

*(supporting review files present in the same run folder — not part of the assessed spine itself)*

### Epics & Stories

**Whole Documents:**
- epics.md (whole document, status: 8 epics / 38 stories, steps complete through final-validation)

### UX Design

**Spine pair (bmad-ux format):**
- ux-designs/ux-evergreen-2026-07-01/DESIGN.md + EXPERIENCE.md (status: final)

*(supporting review files present in the same run folder — not part of the assessed spine itself)*

## Issues Found

No duplicates (no whole+sharded conflicts for any document type — each document type has exactly one run/version). No missing documents — PRD, Architecture, Epics/Stories, and UX are all present.

## PRD Analysis

### Functional Requirements

FR1: Users can register via email and password
FR2: Users can log in with email and password
FR3: Users can reset their password via email link
FR4: Users can view and edit their own profile (name, email)
FR5: Users can join a care home via invite code during onboarding
FR6: Users can authenticate with automatic token refresh
FR7: The app detects expired tokens and redirects to login with a message explaining the session expired
FR8: The app shows a splash screen that resolves to the correct screen based on auth state
FR9: Users can log out, clearing local session
FR10: Users see role-based navigation (family vs staff vs admin) after login
FR11: Admins can invite new users to their care home via email
FR12: Home admins can view and manage user roles within their care home
FR13: Family members can view news posts for their care home
FR14: Family members can view documents/PDFs for their care home
FR15: Family members can view weekly menus for their care home
FR16: Family members can view schedules for their care home
FR17: Family members can view notices for their care home
FR18: Family members can view static info pages (visiting rules, contact details)
FR19: Family members can view announcements for their care home
FR20: Family members can view a list of residents linked to them
FR21: Family members can view a resident's profile (name, photo, room, DOB)
FR22: Admins can create and manage resident profiles per care home
FR23: Admins can link family member accounts to specific residents
FR24: Staff can upload photos tagged to a resident with a caption
FR25: Family members can view a gallery of photos for their linked resident
FR26: Family members can view photos in full-screen with swipe navigation
FR27: Uploads are queued for retry on connection failure
FR28: Family members can view upcoming events for their care home
FR29: Family members can view events in list or calendar format
FR30: Family members can view event details (title, date, time, location, description, capacity)
FR31: Family members can sign up a linked resident for an event
FR32: Family members can view their registrations
FR33: Family members can cancel a registration
FR34: Admins can create, edit, and delete events
FR35: Admins can view attendee lists per event
FR36: Admins can export event registrations as CSV
FR37: Family members can view the weekly menu with day tabs and meal options
FR38: Family members can select meals for a linked resident
FR39: Family members can view current week's orders
FR40: Family members can modify or cancel a meal order
FR41: Staff can view meal orders by day
FR42: Staff can export meal orders as CSV
FR43: Family members receive push notification when a new photo of their resident is uploaded
FR44: Family members receive push confirmation when they sign up for an event
FR45: Users receive push reminder the day before an event they registered for
FR46: Users receive push notification if an event or meal is cancelled
FR47: Super admins can create and manage care homes
FR48: Super admins can assign home admins to a care home
FR49: Super admins can create additional super admins
FR50: Home admins can manage users for their care home
FR51: Home admins can manage content (news, menus, schedules, notices) for their home
FR52: Staff can upload photos for any resident within their care home
FR53: Staff can create and manage events for their care home
FR54: Super admins can view platform-level metrics (active users, content counts per home)
FR55: Home admins can view home-level metrics (event sign-ups, photo uploads, family activity)

Total FRs: 55

### Non-Functional Requirements

NFR1: Mobile screens load content in under 2 seconds on a good network connection (4G+)
NFR2: API responses complete in under 200ms for 95th percentile under normal load
NFR3: Photo gallery thumbnails load in under 1 second via server-side compression
NFR4: Push notifications are delivered within 30 seconds of trigger event
NFR5: All data in transit is encrypted via TLS 1.2+
NFR6: All photo and document storage is encrypted at rest
NFR7: API endpoints enforce home_id scoping — no user can access data from another home
NFR8: Authentication tokens are stored securely on device (platform keychain)
NFR9: Password reset links expire within 1 hour of request
NFR10: API rate limits prevent abuse of auth endpoints (login, password reset)
NFR11: Adding new care homes requires no code changes or downtime — super admin creates via UI
NFR12: The system handles up to 2,000 concurrent users across all homes with no performance degradation
NFR13: Photo storage design supports up to 50,000 photos before requiring archival or performance review
NFR14: Push notification delivery via FCM (Android) and APNs (iOS) with delivery status tracking
NFR15: Email delivery for password resets and user invites retries on transient failure (3 retries: 60s → 5min → 30min)
NFR16: CSV exports complete within 10 seconds for up to 5,000 rows

Total NFRs: 16

### Additional Requirements

- Mobile: React Native (Expo), iOS 15+/Android 12+, offline graceful-degradation only (no local DB/conflict resolution)
- Risk mitigations named in the PRD itself: API-contract-drift mitigation (shared TS types + CI validation), poor-WiFi photo upload resilience, push token lifecycle management, home-scoped notification routing, photo storage cost controls, Google Sheets sync deferred to Post-MVP
- Team constraint: 1 Senior + 1 Junior developer, ~300 person-hours estimate

### PRD Completeness Assessment

The PRD is complete and internally consistent for FR2–FR55. **FR1 ("Users can register via email and password") contradicts the product's actual account model** — confirmed with the user during epics/stories creation (2026-07-09): there is no self-service registration; account creation is strictly hierarchical (`super_admin` → `home_admin` → `staff`/`family`). This was corrected downstream in `epics.md` (FR1 marked corrected, reinterpreted as hierarchical creation + invite activation via FR5/FR11), but **the PRD source document itself still contains the original, incorrect FR1 wording** — a traceability gap between PRD and epics.md that this readiness check will flag.

## Epic Coverage Validation

### Coverage Matrix

| FR Number | PRD Requirement | Epic Coverage | Status |
| --- | --- | --- | --- |
| FR1 | Register via email/password | [CORRECTED] Superseded by FR5+FR11, Epic 1 Story 1.5/1.8 | ⚠️ RECONCILED (see Missing/Conflicts) |
| FR2 | Log in with email/password | Epic 1 Story 1.6 | ✓ Covered |
| FR3 | Reset password via email link | Epic 1 Story 1.7 | ✓ Covered |
| FR4 | View/edit own profile | Epic 1 Story 1.9 | ✓ Covered |
| FR5 | Join care home via invite code | Epic 1 Story 1.8 | ✓ Covered |
| FR6 | Automatic token refresh | Epic 1 Story 1.6 | ✓ Covered |
| FR7 | Expired-token detection + redirect | Epic 1 Story 1.11 | ✓ Covered |
| FR8 | Splash screen resolves by auth state | Epic 1 Story 1.6 | ✓ Covered |
| FR9 | Log out, clear local session | Epic 1 Story 1.11 | ✓ Covered |
| FR10 | Role-based navigation after login | Epic 1 Story 1.10 | ✓ Covered |
| FR11 | Admins invite new users via email | Epic 1 Story 1.5 (+1.3 home-admin case) | ✓ Covered |
| FR12 | Home admins view/manage user roles | Epic 1 Story 1.12 | ✓ Covered |
| FR13 | View news posts | Epic 3 Story 3.2 | ✓ Covered |
| FR14 | View documents/PDFs | Epic 3 Story 3.2 | ✓ Covered |
| FR15 | View weekly menus | Epic 6 Story 6.2 | ✓ Covered |
| FR16 | View schedules | Epic 3 Story 3.2 | ✓ Covered |
| FR17 | View notices | Epic 3 Story 3.2 | ✓ Covered |
| FR18 | View static info pages | Epic 3 Story 3.2 | ✓ Covered |
| FR19 | View announcements | Epic 3 Story 3.2 | ✓ Covered |
| FR20 | View list of linked residents | Epic 2 Story 2.3 | ✓ Covered |
| FR21 | View a resident's profile | Epic 2 Story 2.4 | ✓ Covered |
| FR22 | Admins create/manage resident profiles | Epic 2 Story 2.1 | ✓ Covered |
| FR23 | Admins link family accounts to residents | Epic 2 Story 2.2 | ✓ Covered |
| FR24 | Staff upload photo tagged to resident | Epic 4 Story 4.1 | ✓ Covered |
| FR25 | Family views photo gallery | Epic 4 Story 4.2 | ✓ Covered |
| FR26 | Full-screen photo view with swipe | Epic 4 Story 4.3 | ✓ Covered |
| FR27 | Uploads queued for retry on failure | Epic 4 Story 4.1 | ✓ Covered |
| FR28 | View upcoming events | Epic 5 Story 5.2 | ✓ Covered |
| FR29 | View events list or calendar | Epic 5 Story 5.2 | ✓ Covered |
| FR30 | View event details | Epic 5 Story 5.2 | ✓ Covered |
| FR31 | Sign up resident for event | Epic 5 Story 5.3 | ✓ Covered |
| FR32 | View own registrations | Epic 5 Story 5.4 | ✓ Covered |
| FR33 | Cancel a registration | Epic 5 Story 5.4 | ✓ Covered |
| FR34 | Admins create/edit/delete events | Epic 5 Story 5.1 | ✓ Covered |
| FR35 | Admins view attendee lists | Epic 5 Story 5.5 | ✓ Covered |
| FR36 | Admins export event registrations as CSV | Epic 5 Story 5.5 | ✓ Covered |
| FR37 | View weekly menu with day tabs | Epic 6 Story 6.2 | ✓ Covered |
| FR38 | Select meals for linked resident | Epic 6 Story 6.3 | ✓ Covered |
| FR39 | View current week's orders | Epic 6 Story 6.4 | ✓ Covered |
| FR40 | Modify or cancel a meal order | Epic 6 Story 6.4 | ✓ Covered |
| FR41 | Staff view meal orders by day | Epic 6 Story 6.5 | ✓ Covered |
| FR42 | Staff export meal orders as CSV | Epic 6 Story 6.5 | ✓ Covered |
| FR43 | Push on new photo of linked resident | Epic 7 Story 7.2 | ✓ Covered |
| FR44 | Push confirmation on event sign-up | Epic 7 Story 7.3 | ✓ Covered |
| FR45 | Push reminder day before event | Epic 7 Story 7.4 | ✓ Covered |
| FR46 | Push notification on cancellation | Epic 7 Story 7.5 | ✓ Covered |
| FR47 | Super admins create/manage care homes | Epic 1 Story 1.2 | ✓ Covered |
| FR48 | Super admins assign home admins | Epic 1 Story 1.3 | ✓ Covered |
| FR49 | Super admins create additional super admins | Epic 1 Story 1.4 | ✓ Covered |
| FR50 | Home admins manage users for their home | Epic 1 Story 1.12 | ✓ Covered |
| FR51 | Home admins manage content (news/menus/schedules/notices) | Epic 3 Story 3.1 (news/docs/schedules/notices) **split** Epic 6 Story 6.1 (menus) | ✓ Covered (split, documented) |
| FR52 | Staff upload photos for any resident in home | Epic 4 Story 4.1 | ✓ Covered |
| FR53 | Staff create/manage events | Epic 5 Story 5.1 | ✓ Covered |
| FR54 | Super admins view platform-level metrics | Epic 8 Story 8.1 | ✓ Covered |
| FR55 | Home admins view home-level metrics | Epic 8 Story 8.2 | ✓ Covered |

### Missing Requirements

None missing. One reconciliation item, not a gap:

- **FR1** is not "covered" in the traditional sense — it is deliberately superseded. `epics.md` documents the correction inline (Requirements Inventory + Epic 1 goal + FR Coverage Map), but the source `prd.md` was not updated to match. This is a **PRD ↔ Epics traceability inconsistency**, not a missing capability — the actual capability (hierarchical account creation + invite activation) is fully covered by Epic 1 Stories 1.3, 1.5, 1.8. Flagged for resolution in the final report (recommend updating `prd.md`'s FR1 text to match reality).

### Coverage Statistics

- Total PRD FRs: 55
- FRs covered in epics: 55 (54 directly + FR1 reconciled via documented supersession)
- Coverage percentage: 100%

## UX Alignment Assessment

### UX Document Status

Found — bmad-ux spine pair (`DESIGN.md` + `EXPERIENCE.md`), status `final`, updated 2026-07-01.

### Alignment Issues

**UX ↔ PRD:** Strong alignment. `EXPERIENCE.md`'s Key Flows are the PRD's four persona journeys (Maria, Sarah, James, Priya) adapted 1:1 onto concrete screens/components. All 55 FRs have a corresponding UX treatment (component, state, or interaction primitive).

**UX ↔ Architecture:** Strong alignment on tech stack (React Native Reusables/NativeWind ↔ AD's RN/Expo stack; shadcn/ui ↔ Vite+React admin), offline posture (UX's "cached content + retry queue" ↔ AD-16's TanStack Query persisted cache + AD-9's exact 30s/2min/5min backoff), and push payload shape (UX's deep-linking requirement ↔ AD-10's typed `{type, entityId, route}`).

**❗ CRITICAL — Three-way conflict on multi-home family accounts:**

- **UX** (`EXPERIENCE.md`, Information Architecture): "Family accounts can link to **multiple residents** (e.g. two parents in the same **or different homes**)" — explicitly describes a family account spanning two different care homes.
- **Architecture** (`ARCHITECTURE-SPINE.md`, Core-Entity ERD): `USER { uuid id, string role, uuid home_id }` — a user has exactly **one** `home_id`. AD-1's entire tenant-isolation mechanism (`AsyncLocalStorage`-resolved `home_id`, Prisma Client Extension auto-injection, RLS) resolves a **single** `home_id` per authenticated session. There is no modeled mechanism for a user whose accessible residents span two different `home_id` values.
- **Epics/Stories** (`epics.md`, Epic 1 Story 1.5): an AC explicitly **rejects** this scenario — "Given the invited email already exists in the system for a different home, When I attempt to invite it, Then I see an inline error rather than a silent cross-home account merge."

These three documents disagree on a real product decision: can a family member with parents in two different care homes use one account, or do they need two separate logins? This was marked `[ASSUMPTION — inherited from memlog IA decision on multi-resident linking]` in `EXPERIENCE.md` and was never reconciled against the tenant-isolation model that came later in Architecture. This needs an explicit product decision, not a default.

### Warnings

None beyond the critical conflict above — UX document is present, complete, and otherwise well-aligned; no missing-UX warning applies.

## Epic Quality Review

### Epic Structure Validation

All 8 epics are user-centric (Cuentas/Homes y Acceso, Residentes, Contenido, Fotos, Eventos, Comidas, Push, Analytics) — none are technical milestones ("Database Setup," "API Development"). Story 1.1 (monorepo/multi-tenant scaffold) is a technical-sounding *story*, not an epic — acceptable per the workflow's own rule since no starter template exists and every other story needs this substrate; it does not itself constitute a "technical epic."

**Epic independence — verified:**

| Epic | Depends on | Independent? |
| --- | --- | --- |
| 1. Cuentas, Homes y Acceso | none | ✓ Standalone |
| 2. Residentes y Vínculo Familiar | Epic 1 (homes/users) | ✓ |
| 3. Gestión de Contenido | Epic 1 | ✓ (does not need Epic 2) |
| 4. Fotos | Epic 1, 2 | ✓ |
| 5. Eventos y Salidas | Epic 1, 2 | ✓ |
| 6. Pedidos de Comida | Epic 1, 2 | ✓ |
| 7. Notificaciones Push | Epic 1, 2, 4, 5, 6 (hooks into their flows) | ✓ (correctly sequenced last-but-one) |
| 8. Analytics y Dashboard | all previous (aggregates their data) | ✓ (correctly sequenced last) |

No epic requires a *later* epic to function.

### Story Dependency Analysis

**🔴 Critical violations found and fixed during this review:**

1. **Story 1.3** (assign home admin) originally contained an AC that could only be verified once **Story 1.7** (password activation) existed — a forward dependency. Fixed: removed the forward-testing AC, replaced with a note pointing forward for context only (not a completion requirement).
2. **Story 1.4** (create super admin) had the same pattern, forward-referencing **Story 1.7** and **Story 1.10** inside its own ACs. Fixed the same way.
3. *(Pre-existing, caught and fixed during epics/stories creation itself, 2026-07-09):* **Story 1.7** (old numbering: Story 1.7 "Onboarding") originally depended on **Story 1.11** (staff/family invite), which was numbered later. Fixed by moving the invite story to **Story 1.5** and renumbering 1.6–1.12 accordingly — already reflected in the current `epics.md`.

No other forward dependencies found across the remaining 35 stories (Epics 2–8) — all cross-story references point backward only (verified by scanning every `(Story X.Y)` cross-reference in the document).

### Acceptance Criteria Review

Given/When/Then format used consistently across all 38 stories. ACs include error/edge conditions (invalid input, cross-home access attempts, offline states, expired tokens, capacity limits) alongside happy paths — not just happy-path coverage. No vague criteria found (e.g., no bare "user can log in" without a concrete Given/When/Then).

### Database/Entity Creation Timing

Verified — no story creates tables it doesn't need. Each entity (`Home`, `User`, `Resident`, `FAMILY_LINK`, `ContentItem`, `Photo`, `Event`, `MEAL_MENU_ITEM`, `MEAL_ORDER`, `DEVICE_TOKEN`) is created in the first story that actually needs it, not upfront in Epic 1.

### Starter Template / Greenfield Checks

No starter template specified in Architecture — Story 1.1 correctly scaffolds from scratch (monorepo, CI/CD skeleton, dev environment). Greenfield indicators present as expected (initial setup story, CI/CD early, no migration/compatibility stories needed).

### Compliance Checklist (per epic)

All 8 epics: ✅ user value · ✅ independent · ✅ stories appropriately sized · ✅ no forward dependencies (after fixes above) · ✅ tables created on demand · ✅ clear ACs · ✅ FR traceability maintained.

## Summary and Recommendations

### Overall Readiness Status

**READY** — the one blocking product decision (multi-home family accounts) has been resolved. Remaining item (PRD FR1 text sync) is non-blocking.

### Critical Issues Requiring Immediate Action

1. ~~🔴 Multi-home family accounts — undecided, conflicting across 3 documents.~~ **[RESOLVED 2026-07-09]** Decision: V1 restricts family accounts to residents within a single care home, matching what `ARCHITECTURE-SPINE.md` and `epics.md` already assumed. `EXPERIENCE.md`'s Information Architecture section was updated to state this explicitly (multi-resident linking is same-home only; cross-home would require two separate accounts), removing the three-way conflict. No changes were needed in `epics.md` or `ARCHITECTURE-SPINE.md` — they already modeled the single-home constraint correctly.

### Recommended Next Steps

1. ~~Resolve the multi-home family account conflict~~ — done (see above).
2. ~~Sync `prd.md`'s FR1 text~~ — done. `prd.md` FR1 now matches the hierarchical-account-creation model documented in `epics.md`.
3. No other action required — FR coverage is 100%, UX/Architecture are aligned, and epic/story structure passed quality review (2 forward-dependency ACs found and fixed in this pass).

### Final Note

This assessment identified 2 issues (1 critical product decision, 1 documentation sync) across 4 categories reviewed (document discovery, FR coverage, UX alignment, epic/story quality) — plus 2 minor forward-dependency ACs that were found and corrected in place during this review. Coverage is complete (55/55 FRs, 40/40 UX-DRs referenced across stories) and structural quality is sound. Address the multi-home decision before Sprint Planning; the PRD/FR1 sync can happen in parallel without blocking.
