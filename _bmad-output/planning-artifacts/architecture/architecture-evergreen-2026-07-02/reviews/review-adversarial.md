---
review-type: adversarial
target: ARCHITECTURE-SPINE.md (Evergreen, 2026-07-02)
verdict-summary: see below
---

# Adversarial Review — Evergreen Architecture Spine

## Verdict

The spine is internally strong on tenant isolation and deploy control but leaves at least one direct self-contradiction (menus) and several unowned surfaces (enum governance, RBAC spelling, cross-tenant reads, shared-types staleness, module-boundary enforcement) where two equally-compliant teams would build incompatible things without ever violating an AD's literal text.

---

## Findings

### 1. [Critical] "Menus" is modeled twice, contradicting itself inside the spine

**Two units:** the `content` module owner (implementing AD-5) vs. the `meals` module owner (implementing the Meal Ordering capability, FR37–42).

**What each would plausibly do:** AD-5's binds line reads: *"FR13–FR19 (Home Content Management: news, documents, **menus**, schedules, notices, static pages, announcements)"* — a developer implementing content management, reading only this line, builds weekly menus as `ContentItem` rows with `type: 'menu'`. Meanwhile the ERD (`MEAL_MENU_ITEM { uuid id, uuid home_id, date day }`) and the Capability Map ("Meal Ordering (FR37–42) → `apps/api/src/meals`") both model weekly menus as a dedicated, structured entity with its own table, owned by a different module entirely. (The memlog's actual `type` enum list — `news|notice|announcement|static_page|document|schedule` — confirms menus were *meant* to live in `meals`, but the spine's own AD-5 prose never says so; a dev who never opens the memlog has no way to know this.)

**Conflict:** two competing, incompatible data models for the same feature ship in parallel — one team's weekly-menu writes go to `ContentItem`, the other's go to `MEAL_MENU_ITEM`/`MealOrder`. Mobile has no way to know which to render meal-ordering from; whichever module ships second "discovers" the collision in QA, or worse, in production with real families ordering meals.

**Fix:** delete "menus" from AD-5's binds parenthetical (it belongs to AD covering `meals`), and add one sentence to AD-5 or the Capability Map explicitly stating "weekly menus are NOT a ContentItem type; see `meals` module" — the six-way enum should be enumerated in the spine itself, not only in the memlog.

---

### 2. [High] No convention for how `ContentItem.type` is governed, validated, or extended

**Two units:** the `content` module's original author vs. a second developer adding a new content kind six months later (e.g., "newsletter" or splitting "document" into "policy" + "form").

**What each would plausibly do:** Nothing in the spine says whether `type` is a Postgres/Prisma enum (schema-level, requires a migration + CI review) or a plain string column validated only by a DTO allow-list in the Controller. Dev A treats it as a Prisma `enum ContentType` (safe, but every new type needs a migration per AD-6). Dev B, wanting to ship faster without a migration, adds `'newsletter'` only to the NestJS `class-validator` `@IsIn([...])` decorator, leaving the DB column as an unconstrained string (or even in an already-deployed Prisma enum with a mismatched value). Both are AD-5/AD-6 compliant on their face.

**Conflict:** the DB now accepts a value the Prisma-enum-based code path doesn't recognize (or vice versa) — TypeScript exhaustive `switch` statements in mobile/admin silently fall through, and `packages/shared-types` (AD-2) has no single place forcing the two to be redefined together, since AD-2 only guarantees request/response *shape* typing, not enum *value-set* synchronization.

**Fix:** add a Consistency Conventions row: "`ContentItem.type` and any other closed-value fields are defined once as a Prisma enum in `schema.prisma`; `packages/shared-types` re-exports the generated Prisma enum — never hand-declares its own copy of the value list." Extend AD-2's "CI validates responses against types" to explicitly include enum value-set diffing.

---

### 3. [High] RBAC role names have no canonical spelling/enum — string comparison across modules can silently diverge

**Two units:** the `auth`/`users` module owner (writing the `@Roles()` Guard decorator) vs. any feature-module owner (e.g., `events`) wiring RBAC into a single new endpoint under deadline.

**What each would plausibly do:** the ERD literally types the column as `USER { ..., string role, ... }` — not an enum, not even referencing a shared constant. Dev A defines and uses a proper `Role` enum (`family | staff | admin | super_admin`) from `packages/shared-types` in the `auth` module's Guards. Dev B, adding an ad-hoc check inside the `events` module for "who can approve an outing registration," writes `if (user.role !== 'Admin')` — copy-pasted capitalization from a UI label or the PRD prose — instead of importing the shared enum. Nothing in AD-1, AD-3, or the Consistency Conventions table mandates that role checks go through one shared enum/import.

**Conflict:** Postgres and the API happily store/compare `'admin'` and `'Admin'` as different strings; the events endpoint silently grants or denies access to the wrong set of users. This is exactly the kind of bug AD-1's defense-in-depth was built to prevent for `home_id` — but there is no equivalent guard for role strings.

**Fix:** add a Consistency Conventions row: "User roles are a single Prisma enum (`Role`), re-exported from `shared-types`; no module compares `user.role` against a string literal — always against the enum member." Consider making `@Roles(Role.ADMIN)` the *only* sanctioned RBAC-check pattern, enforced by a Guard, not ad hoc `if` checks in Controllers/Services.

---

### 4. [High] AD-2's CI type-checking doesn't protect already-shipped mobile binaries — no API/enum evolution policy

**Two units:** the `apps/api` + `apps/admin` team (continuously deployed per the Deployment table — admin auto-deploys on push to staging, API redeploys behind only a manual approval, not a version freeze) vs. the `apps/mobile` team's already-published EAS `production`/store binary from weeks or months earlier.

**What each would plausibly do:** the API team, fully honoring AD-2 ("CI validates the API's actual responses against these types"), renames a `ContentItem.type` value or adds a required field, and CI passes because it only checks the *current* monorepo's mobile code against the *current* API — it says nothing about binaries already in the field that a care-home family member hasn't updated (a demographic well known for not updating apps promptly). EAS OTA Update can patch JS, but native store binaries lag, and there's no min-supported-client-version / API-version-negotiation mechanism anywhere in the spine.

**Conflict:** an old, still-installed mobile build receives a payload shaped by a *new* contract it was never compiled against (TS types are erased at runtime — there is no runtime validation on the client). A `switch` on `content.type` with no `default` case silently renders nothing, or an assumed-present field is `undefined` and crashes a screen — for a resident's family member, on a platform whose whole value proposition is reliability.

**Fix:** add a convention/AD: never remove or rename an existing value/field within a defined deprecation window; API responses should be additive-only for N releases; consider embedding a `minAppVersion`/`apiVersion` field in critical payloads, or a lightweight `/health` version-compat check the mobile app performs on launch.

---

### 5. [High] AD-1's auto-scoping model has no stated escape hatch for legitimate cross-tenant (`super_admin`) access

**Two units:** the developer implementing the `homes` module (super-admin home CRUD, cross-home dashboards — Capability Map explicitly assigns this to `super_admin`) vs. the developer implementing the AD-1 auth-middleware/Prisma-extension mechanism itself.

**What each would plausibly do:** AD-1's rule assumes exactly one `home_id` per request, resolved into `AsyncLocalStorage` and auto-injected into *every* query — "a developer never writes the filter by hand." But a `super_admin` listing all homes, or auditing users/content across every home, has no single `home_id` to scope to. The middleware author, following the rule literally, might make `home_id` mandatory and throw/error when absent. The `homes`-module author, needing cross-tenant reads to actually ship the feature, might instead special-case it — e.g., setting a sentinel `home_id: null` the Prisma extension is coded to interpret as "skip the filter," or bypassing the extension via a raw `$queryRaw` call, or minting a fake per-request loop over every home's `home_id`. Each of these is a different, un-reviewed way of poking a hole in the one mechanism AD-1 calls "defense-in-depth," and none of them is written down anywhere.

**Conflict:** whichever pattern ships first becomes the de facto (and undocumented) super-admin bypass path; a second developer reimplementing a different cross-home feature later (e.g., cross-home analytics if scope ever expands) is likely to invent yet another bypass, multiplying the number of code paths that skip the RLS/extension safety net AD-1 was written to guarantee.

**Fix:** AD-1 (or a new AD) should explicitly define the one sanctioned pattern for legitimate cross-tenant access (e.g., a distinct `SuperAdminPrismaService` that is the *only* client permitted to run without the extension, still behind RLS with an explicit `home_id IS NOT NULL` bypass role, reviewed and rate-limited) rather than leaving it to whoever builds `homes` first.

---

### 6. [Medium-High] "A module never touches another module's tables" is a social convention, not a technically enforced one — unlike AD-1's DB-level defense-in-depth for tenants

**Two units:** the `analytics` module owner (needing cross-entity aggregates for the dashboard, FR54–55, explicitly deferred on *how* — see Deferred section) vs. any other feature-module owner who later needs a similar cross-cutting read.

**What each would plausibly do:** Dev A takes the Design Paradigm literally and adds new aggregate-returning methods to each domain module's exported Service (`photosService.countSince()`, `eventsService.registrationStatsForHome()`, ...), growing each module's public API surface purely to serve analytics. Dev B, on a deadline, decides a dashboard is exactly the kind of read-heavy, cross-entity feature that shouldn't hop through five service calls, and gives `analytics` its own `PrismaService` (structurally identical to every other module's) that runs `SELECT ... FROM photos JOIN events ...` directly against tables the paradigm says are "owned" by other modules. Nothing in the Design Paradigm or AD-1–AD-10 is technically enforced (no dependency-boundary lint rule, no per-module DB role/schema separation) — it is a stated intention, checked only by code review discipline, so both devs are compliant right up until someone actually reads the diff.

**Conflict:** two structurally different "who may touch which table" regimes coexist in the same codebase, and the one place a violation is most tempting (cross-cutting aggregation) is exactly the place the Deferred section explicitly declines to design ("V1 computes dashboard metrics via aggregate queries over existing tables" — but doesn't say *through what boundary*).

**Fix:** either (a) add a lint/CI rule (e.g., dependency-cruiser or ESLint boundaries plugin) that fails the build if a module's Prisma client is used against another module's Prisma model, giving the paradigm the same defense-in-depth AD-1 has for tenancy, or (b) explicitly bless `analytics` as a documented exception with a read-only cross-schema view/materialized-view pattern, named as such.

---

### 7. [Medium] AD-4's "no stored transformation URL" rule doesn't cover `ContentItem.attachment_url`, which stores exactly what AD-4 forbids

**Two units:** the `photos` module owner (implementing AD-4 for `Photo.cloudinary_public_id`) vs. the `content` module owner (implementing document/schedule attachments for `ContentItem.attachment_url`).

**What each would plausibly do:** AD-4 binds only "photo upload and display" and its rationale — avoid divergent hardcoded transformation URLs, avoid staleness if the transform strategy changes — applies equally to any binary asset served through the app (a PDF menu, a scanned notice). But `ContentItem` already carries a field literally named `attachment_url` (not `attachment_public_id`), meaning whoever built that table stored a URL, not a provider-agnostic identifier. The `content` module owner, reading only AD-4's narrow binds clause, reasonably concludes the rule doesn't apply to them and keeps storing a raw Cloudinary (or S3, or anything) URL directly.

**Conflict:** two different asset-reference conventions now exist for structurally similar binary content in the same schema — one resilient to CDN/transform changes (`Photo`), one not (`ContentItem.attachment_url`). If Cloudinary delivery URLs are ever restructured (folder rename, signed-URL policy change, moving to a different CDN), every stored `attachment_url` breaks silently, exactly the failure AD-4 exists to prevent — just for a sibling entity AD-4 forgot to bind.

**Fix:** widen AD-4's binds to "any binary asset served via Cloudinary (photos and content attachments)," and rename/redefine `ContentItem.attachment_url` to store a `public_id` like `Photo` does, or explicitly document why attachments are exempt.

---

### 8. [Medium] Error envelope's `details?` has no defined shape — mobile and admin will each invent their own parser

**Two units:** the mobile team building a generic form-error banner vs. the admin team building field-level inline validation messages (shadcn/ui form components typically want per-field errors).

**What each would plausibly do:** the Consistency Conventions table specifies `{ error: { code, message, details? } }` and stops there. Nothing constrains what `details` contains. The admin team, needing to highlight the specific offending field under a shadcn `FormField`, expects (and starts coding against) `details: [{ field: string, message: string }]`. The mobile team, only needing a single toast/banner, is equally happy if `details` is a flat string array, an object keyed by field name, or the raw NestJS `class-validator` `ValidationError[]` passed straight through (which has a very different, nested shape with `constraints`/`children`). All three are "compliant" with the one-line convention.

**Conflict:** whichever the API actually emits, one of the two clients (whichever wasn't consulted first) has code that silently fails to extract field-level messages — degrading to a generic "something went wrong," or throwing when it tries to `.map()` over a shape that isn't an array.

**Fix:** pin `details` to a concrete shape in the Consistency Conventions table (e.g., `details?: { field: string; message: string }[]`) and add it to `packages/shared-types` so both clients type-check against the same structure.

---

### 9. [Medium] AD-9's photo-archival mechanism and owner are unspecified — app-level cron vs. Cloudinary-native lifecycle rule can silently disagree

**Two units:** a backend developer implementing "photos older than 12 months archive to cold storage" as a `@nestjs/schedule` cron inside the `photos` module (updates a Postgres `archived` flag, calls the Cloudinary API to move the asset) vs. an infra-minded developer (or the same person, later, optimizing) who instead configures a Cloudinary-native lifecycle/auto-archival rule directly on the Cloudinary account based on asset age, with no corresponding write back to Postgres.

**What each would plausibly do:** both satisfy the letter of AD-9 ("photos older than 12 months archive to cold storage"); the AD doesn't say *where* the archival logic lives or that Postgres must reflect it.

**Conflict:** if the Cloudinary-native path is used, Postgres has no record that a given photo is archived while Cloudinary has already moved/re-tiered the asset — the gallery view, which per AD-4 "constructs its own transformation URL from the `public_id` at request time," may now build URLs against an asset that no longer resolves at the expected access tier/delivery type, producing broken thumbnails with no application-level signal of why.

**Fix:** state explicitly in AD-9 that archival is application-orchestrated (a scheduled job inside `photos`, updating both Cloudinary and an `archived_at` column) and that Cloudinary account-level lifecycle rules are out of scope / must not be configured independently of the app.

---

### 10. [Low-Medium] Cross-module cascade-on-delete: DB-level `ON DELETE CASCADE` vs. Service-orchestrated cleanup is unaddressed by the "module owns its mutations" rule

**Two units:** the `users` module owner implementing user/family-member removal vs. the `events`/`meals`/`photos` module owners whose tables reference that user (`EVENT_REGISTRATION.requested_by_user_id`, `MEAL_ORDER.ordered_by_user_id`, `PHOTO.uploaded_by`).

**What each would plausibly do:** the Consistency Conventions state "a module's own Service is the only place its data mutates — never ... from another module." A developer removing a user needs dependent rows in *other* modules' tables handled somehow. One reasonable reading: add a Prisma-schema `onDelete: Cascade` foreign key — which is a database-level mutation that never goes through any module's Service at all (arguably outside the rule's scope, since it isn't the `users` module "mutating another module's data" — Postgres is). Another equally reasonable reading: the `users` module must call `eventsService.cleanupForUser()`, `mealsService.cleanupForUser()`, `photosService.cleanupForUser()` explicitly, honoring the spirit of "only the owning Service mutates its own data."

**Conflict:** whichever module is built first sets an implicit precedent; if some modules use FK cascade and others expect an explicit Service call that a downstream developer forgets to add, user deletion leaves orphaned rows in the modules that didn't get the memo — inconsistently, table by table.

**Fix:** add one sentence to the Consistency Conventions ("State & mutation") row clarifying whether DB-level cascade deletes are permitted, and if so, which relationships use them vs. which require explicit cross-module Service calls.

---

## Tried to break, couldn't (AD already closes it)

- **FAMILY_LINK dual ownership (`users` vs. `residents`)** — looked like a two-owner conflict, but the Design Paradigm's "call the other module's exported Service, never its table" rule cleanly resolves it: whichever module (per the Capability Map, `residents`) owns `FAMILY_LINK`, the other calls its Service. No contradiction found here, unlike the ContentItem/menu case.
- **Tenant isolation itself (AD-1)** — tried constructing a scenario where two modules could each pick a different `home_id`-scoping mechanism (one via the Prisma extension, one via raw SQL). AD-1's layered defense (middleware context + Prisma extension + `FORCE ROW LEVEL SECURITY` + composite index) genuinely holds even if one layer is skipped by a careless developer — RLS still blocks the leak at the DB layer. This AD earns its "defense-in-depth" name.
- **Deploy/migration timing (AD-6, AD-7)** — tried to find a scenario where two developers could each believe they're allowed to run a migration or deploy differently. The single-pipeline, single-merge-target, manual-approval-gate design leaves no room for two parallel "valid" interpretations — there's only one `main` and one pipeline.
- **Photo upload flow (AD-4's core rule, direct-to-Cloudinary + public_id storage)** — solid for the `Photo` entity itself; the only hole found was its unstated boundary with `ContentItem.attachment_url` (Finding 7), not the core Photo mechanism.
