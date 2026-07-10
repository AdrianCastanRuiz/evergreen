# Rubric Review — ARCHITECTURE-SPINE.md (Evergreen, 2026-07-02)

**Verdict:** The spine is strong on tenant-level isolation, deployment/ops coverage, and honest tech-version verification, but it has one critical enforcement gap (family-to-resident scoping has no defense-in-depth analog to AD-1) plus several high-severity silent omissions (RBAC mechanism, email provider, mobile/API version compatibility) that a downstream implementer would have to invent unilaterally — exactly the kind of load-bearing divergence a spine exists to close off.

---

## Findings

### CRITICAL

**1. Resident-level scoping for family accounts has no enforcement mechanism — the PRD's core promise is unguarded.**
- *Where:* Missing from "Invariants & Rules" entirely; `FAMILY_LINK` appears only in the ERD (Core-Entity ERD section) with no consuming rule; AD-1 and the Capability Map both cite AD-1 as governing "Residents & Family Mapping (FR20–FR23)."
- *What's wrong:* AD-1 gives home-level isolation (family A at Home X cannot see Home Y) real defense-in-depth: request-scoped `home_id`, an auto-injecting Prisma extension, and Postgres RLS as a last line of defense. But the PRD's own executive summary states the guarantee one level deeper: "family sees only **their resident**" — not "their home's residents." Within a single home, a family account must be restricted to residents it's linked to via `FAMILY_LINK` (their photos, content visibility where resident-scoped, event/meal actions on their behalf). Nothing in the spine describes *how* this is enforced (no auto-scoping analog, no RLS policy keyed off `family_link`, not even a stated "always filter by `family_link.user_id`" rule).
- *Why it matters:* This is a real cross-family data-leakage risk *inside* the same tenant (one family sees another family's linked resident's photos/details), which is arguably worse than the home_id leak AD-1 was built to prevent, since AD-1 does nothing to stop it. Two independently-built modules (photos, events, meals) are very likely to implement this filter differently or forget it in at least one path — this is precisely the "divergence for the level below" the spine is supposed to close.

### HIGH

**2. RBAC/role enforcement mechanism is referenced but never actually defined — an internal inconsistency.**
- *Where:* AD-3 ("...bypasses the `home_id` auto-scoping and RBAC Guards in AD-1"); System/Container diagram labels the API "Guards RBAC - auto-scoping home_id."
- *What's wrong:* AD-1's actual Rule (items 1–4) covers only `home_id` scoping — it never mentions roles, Guards, or a decorator/claims-check mechanism. AD-3 attributes "RBAC Guards" to AD-1 as if already established, but they aren't. No AD anywhere states how `family` / `staff` / `admin` / `super_admin` are checked (e.g., a `@Roles()` decorator + `RolesGuard` reading JWT claims), what the role enum is, or whether roles are hierarchical (does `super_admin` implicitly satisfy `admin` checks?).
- *Why it matters:* Roughly half the FR set depends on correct role gating (FR10, FR12, FR22–23, FR34–35, FR47–53). Without a defined mechanism, two developers building different modules (events vs. content vs. homes) will each invent their own role-check pattern, with no guarantee of consistent behavior on edge cases (missing role, malformed claim, cross-home admin escalation).

**3. Mobile/API version compatibility over time is unaddressed.**
- *Where:* Deployment & Environments table (EAS `preview`/`production` channels, "native builds/store submissions remain a manual trigger" per memlog); AD-2 (single shared-types source of truth).
- *What's wrong:* EAS Update ships JS-only OTA changes instantly, while native builds require app-store review and user-side updates that lag indefinitely. This means multiple mobile client versions will be talking to one continuously-evolving API in production. Nothing in the spine specifies an API versioning strategy, a minimum-supported-client-version check, or a forced-update path. AD-2 solves *build-time* contract drift (shared types) but says nothing about *runtime* drift once a client is in the wild on an old contract.
- *Why it matters:* This is a genuine whole-initiative structural dimension (client/server compatibility across independent release cadences) that's fully silent — not decided, not flagged as an open question, not deferred.

**4. Email/transactional-message provider is never named anywhere — a load-bearing tech decision skipped.**
- *Where:* Absent from the Stack table, all ADs, and the memlog (no `(decision)` or `(version)` entry for email, unlike Cloudinary, Render, Neon, pnpm, NestJS/Prisma).
- *What's wrong:* FR3 (password reset via email link), FR11 (admin invites via email), and NFR15 (retry policy: 3 attempts, 60s→5min→30min) all require a concrete provider (SendGrid, Postmark, SES, Resend, etc.) and a decision about templating/deliverability. AD-9 and AD-10 solved the equivalent problem for photos and push; the same treatment was skipped for email.
- *Why it matters:* Whoever builds the `auth`/`users` module has to pick a provider and retry mechanism unilaterally — a textbook divergence point the spine should have fixed for the level below.

### MEDIUM

**5. Observability / monitoring / alerting / error-tracking stack is completely silent.**
- *Where:* Nowhere in the spine; "Logging" convention only specifies structured JSON + `request_id`, not a destination, alerting, or error-tracking tool.
- *Why it matters:* NFR2 (200ms p95), NFR4 (30s push delivery), and Technical Success #3 (99.5% uptime, "graceful offline") are all unverifiable in production without some monitoring/alerting decision. This also directly undercuts AD-7's own rationale ("small team's limited incident-response bandwidth") — that team has no stated way to detect an incident it must respond to.

**6. No scheduled/background-job mechanism is named in the deployment topology.**
- *Where:* "Stack" and "Deployment & Environments" only list Render Web Service + Static Site, Neon, EAS.
- *What's wrong:* AD-9 requires photos older than 12 months to archive to cold storage — a recurring job. Dead device-token cleanup (AD-10) also implies periodic maintenance beyond request-time re-registration. No cron/worker mechanism (e.g., Render Cron Jobs) is named.
- *Why it matters:* This is an operational-envelope dimension the initiative altitude owns; leaving it silent means the archival rule in AD-9 has no runtime home.

**7. AD-2's enforcement mechanism ("CI validates the API's actual responses against these types") is underspecified.**
- *Where:* AD-2 Rule, third sentence.
- *Why it matters:* The rest of AD-2 is concrete (single source of truth, workspace imports), but the actual contract-validation mechanism (generated OpenAPI + schema diff? runtime assertion library? supertest response-shape checks?) isn't named. This is enforceable in spirit but not yet in a way two people would implement identically.

**8. Mobile data-fetching/HTTP-client architecture is undecided.**
- *Where:* Stack table lists "TanStack Router / TanStack Query" once, immediately after the admin-portal-specific rows, with no mobile-side equivalent; PRD's own "Technical Architecture Considerations" call for "Axios client with auth interceptor, consistent error parsing, pagination helpers" for mobile specifically.
- *Why it matters:* Whether mobile also uses TanStack Query, or Axios+interceptor as the PRD suggested, or something else, is left ambiguous — this affects how JWT refresh (AD-8), pagination convention, and error envelope (Consistency Conventions) are actually consumed on the client, which is exactly the kind of parallel-build divergence AD-2 was meant to prevent one layer down.

**9. Rate limiting for auth endpoints (NFR10) has no owning AD.**
- *Where:* Not mentioned anywhere in Invariants & Rules or Stack.
- *Why it matters:* Minor but load-bearing for security; easy to omit or implement inconsistently (e.g., only on login, not on password-reset) without an explicit rule.

**10. Admin/mobile frontend stack entries didn't get the same verification rigor as backend/infra picks.**
- *Where:* Memlog has explicit `(version)` verification notes for pnpm, the multi-tenant pattern, NestJS/Prisma/Postgres, Cloudinary, and Render/Neon — but none for Vite, React, shadcn/ui, TanStack Router/Query, Expo/EAS, or React Native Reusables/NativeWind, even though the spine's Stack table presents them at the same level of confidence ("latest stable").
- *Why it matters:* Low real-world risk (these are mature, well-known tools), but it's an inconsistency in the stated verification discipline — the spine doesn't distinguish "PRD-given constraint" from "web-verified-current" the way the memlog's own process implies it should.

### LOW

**11. AD-6's enforcement is procedural, not technical.**
- *Where:* AD-6 Rule ("...never run ad hoc from a developer machine").
- *Why it matters:* Nothing describes a technical guardrail (e.g., prod DB credentials not distributed to developer machines, network/IP restriction on the production Neon branch) — the rule relies on discipline rather than a mechanism that can't be bypassed, unlike every other AD in this spine.

**12. Backup/PITR and disaster-recovery posture isn't carried into the spine itself.**
- *Where:* Only appears in memlog reasoning ("Neon... managed Postgres PITR"), not in the spine's Deployment & Environments section where an implementer would actually look.

**13. NFR9 (password-reset link expiry) and NFR14 (push delivery-status tracking) aren't reflected in AD-8/AD-10's Rules**, even though both ADs otherwise closely track their respective PRD Risk-Mitigation language. Likely just an incompleteness in the Rule text rather than a real ambiguity.

**14. ERD's `HOME` entity shows only `uuid id`**, while sibling entities (`USER`, `RESIDENT`) carry more attributes, and Priya's PRD journey explicitly describes creating a home with name/address/timezone. Probably intentional diagram compactness — worth a quick sanity check, not a real risk.

---

## What Passed Cleanly

- **AD-1 (multi-tenant isolation)** is the standout: genuinely defense-in-depth, each layer independently enforceable, and its `FORCE ROW LEVEL SECURITY` gotcha is correctly traced to the memlog's 2026-07-02 web-verification note.
- **Capability → Architecture Map has no numeric gaps** — FR1 through FR55 are fully partitioned across the nine map rows (12+7+4+4+9+6+4+7+2 = 55) with no overlaps or holes.
- **Deployment & Environments coverage is unusually good for this altitude.** The Local/PR/Staging/Production table, combined with the CI/CD description in the memlog and AD-6/AD-7, is exactly the kind of operational-envelope treatment the checklist flags as commonly skipped — this spine did the work.
- **Every named version claim in the Stack table for backend/infra (pnpm, NestJS 11, Prisma 7, PostgreSQL 17, Cloudinary, Render, Neon) traces cleanly to a matching `(version)` verification note in the memlog dated 2026-07-02.** No fabricated or unverified "fact" claims were found among these.
- **AD-4 (Cloudinary metadata-only), AD-5 (single `ContentItem` table), AD-9 (photo pipeline resilience), and AD-10 (home-scoped push)** are all concrete, mechanically enforceable, and traceable word-for-word to PRD Risk Mitigation language — no vagueness in any of their Rules.
- **The Deferred list is clean** — every entry (Google Sheets sync, ContentItem splitting, Fastify swap, cursor pagination, removing the deploy gate, dedicated analytics store, schema-per-tenant) is a genuinely reversible, non-load-bearing choice appropriate to defer; nothing on it should have been fixed now.
