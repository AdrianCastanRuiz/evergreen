---
name: Evergreen
status: final
sources:
  - "{planning_artifacts}/prd.md"
updated: 2026-07-01
---

# Evergreen — Experience Spine

> Multi-surface product: React Native (Expo) mobile app for families + a narrow staff photo-upload flow, and a fully responsive React web admin portal (shadcn/ui) for staff, home admins, and super admins. Paired with `DESIGN.md`. Multi-tenant — every screen on every surface is implicitly scoped to the signed-in user's `home_id`; no cross-home data is ever visible, so "which home am I in" never needs to be a UI decision the user makes (except super admin, whose surfaces are explicitly platform-wide).

## Foundation

Two form factors, one visual language:

- **Mobile app** — React Native via Expo, targeting iOS 15+ and Android 12+. UI system: **React Native Reusables** (shadcn-for-RN, built on NativeWind). Used by **families** (full app: profile, photos, events, menu, news) and by **staff** for exactly one job: quick photo upload. Everything else staff-related lives on the web portal, opened from a personal mobile browser if needed.
- **Admin web portal** — React web app, fully responsive (desktop, tablet, and staff personal mobile browsers). UI system: **shadcn/ui** on Tailwind. Used by **staff** (event creation/editing, attendee lists, meal order views), **home admins** (residents, content, events, users, home dashboard), and **super admins** (platform dashboard, home management, super admin provisioning).

`DESIGN.md` is the shared visual reference for both surfaces — token names are shadcn-shaped so the same palette, type ramp, radii, and spacing map cleanly into both the web Tailwind config and the RN NativeWind config. This document is the experience spine: behavior, IA, states, and flows. Where a composed mockup exists later, the mockup wins on visual detail; this spine wins on behavior.

Offline posture: graceful degradation only, no full offline mode. Cached content is shown when offline; photo uploads queue for automatic retry (backoff 30s → 2min → 5min, stop after 3 attempts). No local database, no conflict resolution — see State Patterns.

## Information Architecture

| Persona | Surface | Screens |
|---|---|---|
| **Maria** — family member | Mobile app | Onboarding (invite code) → Home (resident switcher + featured photo) → Photos (gallery, full-screen viewer) → Events (list — default view; calendar as a secondary toggle — sign-up, my registrations) → Menu (weekly, day tabs, meal selection) → News & Documents → Settings (profile, notification toggles, log out) |
| **Sarah** — staff | Mobile app (narrow) | Login → Photo upload only: pick resident → camera/gallery → caption → upload |
| **Sarah** — staff | Web portal | Login → Home dashboard → Events (create/edit, attendee list, CSV export) → Meal orders (view by day, CSV export) |
| **James** — home admin | Web portal | Login → Home dashboard (metrics) → Residents (create/edit, family linking) → Content (news, documents, menus, schedules, notices, static pages) → Events (create/edit, attendee lists, capacity) → Users (invite, roles) |
| **Priya** — super admin | Web portal | Login → Platform dashboard (all-homes metrics) → Homes (create/manage, drill into one home's dashboard) → Home admin assignment → Super admin provisioning |

Family accounts can link to **multiple residents within the same care home** (e.g. two parents living in the same home) **or across different care homes** (e.g. a mother in Sunrise Lodge and a father in Evergreen Heights). A persistent **home switcher** lets the family toggle between the care homes they have access to; within each home, a **resident switcher** scopes screens to the selected resident. Single-home families never see the home switcher; single-resident families never see the resident switcher. The home switcher and resident switcher chain: switching the active home re-scopes the resident list, which in turn re-scopes Photos, Events, and Menu. Both selections persist client-side in-memory for the session.

Mobile app: bottom tab bar (`{components.bottom-tab-bar}`) with the top-level family tabs (Home, Photos, Events, Menu, News); staff sees a single-screen photo-upload flow with no tab bar. Web portal: persistent `sidebar-nav` at `md`+ widths, collapsing to a top bar / sheet below `md` (see Responsive & Platform). Modal/sheet stacks one level deep on both surfaces — never a dialog on top of a dialog.

## Voice and Tone

Brand aesthetic posture lives in `DESIGN.md` (Brand & Style). This section is microcopy: warm, plain-language, reassuring. Evergreen talks like a trusted person at the front desk, not a hospital system and not a corporate SaaS product.

| Do | Don't |
|---|---|
| "New photo of your dad from this morning." | "1 new notification." |
| "You're signed up for Thursday's coffee morning." | "Registration confirmed. Ref #48213." |
| "We couldn't upload this photo — we'll keep trying." | "Upload failed. Error 503." |
| "No photos yet — check back soon." | "No data available." |
| "Your session ended. Please log in again." | "Token expired (401)." |
| Plain names: resident's first name where known, not "the patient" or "the client." | Clinical or case-management language. |
| Same warm register for family, staff, and admin surfaces — a home admin's dashboard still says "Sarah hasn't uploaded a photo in 3 weeks," not "Engagement anomaly detected." | Cold, dashboard-speak on the portal just because it's "for staff." |

## Inspiration & Anti-patterns

**Inspiration.** Evergreen's palette, logo lockup treatment, and the white-border-on-solid-green `featured-card` motif are all lifted directly from the parent brand's marketing site, evergreen-homecare.com — see `DESIGN.md` (Brand & Style, Colors, Components → `featured-card`) for the full reasoning and hex values. No other reference product informed this system.

**Anti-patterns.** These are stated in full detail elsewhere in this document; this list only consolidates and cross-references them so they aren't scattered:

- No badge counts / red-dot escalation anywhere in the system — see Component Patterns (Sidebar / bottom nav).
- No swipe-to-delete or swipe actions on list rows in V1 — see Interaction Primitives (Swipe).
- No confirmation dialog on one-tap actions (sign-up, meal order submission, photo upload) — see Interaction Primitives (One-tap actions).
- No hue-shift on hover/press (darken only) and no more than one `featured-card` per screen — see `DESIGN.md` Do's and Don'ts.

## Component Patterns

Behavioral specs for the components `DESIGN.md.Components` defines visually.

| Component | Use | Behavioral rules |
|---|---|---|
| Resident switcher (`{components.resident-switcher}`) | Home, Photos, Events, Menu (family) | Only rendered when 2+ residents are linked. Pill-row pattern for 2–3 linked residents; dropdown for 4+. In the pill-row case, a visible scroll cue (partial next-pill peek at the trailing edge) is always shown so a horizontally-scrolled resident is never hidden from a less tech-fluent user. Tapping a pill (or selecting from the dropdown) switches the active resident and re-scopes the current screen's data with a brief skeleton reload. Selection persists across app foreground/background within a session. See [key-family-home.html](mockups/key-family-home.html). |
| Gallery tile / full-screen viewer (`{components.gallery-tile}`) | Photos | Tap a tile → full-screen viewer with swipe left/right between photos (FR26), **and** an equivalent tap-based affordance (tap the leading/trailing edge of the photo, or small visible prev/next chevrons) — swipe is never the only way to navigate, matching the same "no hidden-gesture-only navigation" caution applied to list rows. Pinch-to-zoom on the open photo. Swipe down or tap close to return to the grid at the same scroll position. See [key-photos-gallery.html](mockups/key-photos-gallery.html). |
| Event list item / RSVP (`{components.event-list-item}`) | Events | States: **not registered** (primary "Sign up" button) → **registered** (badge "You're going" + secondary "Cancel" action) → **cancelled by family** (returns to not-registered state) → **cancelled by admin/capacity change** (banner notice on the event, push notification sent, registration auto-removed). Sign-up is one-tap — no confirmation dialog, matching the brand's low-friction posture; a success toast confirms instead. List view is the default for family Events; calendar is an optional secondary toggle (lower cognitive load for the target audience). See [key-events-list.html](mockups/key-events-list.html) for all three states. |
| Event calendar cell (`{components.event-calendar-cell}`) | Events (calendar view, optional secondary toggle) | Tapping a day with an event dot opens that day's event(s) in a sheet; "today" ring is always visible even with no events. Minimum 44pt (iOS) / 48dp (Android) touch target per cell (see `DESIGN.md` implementation flag on the 7-column-week constraint). |
| News post / document row (reuses `{components.event-list-item}` / `{components.card}`) | News & Documents (family) | No dedicated component — see `DESIGN.md` Components ("News & Documents (populated state)"). Tapping a row opens the full post/document; it behaves like a read-only `event-list-item` without the date badge. |
| Meal selection row (`{components.meal-row}`) | Menu (family) | Day tabs (Mon–Sun) each show that day's meal options as selectable rows; one-tap submission per FR (no multi-step wizard). Editing an existing order re-opens the same row pre-filled; "Cancel order" is a destructive-styled (`{colors.destructive}`) text action, not a full button. |
| Photo upload + retry queue (`{components.upload-item}`) | Staff mobile photo upload | On upload tap: optimistic "Uploading…" state on the `upload-item` row itself. On failure: silently queues and retries at 30s → 2min → 5min. After 3 failed attempts, the `upload-item` shows a manual "Retry" affordance inline **and** a `{components.toast-banner}` error variant surfaces once ("We couldn't upload this photo — check your connection and try again") — the toast is a one-time escalation notice; the `upload-item`'s own inline state persists in the queue regardless of whether the toast was dismissed. Never blocks the staff member from continuing to shoot/queue more photos while one is retrying. |
| Sidebar / bottom nav (`{components.sidebar-nav}`, `{components.bottom-tab-bar}`) | Global | Active item always visually distinct (`{colors.primary}`). Badge counts are **not** used anywhere in Evergreen — no red dot escalation; new content is discoverable by opening the relevant tab, matching the calm, non-nagging tone set in Voice and Tone. |
| Form input (`{components.form-input}`) | All forms (both surfaces) | Keyboard-avoiding view on every mobile form (PRD implementation consideration). Inline validation on blur, not on every keystroke. Focus ring uses `{colors.ring}` on web; native focus highlight on mobile. Minimum 44pt (iOS) / 48dp (Android) touch target. |
| Empty state (`{components.empty-state}`) | Any list-shaped screen with no data | See State Patterns below for the exact per-screen copy. |
| Buttons / cards / nav chrome (`{components.button-primary}`, `{components.button-secondary}`, `{components.button-outline}`, `{components.card}`, `{components.featured-card}`, `{components.resident-profile-card}`, `{components.top-nav}`) | Global | Presentational / visual-only — no special interaction behavior beyond standard press/tap and focus states as specified in `DESIGN.md` Components. Not listed individually here because there is nothing behavioral to add beyond that. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Cold load (any list screen) | Both | Skeleton rows/tiles matching the expected layout (e.g. 3 gallery-tile placeholders, 3 event-list-item placeholders) **[ASSUMPTION — standard sensible pattern, no separate user input gathered]**. Resolves on data arrival. |
| No photos yet | Photos (family) | `empty-state`: "No photos yet — check back soon." No action button (nothing for the family to do). |
| No events scheduled | Events (family) | `empty-state`: "No events scheduled right now." |
| No news/documents | News (family) | `empty-state`: "Nothing posted yet." |
| No residents linked | Home (family, first run before invite code accepted) | Routed instead into the invite-code onboarding step — this state should not be reachable post-onboarding. |
| Invalid or expired invite code | Onboarding (family, FR5) | Inline, field-level error under the code entry field: "That invite code isn't valid — check with the home for a new one." No app-level redirect or crash; the user stays on the same onboarding screen and can re-enter a code. |
| No residents in home yet | Residents (home admin) | `empty-state`: "No residents yet." Primary action: "Add a resident." |
| No events created | Events (staff/home admin) | `empty-state`: "No events yet." Primary action: "Create an event." |
| No content yet (news/documents/menus/schedules/notices), no users yet, no homes yet, no home admin assigned yet, no meal orders yet | Content editor, Users, Homes, Home admin assignment, Meal orders view (staff/home admin/super admin) | All follow the same `empty-state` pattern shown above for Residents/Events: a short "No [x] yet" headline plus, where an action exists, one primary action (e.g. "Create the first [x]"); views that are purely a report of another surface's data (e.g. Meal orders before any family has ordered) show the headline with no action button, matching "No photos yet." |
| Permission denied (role-gated or home-scoped access) | Both surfaces, all roles | If a signed-in user reaches a route their role or `home_id` scope doesn't permit (e.g. staff hitting an admin-only route, a home admin hitting a super-admin-only route, or any cross-home data request), show a clear "You don't have access to this" message with a way back to a screen they do have access to — never a silent failure, a blank screen, or a generic/technical error. |
| Offline / no connection | Global, both surfaces | `toast-banner` info variant (`{colors.accent-blue}`): "You're offline — showing saved content." Persists as a banner (not a one-off toast) while offline; cached content remains visible and interactive for reading; write actions (sign up, upload, submit order) are disabled or queued rather than silently failing. |
| Photo upload retrying | Staff mobile upload | Inline "Uploading… (retrying)" state on the affected item; no modal interruption. |
| Photo upload failed (3 attempts exhausted) | Staff mobile upload | `toast-banner` error variant (`{colors.destructive}`): "We couldn't upload this photo." Manual retry affordance stays on the item indefinitely until retried or discarded. |
| Session expired | Both | Redirect to login with an explanatory message: "Your session ended. Please log in again." (FR7) — never a silent redirect. |
| Form validation error | Both | Inline, field-level message in `{colors.destructive}` text under the offending field; no full-screen or modal error for simple validation. |
| Event at capacity | Events (family) | Sign-up button replaced with a disabled state reading "Fully booked" rather than hidden — family still sees the event exists. Admin sees the same capacity count on the attendee list and can raise capacity or add a second session (see Key Flows — James). |

## Interaction Primitives

- **Pull-to-refresh** on every list screen on mobile (photos, events, menu, news) — PRD implementation consideration, standard native gesture, no custom affordance needed.
- **Swipe** — left/right between photos in the full-screen gallery viewer; swipe-to-dismiss closes it. No swipe-to-delete or swipe actions on list rows in V1 (keeps the surface predictable for a less tech-fluent family audience).
- **One-tap actions** — event sign-up, meal order submission, photo upload confirmation are all single-tap with no intermediate confirmation dialog; the system trusts the action and confirms via toast afterward, matching Evergreen's low-friction, non-bureaucratic posture (mirrors the brief's "one-tap registration" / "one-tap submission" framing).
- **Deep linking** — a push notification (new photo, event reminder, cancellation) opens the app directly to the relevant detail screen (event detail, photo in gallery) rather than dropping the user on the app's home screen (PRD: "Deep link handling (push → event detail screen) in V1").
- **CSV export** (web portal only) — a single click/tap triggers a browser download; no configuration step. Used for event attendee lists and meal orders (FR36, FR42).
- **Camera / gallery picker** (mobile, staff and family) — native OS picker sheet; no custom in-app camera UI beyond what Expo's image picker provides.

## Accessibility Floor

Basic good practices, not a formal WCAG AA audit **[ASSUMPTION]**. Visual contrast values live in `DESIGN.md` — cross-referenced here by token name only.

- Text-on-background contrast meets AA at normal sizes: `{colors.foreground}`/`{colors.muted-foreground}` against `{colors.background}`/`{colors.muted}`, and `{colors.primary-foreground}` against `{colors.primary}` — see `DESIGN.md` Colors for the ratios and the primary-pairing re-verification note. Any new color pairing introduced later should be checked against these before shipping.
- Touch targets on mobile are generously sized (44pt (iOS) / 48dp (Android) minimum) — applies to tab bar items, gallery tiles, event sign-up buttons, `{components.form-input}` fields, `{components.event-calendar-cell}` day cells, the meal-row "Cancel order" text action, and especially the resident-switcher pills, since the family audience skews older and less tech-fluent. **Implementation flag:** fitting a full 7-column calendar week into a phone-width grid while also guaranteeing 44pt per cell is a real layout constraint (see `DESIGN.md` Components — `event-calendar-cell`); don't quietly shrink cells below the floor to force all 7 columns to fit.
- System font-size / Dynamic Type (iOS) and font scaling (Android) are respected throughout the mobile app; no locked text sizes, no truncation of controls at larger accessibility sizes.
- Web portal keyboard navigation and focus order follow shadcn/ui defaults: `Tab` order matches visual/reading order, focus ring uses `{colors.ring}`, `Esc` closes the topmost modal/sheet. The one explicit commitment beyond those defaults: opening a modal or the mobile nav sheet traps focus within it, and closing it (via `Esc`, an explicit close action, or completing its task) returns focus to the element that triggered it — this matters most for staff, whose primary portal entry point is a personal mobile browser.
- No color-only signaling: event RSVP state, upload status, and validation errors always pair color with text (never a bare colored dot or icon as the only signal) — matches the "text-first, plain-language" posture from Voice and Tone. This also covers the calendar "has event" dot (`{colors.accent}`): it is never the only signal that a day has an event — the day is also announced/labeled as such (e.g. accessible label or a small count).

## Key Flows

Adapted directly from the PRD's four persona journeys; each keeps the PRD's protagonist name and narrative beats, mapped onto the surfaces and components defined above.

### Flow 1 — Maria, family member (mobile app)

1. Maria gets an invite from the home and installs the app; onboarding asks for the invite code, resolves to her dad's resident profile (`resident-profile-card`).
2. Home screen opens on his profile. She taps the **Photos** tab first — sees a photo from the garden yesterday via a `gallery-tile`, opens it full-screen, saves it.
3. She taps **Events**, sees the coffee morning on Thursday as an `event-list-item`, taps **Sign up** — one tap, no confirmation dialog, success toast confirms.
4. She checks **Menu**, sees his lunch selection for today.
5. **Climax:** that evening she calls her dad and tells him she saw the garden photo and signed him up for Thursday — he lights up. The app made something true and specific about his day visible to her within minutes of it happening.
6. **Resolution:** she opens the app 3–4x/week; the resident switcher never appears for her (single resident linked) — one clean, unswitched Home screen every time.

Failure path: if her connection drops mid-session, cached photos/events remain visible with the offline info banner; sign-up is disabled until connectivity returns.

### Flow 2 — Sarah, staff (mobile photo upload + web portal)

1. Sarah snaps a photo of Mr Chen in the garden on her phone, opens the app's single photo-upload screen, selects his name, adds a caption, taps upload.
2. Weak home WiFi causes the upload to retry automatically in the background (see Failure path below); it succeeds without Sarah needing to notice or intervene.
3. She switches to the web portal (from her phone's browser or a shared desktop) and creates a "Summer BBQ" event: title, date, time, location, capacity — publishes it via `event-list-item`'s admin creation form.
4. Later she checks the attendee list on the portal — 8 families already signed up.
5. Thursday morning: she opens Meal Orders on the portal, exports the day's CSV in one click, hands it to the kitchen.
6. **Climax:** the CSV export replaces what used to be a manual paper tally — the entire meal-ordering admin loop closes in one tap instead of a stack of slips.
7. **Resolution:** her admin time drops sharply; she spends it on the floor with residents instead.

Failure path: transient connectivity (e.g. weak home WiFi) causes an upload to fail silently once or twice — it auto-retries (30s → 2min → 5min) and Sarah never has to notice. If all 3 retries are exhausted, the `upload-item` shows a manual "Retry" affordance and a one-time error toast, and Sarah can keep shooting/queuing other photos meanwhile. Separately, if publishing the "Summer BBQ" event fails on the portal (e.g. a network drop on submit), the form retains her entered data and shows an inline error so she can retry without re-entering everything.

### Flow 3 — James, home admin (web portal)

1. James logs into the portal, lands on his home's dashboard (metrics: active families, recent uploads, upcoming events; see [key-admin-dashboard.html](mockups/key-admin-dashboard.html)).
2. He adds a new resident (name, room, photo, DOB) in a `form-input`-driven flow, then links the daughter's email to her dad — she receives an automatic invite.
3. He opens the news editor, writes "Visiting hours extended for summer," publishes — it appears on the family app instantly (no separate per-home page to update, unlike the old spreadsheet-and-photocopy workflow).
4. A family member calls upset about missing an event. James opens the event on the portal, sees it hit its 32-person capacity (the same "Fully booked" state Maria would have seen), and creates a second session in ~2 minutes; affected/new families are notified via push.
5. **Climax:** what used to require digging through paper folders and editing 12 separate home pages now takes minutes, and the capacity problem is visible and fixable the moment it's reported — not after the event has already happened.
6. **Resolution:** James's weekly content-admin time drops from ~6 hours to ~2.

Failure path: if publishing the news update, or creating the second event session, fails (e.g. a network drop on submit), the editor/form retains James's entered content and shows an inline error so he can retry without redoing the work — the family member's complaint stays open until he confirms the fix actually went live.

### Flow 4 — Priya, super admin (web portal, platform-wide)

1. Priya logs into the platform dashboard: 12 homes, 340 active family accounts this week, 1,200 photos uploaded, 85 events created — a view no single home has ever had.
2. She drills into one home whose engagement looks low and sees its home admin hasn't uploaded a photo in three weeks — a concrete, actionable signal rather than a vague sense that "something's off."
3. She clicks "Add Home," fills in name/address/timezone, and assigns a new home admin — the home is live, fully data-isolated by `home_id`, with no manual database work.
4. **Climax:** a new care group wants to join; Priya creates their home and admin, confirms data isolation is automatic, and the whole onboarding takes five minutes rather than weeks of configuration.
5. **Resolution:** Priya manages all 12 (soon 20) homes from one dashboard, with per-home visibility into who's thriving and who needs a nudge.

Failure path: if Priya tries to create a home with a name that already exists (or the creation call fails for another reason), an inline validation/error message identifies the conflict and no partial or duplicate home record is created — she corrects the name (or retries) without losing the rest of the entered form data.

## Responsive & Platform

| Breakpoint / surface | Behavior |
|---|---|
| Web portal, desktop (`lg`, 1024px+) | `sidebar-nav` visible and expanded; dashboard panels render in a multi-column grid; tables (attendee lists, meal orders) show full column sets. |
| Web portal, tablet (`md`, 768–1023px) | Sidebar collapses to icon-only rail; dashboard panels stack to fewer columns; tables scroll horizontally where needed rather than hiding columns silently. |
| Web portal, staff personal mobile browser (`< md`) | Sidebar becomes a sheet triggered from a top bar; every admin surface (events, meal orders, residents, users) must remain usable here — this is Sarah's primary way of reaching the portal day-to-day, not an edge case. Single-column layout throughout. |
| Mobile app, iOS 15+ | Native iOS conventions for gestures (swipe-back, pull-to-refresh), permission prompts (camera/photo library explained on first use per store compliance), and Dynamic Type. |
| Mobile app, Android 12+ | Native Android conventions for back behavior and font scaling; same feature parity as iOS — single codebase via Expo, no platform-specific feature gaps in V1. |
| Cross-platform parity | Family and staff mobile screens are functionally identical on iOS and Android — no iOS-only or Android-only feature. The web portal is the only surface with genuinely different layouts per breakpoint, since it must serve desktop admin work and one-handed staff mobile-browser use from the same codebase. |

