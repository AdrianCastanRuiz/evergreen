---
name: 'Evergreen'
type: review
purpose: 'Reconcile ARCHITECTURE-SPINE.md against prd.md, DESIGN.md, and EXPERIENCE.md'
reviewed:
  - '_bmad-output/planning-artifacts/architecture/architecture-evergreen-2026-07-02/ARCHITECTURE-SPINE.md'
against:
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-evergreen-2026-07-01/DESIGN.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-evergreen-2026-07-01/EXPERIENCE.md'
date: 2026-07-02
---

# Review: Architecture Spine vs. Driving Inputs

## Verdict

The spine's AD-structure is strong on data isolation, media, and API-contract concerns, but it is backend-and-security-centric — several quiet, non-functional and client-side requirements from the PRD and UX docs have no architectural answer at all (not even a "Deferred" note), and the Capability→Architecture Map only tracks FRs, not NFRs, which is likely *why* they fell through.

## Meta-observation

The **Capability → Architecture Map** table maps every FR range to an AD, but there is no equivalent NFR → AD row anywhere in the spine. Nothing forces a reader to check "does NFR9 have an AD?" — which is consistent with several NFRs below having no real architectural treatment. Worth adding an NFR coverage row (even a compact one) to the map so this doesn't silently recur as the architecture evolves.

---

## 1. NFR-by-NFR check

| NFR | Requirement | Spine coverage | Verdict |
|---|---|---|---|
| NFR1 | Mobile screens <2s on 4G+ | No architectural mechanism (caching, prefetch, bundle size) — only implied via Cloudinary thumbnails (AD-4) | **Partial / quiet gap** — see finding #2 (no client data-layer decision at all) |
| NFR2 | API p95 <200ms | AD-1's `home_id`-leading composite indexes help; AD-15 gives *observability* (Sentry perf monitoring) but that's detection, not a design that achieves the target (no caching layer, no query-budget policy) | **Weak — reactive only, no proactive design** |
| NFR3 | Gallery thumbnails <1s via server-side compression | Covered — AD-4 (Cloudinary transformation URLs built per view) | OK |
| NFR4 | Push delivered within 30s of trigger | No AD addresses dispatch latency (queueing, batching, provider timeout budget) — AD-10 only covers home-scoping and dead-token handling | **Gap** |
| NFR5 | TLS 1.2+ in transit | Not stated anywhere in the spine (Render/Neon/Cloudinary defaults presumably satisfy it, but it's asserted nowhere — not even as a one-liner) | **Silently absent** (low severity — likely true by default, but unstated) |
| NFR6 | Encryption at rest for photos/documents | Not stated — Cloudinary/Neon likely encrypt at rest by default, but the spine never asserts or verifies this | **Silently absent** (low severity) |
| NFR7 | home_id scoping, no cross-home access | Strongly covered — AD-1 | OK |
| NFR8 | Tokens in platform keychain | Covered — AD-8 | OK |
| NFR9 | Password reset links expire within 1hr | **Not covered.** AD-14 only names the email provider (Resend) and its retry policy; nothing specifies where/how the reset token's TTL is enforced (token table with `expires_at`, signed-JWT-with-exp, etc.) | **Gap — flagged in PRD's Security NFRs, easy to silently miss in auth module design** |
| NFR10 | API rate limits on auth endpoints (login, password reset) | **Not covered anywhere** — no AD, no mention of a throttling mechanism (e.g. `@nestjs/throttler`, Render-level rate limiting) in Stack, Invariants, or Consistency Conventions | **Real gap — highest-severity finding, see #1 below** |
| NFR11 | New homes require no code/downtime | Implicit in the data model (Home is just a row) — reasonably covered by Design Paradigm + AD-1 | OK |
| NFR12 | 2,000 concurrent users, no degradation | **No capacity/scaling design.** No mention of Prisma/Neon connection pooling (Neon + Prisma over serverless/multi-instance Render is a classic connection-exhaustion failure mode), no mention of Render instance count/autoscaling, no load-shedding or backpressure strategy | **Gap — see #3 below** |
| NFR13 | 50,000 photos before archival/perf review | Reasonably covered — AD-9's 12-month cold-storage archival is a proactive answer even though the 50k trigger itself isn't named | OK (minor: the 50k number could be cross-referenced as a revisit trigger in Deferred) |
| NFR14 | Push delivery via FCM/APNs **with delivery status tracking** | AD-10 covers dead-token detection on `InvalidRegistration`, but "delivery status tracking" (recording sent/delivered/failed per notification, any visibility for staff/support) has no data model or mechanism | **Gap — see #4 below** |
| NFR15 | Email retry (3x: 60s/5min/30min) | Covered — AD-14 | OK |
| NFR16 | CSV export <10s for 5,000 rows | **Not covered.** Source Tree just notes "CSV export" lives in `events`/`meals` modules; no architectural treatment of how a 5,000-row export is generated (streaming response vs. full in-memory materialization) — and it silently contradicts the Consistency Conventions' "pagination... on every list endpoint" rule, since CSV export must return the full unpaginated set | **Gap — see #5 below** |

---

## 2. Risk Mitigation Strategy cross-check (PRD → spine)

| PRD mitigation | Spine AD | Verdict |
|---|---|---|
| API Contract Drift | AD-2 | Covered (CI type validation matches; MSW mocking is a dev-workflow detail, not architectural — fine to drop) |
| Poor Care Home WiFi — photo compression/retry | AD-9 | Covered for the *photo* part |
| Poor Care Home WiFi — "cached content shown offline with banner, pull-to-refresh retries" | **No AD** | **Gap — see #2 below.** This is the general-content half of the same mitigation, and it has no architectural home at all (no client-side cache/store decision) |
| Push Notification Token Management | AD-10 | Covered |
| Home-Scoped Notification Routing | AD-10 | Covered |
| Photo Storage Costs — max file size, 12-month archival | AD-9 | Covered |
| Photo Storage Costs — "billing alert at $50/month" | **No AD** | **Dropped** — minor/ops-level, but it's an explicit named mitigation in the PRD with no home in AD-15 (Observability) or elsewhere |
| Google Sheets Sync — Post-MVP | Deferred section | Covered |

---

## 3. Device Permissions / Offline Strategy / Store Compliance (PRD)

- **Offline Strategy** ("graceful degradation... app shows cached content when offline... no local DB or conflict resolution"): the spine correctly does *not* build a local DB (consistent with the PRD's explicit exclusion) — but it also never says **what does** cache content client-side. See finding #2.
- **Device Permissions / Store Compliance**: mostly UX-layer (permission-explanation copy, first-use prompts) — nothing architecturally actionable was found dropped here.

---

## 4. DESIGN.md tone/spirit check

- **Warm-professional, light-mode only, brand inheritance**: no architectural implication found beyond what's already captured — the Stack table already names React Native Reusables/NativeWind and shadcn/ui, matching DESIGN.md's chosen component systems. Light-mode-only is a design decision with no theming-infrastructure consequence worth an AD.
- **Accessibility floor** (AA contrast, Dynamic Type, 44pt/48dp touch targets, no color-only signaling): these are componentry-level concerns owned by the design system choice already in the stack; no separate architectural mechanism is obviously missing. Not flagged as a gap.

---

## 5. EXPERIENCE.md flows implying an architectural requirement

- **Deep linking** ("a push notification... opens the app directly to the relevant detail screen" — event detail, photo in gallery): this requires the push payload to carry a stable, typed reference (notification type + entity id/route) so the client can route deeply. AD-10 describes *dispatch* (home-scoping, dead-token handling) but says nothing about **payload shape** — this is the one piece of "notifications" architecture EXPERIENCE.md explicitly depends on that the spine is silent on. See finding #6.
- **Permission denied state** ("never a silent failure... generic/technical error"): the spine's error envelope (`{ error: { code, message, details? } }`) is generic-shaped but doesn't name a stable set of codes (e.g. distinguishing role-forbidden vs. home-scope-forbidden vs. not-found) that a client could branch on to render this specific UX state reliably. Minor — likely fine if `code` is free-form and the client just keys off HTTP 403, but worth a one-line convention.
- **Resident switcher persistence across foreground/background within a session**: implies some client-side session state; low architectural weight, not flagged as a real gap.

---

## Top Findings (ranked)

1. **[High] NFR10 — No rate limiting anywhere.** No AD, no library, no mention in Stack/Invariants for throttling login or password-reset endpoints. This is a named Security NFR with zero architectural answer.
2. **[High] Mobile client offline-cache/data-layer is architecturally unspecified.** TanStack Query appears in the Stack table but only alongside Vite+React (the *admin* portal); `apps/mobile` has no chosen data-fetching/caching library at all, yet "cached content shown offline" is a Technical Success criterion and a recurring UX State Pattern (offline banner, cached screens, pull-to-refresh retry). The spine architects the backend thoroughly but is silent on how the mobile client actually holds/serves cached data.
3. **[Medium] NFR12 (2,000 concurrent users) has no capacity design.** No mention of Prisma/Neon connection pooling (a classic failure mode for serverless Postgres + a horizontally-scaled API), no Render scaling story, no backpressure/load-shedding note.
4. **[Medium] NFR9 — password reset token expiry (1hr) has no mechanism.** AD-14 covers the email provider and retry policy but not where/how the reset link's TTL is enforced.
5. **[Medium] NFR16 — CSV export performance (5,000 rows/10s) has no architecture,** and silently conflicts with the Consistency Conventions' blanket "pagination on every list endpoint" rule (CSV export must return the unpaginated full set — this exception is never called out).
6. **[Medium] NFR14 — "delivery status tracking" for push is not actually built.** AD-10 only covers dead-token detection, not tracking/recording per-notification delivery outcome.
7. **[Low] Push notification payload shape (for deep-linking, FR43–46) is unspecified** — EXPERIENCE.md depends on it, AD-10 doesn't mention it.
8. **[Low] "Billing alert at $50/month" (Photo Storage Costs mitigation) has no home** in AD-15 (Observability) or elsewhere — quietly dropped from an explicitly named PRD mitigation.
9. **[Low] NFR5/NFR6 (TLS in transit, encryption at rest)** are never asserted in the spine at all, even as a one-line "inherited from Render/Neon/Cloudinary defaults" note.
