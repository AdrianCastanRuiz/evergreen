---
name: Evergreen
description: Warm-professional care-home family communication platform. Shared token system for the React Native (Expo) family/staff app (React Native Reusables on NativeWind) and the shadcn/ui responsive web admin portal. Visual identity inherited as-is from evergreen-homecare.com; light mode only in V1.
status: final
sources:
  - "{planning_artifacts}/prd.md"
updated: 2026-07-01
colors:
  # [ASSUMPTION] Exact hex values below are derived from visual analysis of
  # https://evergreen-homecare.com/ (memlog assumption, later confirmed as
  # "inherit brand as-is" decision) rather than a formal brand guideline doc.
  # Token names follow shadcn/Tailwind CSS-variable convention so both the
  # web portal (shadcn/ui) and the mobile app (React Native Reusables /
  # NativeWind) can consume the same palette.
  primary: '#1B853F'
  primary-hover: '#19570D'
  primary-foreground: '#FFFFFF'
  secondary: '#2C643F'
  secondary-foreground: '#FFFFFF'
  accent: '#2E8C8F'
  accent-blue: '#3070A5'
  accent-blue-hover: '#3C7AD1'
  accent-blue-foreground: '#FFFFFF'
  background: '#FFFFFF'
  foreground: '#222222'
  card: '#FFFFFF'
  card-foreground: '#222222'
  muted: '#F8F8F8'
  muted-alt: '#F6F6F6'
  muted-foreground: '#5C5C5C'
  border: '#8C8C8C'
  border-strong: '#6E6E6E'
  input: '#8C8C8C'
  ring: '#1B853F'
  # [NOTE FOR UX] evergreen-homecare.com is a marketing site with no forms,
  # so no error/destructive color exists in the source material. Placeholder
  # below is a conventional accessible red chosen to sit quietly next to the
  # green palette; confirm with Evergreen Care Group / their brand owner
  # before this ships.
  destructive: '#C23934'
  destructive-foreground: '#FFFFFF'
typography:
  # [ASSUMPTION] Font choices and the heading/body pairing are carried over
  # from the visual analysis of evergreen-homecare.com (memlog assumption).
  hero:
    fontFamily: 'Roboto'
    fontSize: 34px
    fontWeight: '600'
    lineHeight: '1.15'
    letterSpacing: '-0.01em'
  heading:
    fontFamily: 'Oswald'
    fontSize: 22px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: '0.01em'
  heading-sm:
    fontFamily: 'Oswald'
    fontSize: 17px
    fontWeight: '700'
    lineHeight: '1.25'
    letterSpacing: '0.01em'
  section-title:
    fontFamily: 'Raleway'
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: 'normal'
    # note: site reference uses ~31px for marketing section titles; scaled
    # down for in-app section headers (e.g. "Upcoming Events", "This Week's
    # Menu") where 31px would overwhelm a phone screen. [ASSUMPTION]
  body:
    fontFamily: 'Open Sans'
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  body-emphasis:
    fontFamily: 'Open Sans'
    fontSize: 16px
    fontWeight: '500'
    lineHeight: '1.5'
  button-label:
    fontFamily: 'Open Sans'
    fontSize: 15px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: '0.01em'
  caption:
    fontFamily: 'Open Sans'
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.4'
    # note: raised from 13px — a more forgiving unscaled floor for the
    # older-skewing family audience, since this is the smallest text in the
    # system and carries meta info (dates, times) they rely on. [ASSUMPTION]
rounded:
  sm: 3px
  DEFAULT: 8px
  md: 11px
  lg: 16px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 20px
  '6': 24px
  '8': 32px
  '10': 40px
  '12': 48px
  '16': 64px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
  section-gap: 32px
  card-padding: 16px
components:
  button-primary:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    hover: '{colors.primary-hover}'
    radius: '{rounded.sm}'
    label: '{typography.button-label}'
  button-secondary:
    background: '{colors.secondary}'
    foreground: '{colors.secondary-foreground}'
    radius: '{rounded.sm}'
    label: '{typography.button-label}'
  button-outline:
    background: 'transparent'
    border: '{colors.primary}'
    foreground: '{colors.primary}'
    radius: '{rounded.sm}'
    label: '{typography.button-label}'
  card:
    background: '{colors.card}'
    foreground: '{colors.card-foreground}'
    border: '{colors.border}'
    radius: '{rounded.md}'
    padding: '{spacing.card-padding}'
  featured-card:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    border: '{colors.background}'
    borderWidth: '2px'
    radius: '{rounded.md}'
    padding: '{spacing.card-padding}'
  gallery-tile:
    radius: '{rounded.DEFAULT}'
    background: '{colors.muted}'
    gap: '{spacing.2}'
  resident-profile-card:
    background: '{colors.card}'
    border: '{colors.border}'
    radius: '{rounded.md}'
    accentBar: '{colors.primary}'
    padding: '{spacing.card-padding}'
  resident-switcher:
    background: '{colors.muted}'
    activeBackground: '{colors.primary}'
    activeForeground: '{colors.primary-foreground}'
    radius: '{rounded.full}'
  event-list-item:
    background: '{colors.card}'
    border: '{colors.border}'
    radius: '{rounded.DEFAULT}'
    dateBadgeBackground: '{colors.secondary}'
    dateBadgeForeground: '{colors.secondary-foreground}'
  event-calendar-cell:
    radius: '{rounded.full}'
    todayBorder: '{colors.primary}'
    hasEventDot: '{colors.accent}'
    minTouchTarget: '44pt (iOS) / 48dp (Android)'
  meal-row:
    background: '{colors.card}'
    border: '{colors.border}'
    radius: '{rounded.DEFAULT}'
    dayTabActiveBackground: '{colors.primary}'
    dayTabActiveForeground: '{colors.primary-foreground}'
    dayTabInactiveForeground: '{colors.muted-foreground}'
    title: '{typography.body-emphasis}'
    meta: '{typography.caption}'
  bottom-tab-bar:
    background: '{colors.background}'
    border: '{colors.border}'
    activeForeground: '{colors.primary}'
    inactiveForeground: '{colors.muted-foreground}'
  sidebar-nav:
    background: '{colors.card}'
    border: '{colors.border}'
    activeBackground: '{colors.muted}'
    activeForeground: '{colors.primary}'
    inactiveForeground: '{colors.foreground}'
  top-nav:
    background: '{colors.background}'
    border: '{colors.border}'
    foreground: '{colors.foreground}'
  form-input:
    background: '{colors.background}'
    border: '{colors.input}'
    foreground: '{colors.foreground}'
    radius: '{rounded.DEFAULT}'
    focusRing: '{colors.ring}'
    minTouchTarget: '44pt (iOS) / 48dp (Android)'
  empty-state:
    foreground: '{colors.muted-foreground}'
    headingStyle: '{typography.section-title}'
  toast-banner:
    infoBackground: '{colors.accent-blue}'
    infoForeground: '{colors.accent-blue-foreground}'
    errorBackground: '{colors.destructive}'
    errorForeground: '{colors.destructive-foreground}'
    successBackground: '{colors.primary}'
    successForeground: '{colors.primary-foreground}'
    radius: '{rounded.DEFAULT}'
  upload-item:
    background: '{colors.card}'
    border: '{colors.border}'
    radius: '{rounded.DEFAULT}'
    uploadingForeground: '{colors.muted-foreground}'
    retryForeground: '{colors.destructive}'
    thumbnailRadius: '{rounded.DEFAULT}'
---

# Evergreen — Design Spine

## Brand & Style

Evergreen inherits the visual identity of the parent brand, evergreen-homecare.com, as-is: warm-professional-institutional, caregiving without being clinical. No hospital blue-and-white, no sterile iconography — the posture is a trusted local care-home group, not a medical device. Warm human photography (residents, gardens, communal rooms) does the emotional work; interface chrome stays quiet and gets out of the way.

This is a two-surface product sharing one token system: a React Native (Expo) app for families (and a narrow staff photo-upload flow), built on **React Native Reusables** (shadcn-for-RN, on NativeWind), and a fully responsive **shadcn/ui** web admin portal for staff, home admins, and super admins. Both are Tailwind-based, so every token in this document is named the way a shadcn theme would name it (`primary`, `primary-foreground`, `muted`, `border`, etc.) even though the values are Evergreen's real brand hex codes, not shadcn's defaults. A token change here should be a one-line edit in both the web Tailwind config and the RN NativeWind config. The web admin portal also inherits shadcn/ui's `Table`, `Dialog`, `Sheet`, and `Tabs` primitives as-is — used respectively for attendee lists / meal-order views, modals, the mobile-browser nav sheet, and the day-tab / content-editor tab groups. These are not customized beyond the token palette (colors, radius, typography) defined in this document.

**[Design decision]** The parent brand's logo mark is a classic serif small-caps wordmark ("EVERGREEN HOMECARE") set inside a circular sage-green pine-tree isotype. That serif-in-logo / sans-in-body contrast on the marketing site is a deliberate brand flourish, but this product unifies all **UI chrome** (headings, nav labels, body copy, buttons) to the sans-serif system (Oswald / Raleway / Roboto / Open Sans). The logo itself is never redrawn or re-set in a UI font — it appears exactly as supplied, as a lockup, in the top nav / login screen / app icon. Reasoning: a serif headline face reads beautifully on a marketing page with generous whitespace; inside dense list-based screens (photo captions, event rows, meal tables) on a small phone, a condensed sans (Oswald) stays legible at small sizes and keeps the two UI systems (RN + shadcn) visually identical without needing a second serif webfont bundled into the Expo app.

Light mode only for V1 — no dark variant is defined or needed **[ASSUMPTION]**.

## Colors

- **Primary Green (`{colors.primary}`, `#1B853F`)** is the brand's core color and Evergreen's primary action color: primary buttons, active nav/tab states, the resident switcher's active pill, links, and the accent bar on the resident profile card. `{colors.primary-hover}` (`#19570D`, a darker shade of the *same* hue) is used on hover/press states — the brand's interaction pattern darkens rather than shifts hue, and that rule is carried through everywhere in this system. `{colors.primary-foreground}` (white) on `{colors.primary}` — and `{colors.primary}` text on white for links — computes to ≈4.69:1, which passes AA (4.5:1) for normal text but with very little margin. **[ASSUMPTION]** Because `{colors.primary}` itself is a placeholder hex pending brand-owner confirmation (see below), this pairing must be explicitly re-verified once the real brand green is confirmed with the client — a slightly lighter final hex could fail outright.
- **Secondary Green (`{colors.secondary}`, `#2C643F`)** is a supporting, slightly cooler/darker green used for secondary buttons, date badges on event list items, and section dividers where a second tone is needed without competing with primary. `{colors.secondary-foreground}` (white) on `{colors.secondary}` computes to ≈7.0:1 — comfortably passes AA.
- **Teal Accent (`{colors.accent}`, `#2E8C8F`)** is used sparingly as a highlight: the "has event" dot on calendar cells, and small accent details (icon fills) that need to read as "attention, not alarm." This value was darkened from an earlier, lighter teal specifically so the calendar dot clears ≈4.0:1 against a white/muted cell background (comfortably past the 3:1 non-text/UI-component floor) — see Components (`event-calendar-cell`) for the accompanying non-color fallback.
- **Blue Accents (`{colors.accent-blue}` / `{colors.accent-blue-hover}`, `#3070A5` / `#3C7AD1`)** are the brand's most underused reserve colors — used sparingly if at all. In this product they get exactly one job: the offline/connectivity info banner. Blue reads calm and informational, never alarming, which matches "we're offline, your content is cached" rather than "something is broken." `{colors.accent-blue-foreground}` (white) on `{colors.accent-blue}` computes to ≈5.27:1 — passes AA. (Note: the *hover*-only fill `{colors.accent-blue-hover}` with white text is ≈4.29:1, under AA for normal text — low real-world risk since it's a transient, pointer-only hover state and never renders static label text, but avoid using it to render static text.)
- **Neutrals** — `{colors.muted-foreground}` (`#5C5C5C`) for secondary/meta text (timestamps, captions, helper text) — darkened from an earlier `#7A7A7A` specifically because that lighter gray failed AA (≈4.29:1 on white / ≈4.04:1 on `{colors.muted}`, both under the 4.5:1 floor for normal text) on exactly the meta text this component carries; `#5C5C5C` computes to ≈4.6–4.7:1 against both `{colors.background}` and `{colors.muted}`, clearing AA; `{colors.muted}` (`#F8F8F8`) and `{colors.muted-alt}` (`#F6F6F6`) for section backgrounds and subtle card fills; `{colors.border}` (`#8C8C8C`, ≈3.4:1 against white) and `{colors.border-strong}` (`#6E6E6E`, ≈5.1:1 against white) for dividers, input borders, and card outlines — both darkened from earlier near-invisible hairline grays (`#D8D8D8` ≈1.42:1, `#D1D1D1` ≈1.53:1) so UI boundaries clear the ~3:1 non-text-contrast guidance and stay perceivable without relying on focus state alone; `{colors.background}` / `{colors.card}` (`#FFFFFF`) for primary surfaces.
- **Foreground (`{colors.foreground}`, `#222222`)** is the primary text/heading color. **[ASSUMPTION]** The site extraction only captured the secondary body-text gray (see Neutrals above); no exact heading-black hex was available, so a conventional near-black was chosen for headings and high-contrast body text pending brand confirmation.
- **Destructive (`{colors.destructive}`, `#C23934`)** — **[NOTE FOR UX]** evergreen-homecare.com has no forms and defines no error/destructive color. This is a placeholder red chosen to read clearly against the green palette without clashing; used only for destructive actions (cancel registration, delete resident, remove user) and hard error states (upload failed after 3 retries). `{colors.destructive-foreground}` (white) on `{colors.destructive}` computes to ≈5.35:1 — passes AA. Confirm with the client's brand owner before ship.

Avoid: introducing a new brand hue beyond this palette, using the blue accent for anything decorative or as a second "primary," and using red for anything other than a genuine destructive action or terminal error — Evergreen is not a system that scolds its users.

## Typography

Evergreen's type system carries four families forward from the parent brand, each with one clear job — no family is used interchangeably with another:

- **`{typography.hero}` — Roboto 600.** Reserved for hero-scale moments: the onboarding welcome screen, the login screen's greeting, empty-state headlines on a first-run screen. Used rarely — at most once per surface.
- **`{typography.heading}` / `{typography.heading-sm}` — Oswald 700, condensed bold sans.** The workhorse heading face: screen titles, nav bar titles, resident name on the profile card, event titles. Oswald's condensed form stays legible at small sizes, which matters on dense mobile list screens.
- **`{typography.section-title}` — Raleway 600.** Section headers *within* a screen — "Upcoming Events," "This Week's Menu," "Recent Photos," admin portal panel headers. **[ASSUMPTION]** Scaled down from the site's ~31px marketing usage to 20px for in-app use; 31px would overwhelm a phone screen or a portal content panel.
- **`{typography.body}` / `{typography.body-emphasis}` / `{typography.button-label}` — Open Sans 400/500.** All body copy, captions, form labels, and every button label. Open Sans 500 (`body-emphasis`) is used for anything that needs light emphasis without jumping to a heading face (e.g. a resident's name inline in a sentence, "Sign up" confirmation copy).
- **`{typography.caption}` — Open Sans 400, 14px, set in `{colors.muted-foreground}`.** Timestamps, photo captions, meta rows. Raised from an earlier 13px to give a more forgiving unscaled floor for the older-skewing family audience, since this is the smallest text size in the system and carries meta information (dates, times) that audience relies on.

These sizes are authored for both surfaces: the web portal renders them at the same px values via Tailwind's `text-*` scale, and the mobile app renders the same numeric values as NativeWind's `text-*` classes (RN treats them as density-independent points). Respect the OS-level system font-size setting on mobile — do not lock text size against Dynamic Type / Android font scaling **[ASSUMPTION — basic accessibility floor, not a formal audit]**.

## Layout & Spacing

Spacing follows a 4px base scale (`{spacing.1}` through `{spacing.16}`), the same scale shadcn/Tailwind ships by default, so both UI systems consume it without translation.

- `{spacing.margin-mobile}` (16px) is the standard mobile screen margin; `{spacing.margin-desktop}` (32px) is the web portal's content margin at desktop widths.
- `{spacing.gutter}` (16px) separates cards/tiles in a list or grid on both surfaces.
- `{spacing.section-gap}` (32px) separates major sections within a screen (e.g. between the resident switcher and the photo gallery, or between portal dashboard panels).
- `{spacing.card-padding}` (16px) is the internal padding for `card` and `featured-card`.

Mobile app: single-column layouts throughout family/staff screens; the photo gallery is the one exception, rendered as a 3-column tile grid (see Components). Web portal: content area is fluid up to a max width at desktop sizes, collapsing to a single column below `md`; sidebar nav collapses to a top bar / sheet below `md` (see Responsive & Platform in EXPERIENCE.md).

## Elevation & Depth

Evergreen uses elevation sparingly and functionally, not decoratively — the brand's warmth comes from color and photography, not from skeuomorphic shadow stacks.

- Cards (`card`, `featured-card`, `resident-profile-card`, `event-list-item`) sit flush on the page background with a `{colors.border}` hairline rather than a shadow in default state. `{colors.border}` was deliberately darkened (to `#8C8C8C`, ≈3.4:1 against white) so this hairline stays perceivable on its own — an earlier, lighter hairline value (`#D8D8D8`, ≈1.42:1) fell well short of the ~3:1 non-text-contrast guidance and risked reading as invisible to an older/low-vision user relying on the border alone in default (non-focused) state.
- A subtle shadow (shadcn's default `shadow-sm` / RN Reusables' equivalent elevation-1) appears only on: the bottom tab bar and top/sidebar nav (to separate persistent chrome from scrolling content), modals/sheets, and the toast/banner (to read as "floating above" the current screen).
- Nothing in Evergreen uses elevation as a hierarchy device beyond that — hierarchy comes from typography weight, color, and the white-border-on-green `featured-card` pattern below, not from stacking shadows.

## Shapes

Moderate, warm rounding — enough to feel human, not enough to feel like a children's app.

- `{rounded.sm}` (3px) — buttons. Fairly square, matching the parent brand's button language; this is deliberately the tightest radius in the system so buttons read as "click/tap here," distinct from the softer cards around them.
- `{rounded.DEFAULT}` (8px) — form inputs, gallery tiles, event list items, toast/banner.
- `{rounded.md}` (11px) — cards, `featured-card`, resident profile card. This is the signature Evergreen card radius, carried directly from the reference site.
- `{rounded.lg}` (16px) — modals, bottom sheets, and other large overlay surfaces (extends the scale beyond what the source site needed, following the same warmth logic at larger sizes).
- `{rounded.full}` (9999px) — avatars, the resident-switcher pill, calendar "today" indicator, badge counts.

Photography (gallery tiles, resident avatars, hero images) always follows its container's corner radius exactly — never a separate, mismatched radius on the image itself.

## Components

Four load-bearing surfaces have 1:1 HTML mocks in `mockups/` illustrating the components below in context: [key-family-home.html](mockups/key-family-home.html), [key-photos-gallery.html](mockups/key-photos-gallery.html), [key-events-list.html](mockups/key-events-list.html), [key-admin-dashboard.html](mockups/key-admin-dashboard.html). Where a mock and this table disagree, this table wins — mocks illustrate, they don't amend the spine.

- **`button-primary`** — `{colors.primary}` fill, `{colors.primary-foreground}` text, `{rounded.sm}` corner, `{typography.button-label}`. Hover/press darkens to `{colors.primary-hover}` (same hue, never a hue shift). Used for the one primary action per screen: "Sign up," "Upload photo," "Publish," "Save."
- **`button-secondary`** — `{colors.secondary}` fill, white text, same shape rules. Used for secondary-but-still-affirmative actions (e.g. "View all photos" next to a primary "Sign up").
- **`button-outline`** — transparent fill, `{colors.primary}` border and text. Used for tertiary/cancel-adjacent actions that aren't destructive (e.g. "Not now" on a permission prompt).
- **`card`** — the base content container: white background, `{colors.border}` hairline, `{rounded.md}` corner, `{spacing.card-padding}` internal padding. Used for the standard resident profile card, portal dashboard panels, settings rows grouped in a card.
- **`featured-card`** — the reference site's distinctive white-border-on-solid-green pattern, promoted to a reusable component: `{colors.primary}` fill, white text, a 2px `{colors.background}` (white) border inset from the edge, `{rounded.md}` corner. Reserved for exactly one "this matters most right now" moment per screen — e.g. today's featured photo on the family home screen, or a "new event this week" callout. Never more than one per screen; if everything is featured, nothing is.
- **`gallery-tile`** — square photo tile in a 3-column grid, `{rounded.DEFAULT}` corner, `{spacing.2}` gap between tiles, `{colors.muted}` placeholder fill while loading. Tapping opens full-screen swipe view (behavior specified in EXPERIENCE.md). See [key-photos-gallery.html](mockups/key-photos-gallery.html) for the full-screen viewer with its tap-fallback affordance.
- **`resident-profile-card`** — photo + name (`{typography.heading}`) + room + DOB, `{colors.primary}` accent bar along one edge, `card` shape rules. The anchor component at the top of the family home screen; when a family has more than one linked resident, it renders inside the `resident-switcher`.
- **`resident-switcher`** — a horizontally-scrollable pill row (`{rounded.full}`) for 2–3 linked residents, or a dropdown for 4+; active resident's pill uses `{colors.primary}` fill / white text, inactive pills use `{colors.muted}` fill / `{colors.foreground}` text. Only rendered at all when a family has 2+ linked residents — for single-resident families this component doesn't appear. When rendered as a pill row, the trailing edge shows a partial peek of the next pill (rather than a hard crop) as a visible scroll cue, since an undiscovered horizontal-scroll interaction would otherwise hide a linked resident entirely for a less tech-fluent user. See [key-family-home.html](mockups/key-family-home.html) for both the single-resident state and an illustrative 3-resident pill row.
- **`event-list-item`** — card-shaped row (`{rounded.DEFAULT}`), a `{colors.secondary}`-filled date badge (day + month) on the leading edge, title in `{typography.heading-sm}`, time/location in `{typography.caption}`. See [key-events-list.html](mockups/key-events-list.html) for the not-registered, registered, and fully-booked states.
- **`event-calendar-cell`** — day cell in calendar view; `{colors.accent}` dot indicates "has event," `{colors.primary}` ring indicates "today," `{rounded.full}` shape for both indicators. Minimum touch target is 44pt (iOS) / 48dp (Android) per cell — **implementation flag:** fitting a full 7-column week into a phone-width grid while also guaranteeing 44pt per cell is a real layout constraint; do not shrink cells below the floor to force all 7 columns to fit — allow horizontal scroll or a narrower per-cell content treatment instead.
- **`meal-row`** — the Menu tab's day-tab + meal-option row family: `card`-shaped container (`{colors.card}` background, `{colors.border}` hairline, `{rounded.DEFAULT}` corner); day tabs (Mon–Sun) use `{colors.primary}` fill / `{colors.primary-foreground}` text when active and `{colors.muted-foreground}` text when inactive; each meal-option row's title renders in `{typography.body-emphasis}`, supporting meta (e.g. dietary tag) in `{typography.caption}`.
- **`bottom-tab-bar`** (mobile) — family/staff app persistent bottom navigation. White background, `{colors.border}` top hairline + subtle shadow, active tab in `{colors.primary}`, inactive tabs in `{colors.muted-foreground}`.
- **`sidebar-nav`** (web, `md`+) — portal's persistent left navigation for staff/home admin/super admin. `{colors.card}` background, active item gets a `{colors.muted}` background fill with `{colors.primary}` label/icon. See [key-admin-dashboard.html](mockups/key-admin-dashboard.html) for the home admin dashboard at the `lg` breakpoint.
- **`top-nav`** (web, all widths; mobile app screen headers) — white background, `{colors.border}` bottom hairline, `{colors.foreground}` title text, houses the Evergreen logo lockup (unmodified) on the portal's desktop header.
- **`form-input`** — white fill, `{colors.input}` border, `{rounded.DEFAULT}` corner, `{colors.ring}` focus ring (`{colors.primary}`) on focus. Consistent across mobile forms and portal forms. Minimum touch target is 44pt (iOS) / 48dp (Android), same floor as other interactive elements in this system.
- **`empty-state`** — centered icon or simple illustration + `{typography.section-title}` headline + one line of `{typography.body}` copy + at most one primary action. Used for "No photos yet," "No events scheduled," "No residents linked yet" (see EXPERIENCE.md State Patterns for per-screen copy).
- **`toast-banner`** — three semantic variants sharing `{rounded.DEFAULT}`: info (`{colors.accent-blue}` — offline/connectivity), success (`{colors.primary}` — "Photo uploaded," "Signed up"), error (`{colors.destructive}` — upload failed after retries, session expired).
- **`upload-item`** — the queued-photo-upload list item's own visual state, distinct from `toast-banner`: `card`-shaped row (`{colors.card}` background, `{colors.border}` hairline, `{rounded.DEFAULT}` corner) with a thumbnail (same radius as its container) and an inline status label — "Uploading…" in `{colors.muted-foreground}` while retrying, or a "Retry" text action in `{colors.destructive}` once all 3 automatic attempts are exhausted. `toast-banner` (error variant) is reserved for the one-time escalation notice after the 3rd failed attempt; `upload-item` is the persistent per-photo state shown inline in the queue regardless of whether the toast has been dismissed.
- **News & Documents (populated state)** — no dedicated component: reuses `event-list-item`'s card-row shape (title in `{typography.heading-sm}`, date/meta in `{typography.caption}`) without the date badge, or plain `card` for longer document/notice entries. Honest reuse rather than a bespoke component, since a news post or document row needs the same anatomy — title, meta, tap-to-open — as an event row minus the date badge.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Darken `{colors.primary}` to `{colors.primary-hover}` on hover/press (same hue) | Shift hue on hover/press (e.g. green → teal) |
| Use `{colors.accent-blue}` only for the offline/info banner | Use blue as a second primary or for decorative chrome |
| Reserve `featured-card` for one "matters most" moment per screen | Stack multiple `featured-card`s on one screen |
| Keep UI chrome (headings, labels, nav) in the sans-serif system | Re-set the Evergreen logo wordmark in a UI sans font |
| Use warm human photography for empty/hero moments | Use stock-corporate or clinical/hospital-style imagery |
| `{rounded.sm}` (3px) on buttons — deliberately square | Round buttons to match card radius (11px) — loses the brand's button identity |
| Respect system font-size / Dynamic Type on mobile | Lock text size or truncate controls at larger accessibility sizes |
| One primary action per screen (`button-primary`) | Multiple competing primary-styled buttons on one screen |
