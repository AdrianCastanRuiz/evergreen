# Spine Pair Review — evergreen

## Overall verdict

DESIGN.md is strong: canonical section order intact, every color has a hex value, every `{path.to.token}` reference in both files resolves, and the shadcn-shaped token naming is disciplined. EXPERIENCE.md is adequate but not airtight as a downstream contract: two top-level family-facing IA surfaces (Menu, News & Documents) have no real component definition anywhere, no state is defined for permission-denied/role-gated access despite RBAC/multi-tenancy being the PRD's headline technical requirement, and three of the four Key Flows omit the explicit failure path the fourth flow and both calibration examples provide. None of this is broken — a human downstream consumer can infer sensible defaults — but an AI story-dev consumer would have to invent load-bearing behavior that should have been committed here.

## 1. Flow coverage — adequate

Checked: all 4 PRD persona journeys (Maria, Sarah, James, Priya) against EXPERIENCE.md Key Flows for named protagonist, numbered steps, climax beat, failure path; cross-checked the IA table for dangling screen references.

### Findings
- **high** Flows 2–4 (Sarah, James, Priya) have no explicit "Failure path" line, unlike Flow 1 (Maria) and every flow in both calibration examples (Quill, Drift), which give every flow a labeled failure branch. (EXPERIENCE.md, Key Flows §Flow 2/3/4). *Fix:* add one `Failure:` line per flow, e.g. Sarah — all 3 upload retries exhausted; James — publish/network failure; Priya — duplicate home name / creation failure.
- **medium** The IA table's Sarah/staff-web row lists a screen called "Operational lists" that never appears again anywhere in DESIGN.md or EXPERIENCE.md — no component, no state, no flow step references it. (EXPERIENCE.md, Information Architecture table, Sarah/Web portal row). *Fix:* name the actual screen(s) this refers to, or remove the term.
- **low** Flow 2's mid-flow upload failure (weak WiFi, step 2) is narrated inline but not labeled `Failure:` the way Flow 1 is, so the failure-path convention is inconsistent across flows. (EXPERIENCE.md, Key Flows §Flow 2, step 2). *Fix:* normalize with an explicit `Failure:` line or fold it into the labeled convention used in Flow 1.

## 2. Token completeness — strong

Checked: every frontmatter token in DESIGN.md (colors, typography, rounded, spacing, components) against every `{path.to.token}` reference in both files' prose/tables. All colors carry hex values. All references resolve to a defined token.

### Findings
- **medium** Contrast is only stated for `{colors.foreground}`/`{colors.muted-foreground}` against `{colors.background}`/`{colors.muted}` and `{colors.primary-foreground}` against `{colors.primary}`. No contrast statement covers `secondary-foreground` on `secondary` (button-secondary), `accent-blue-foreground` on `accent-blue`, or `destructive-foreground` on `destructive` (toast-banner variants) — all load-bearing pairs actually used by named components. (EXPERIENCE.md, Accessibility Floor; DESIGN.md, Colors). *Fix:* extend the contrast statement to every foreground/background pair a component actually uses, or explicitly scope the floor to "primary pairs only, others assumed safe pending audit."
- **low** `{colors.accent-foreground}` is defined in frontmatter but never referenced by any component or prose sentence — an orphan token. (DESIGN.md frontmatter, `colors.accent-foreground`). *Fix:* wire it into a component (e.g., an accent-filled badge) or drop it.

## 3. Component coverage — thin

Checked: every component name in DESIGN.md frontmatter/Components section and every component named in EXPERIENCE.md Component Patterns, cross-matched for a visual row + a behavioral row with real rules (not one-word descriptions).

### Findings
- **critical** EXPERIENCE.md's Component Patterns table defines behavioral rules for a "Meal selection row," but DESIGN.md has no corresponding component anywhere — not in the frontmatter `components` object, not in the Components body section. Menu is a top-level family tab (FR37–40) exercised in Maria's own Key Flow, with zero visual spec (no radius, color, or typography assigned to day tabs or meal-option rows). (EXPERIENCE.md, Component Patterns, "Meal selection row" row; DESIGN.md, Components — absent). *Fix:* add a `meal-row` (or similar) entry to DESIGN.md frontmatter `components` and the Components section.
- **high** News & Documents (FR13–19), a top-level family tab, has no component defined in either file — not in DESIGN.md Components, not in EXPERIENCE.md Component Patterns. Only its empty state ("Nothing posted yet.") exists; the populated state has no visual or behavioral spec at all. (EXPERIENCE.md, IA table "News & Documents"; State Patterns "No news/documents" row; Component Patterns — absent; DESIGN.md Components — absent). *Fix:* add a news-post/document list-item component, or explicitly state it reuses `event-list-item`/`card`.
- **medium** Several DESIGN.md components (`button-primary`, `button-secondary`, `button-outline`, `card`, `featured-card`, `resident-profile-card`, `top-nav`) have no corresponding row in EXPERIENCE.md Component Patterns, and there's no Drift-style disclaimer stating these are presentational-only / default-behavior components. (DESIGN.md, Components section; EXPERIENCE.md, Component Patterns — rows absent). *Fix:* add minimal behavior rows, or add an explicit "these are visual-only, no special behavior" note the way the Drift calibration example does for its shadcn-inherited components.
- **low** The "Photo upload + retry queue" Component Patterns row cross-references `{components.toast-banner}`, but the row actually describes the behavior of the queued upload *list item* (its "Uploading…"/"Retry" affordance), not the toast itself — that list-item component is never named or visually specified in DESIGN.md. (EXPERIENCE.md, Component Patterns, row 5). *Fix:* name and define the upload-item component distinctly from `toast-banner`, or clarify that the reference is intentionally about the escalation toast only.

## 4. State coverage — thin

Checked: every IA surface across both surfaces against the expected state set (empty, cold-load, focus, error, offline, permission-denied).

### Findings
- **high** No "permission-denied" state is defined anywhere in EXPERIENCE.md State Patterns, despite RBAC + strict `home_id` multi-tenant isolation being the PRD's #1 Technical Success criterion (NFR7) across four distinct roles. The Drift calibration example explicitly includes a Permission denied row for the equivalent case. (EXPERIENCE.md, State Patterns table — row absent). *Fix:* add a state for role-gated/home-scoped access attempts (e.g., staff hitting an admin-only URL, home admin hitting a super-admin-only route).
- **medium** No error/empty state is defined for an invalid or expired invite code during onboarding (FR5), even though onboarding is literally the first screen in Flow 1 (Maria). (EXPERIENCE.md, State Patterns table — row absent; IA table "Onboarding (invite code)"). *Fix:* add an "Invalid invite code" state row.
- **low** Several admin-side list surfaces (Content editor for news/documents/menus/schedules/notices, Users, Homes, Home admin assignment, Meal orders view) have no explicit empty-state entry beyond the two examples given ("No residents yet," "No events yet") — a downstream builder must extrapolate copy/behavior for the remaining surfaces. (EXPERIENCE.md, State Patterns table). *Fix:* either add rows for the remaining admin surfaces or state explicitly that they all follow the same `empty-state` pattern shown for Residents/Events.

## 5. Visual reference coverage — expected/fine

Checked: `mockups/`, `wireframes/`, `imports/` under the workspace folder.

### Findings
- **info** `mockups/` and `wireframes/` do not exist; `imports/` exists and is empty. Confirmed via directory listing. This matches the stated context — no visual artifacts were produced or imported this run, and evergreen-homecare.com was analyzed live by a subagent rather than saved locally. Not a defect; both spines correctly rely on prose/token description rather than referencing files that don't exist.

## 6. Bloat & overspecification — strong

Checked: pixel specs vs. tokens, source restatement, prose-where-table-works, decorative narrative untied to a decision, editorial-voice discipline (DESIGN.md may carry it, EXPERIENCE.md should not).

### Findings
- **low** DESIGN.md's frontmatter carries inline `# [ASSUMPTION]` / `# [NOTE FOR UX]` comments that are then substantially repeated in the prose Colors section (e.g., the destructive-color caveat appears near-verbatim in both places). Mildly redundant but genuinely useful for a human reviewer tracing an assumption back to its source — not true bloat. (DESIGN.md, frontmatter comments + Colors section). *Fix:* none required; optionally collapse to a single location if trimming is desired.

## 7. Inheritance discipline — strong

Checked: sources frontmatter resolution, UJ names verbatim from PRD, glossary consistency, component-name identity across sections/files, EXPERIENCE.md token references resolving to DESIGN.md by name.

### Findings
- **medium** DESIGN.md never states which shadcn/ui primitives (Table, Dialog, Sheet, Tabs, Command, etc.) the admin portal inherits as-is, unlike the shadcn calibration example (Drift), which explicitly enumerates inherited components and states "don't customize these." Evergreen's portal clearly uses tables (attendee lists, meal orders) and modals/sheets, but this inheritance contract is never named. (DESIGN.md, Brand & Style / Components — disclaimer absent). *Fix:* add a short "inherits shadcn's Table/Dialog/Sheet/Tabs as-is" line as Drift's spine does.
- No other issues: `sources: [{planning_artifacts}/prd.md]` resolves correctly in both files; protagonist names (Maria, Sarah, James, Priya) and roles are verbatim/consistent with the PRD's User Journeys section; no Glossary section exists in either spine or the PRD, so that check is N/A rather than a defect; every component name used in EXPERIENCE.md matches a DESIGN.md token name exactly (kebab-case identical).

## 8. Shape fit — adequate

Checked: DESIGN.md canonical section order; EXPERIENCE.md required-default sections; required-when-applicable triggers (Inspiration & Anti-patterns, Responsive & Platform).

### Findings
- **medium** No "Inspiration & Anti-patterns" section exists, even though the memlog documents a genuine reference product (evergreen-homecare.com) that directly shaped brand decisions (palette, logo treatment, the white-border-on-green `featured-card` motif), and EXPERIENCE.md scatters several real anti-pattern/banned-pattern statements inline instead (no badge counts, no swipe-to-delete, no confirmation dialogs on sign-up) that the calibration examples would consolidate into this section. (EXPERIENCE.md — section absent; compare Quill/Drift's dedicated sections; memlog.md "(decision) Visual identity: inherit evergreen-homecare.com brand as-is"). *Fix:* add a short Inspiration & Anti-patterns section citing what was lifted from evergreen-homecare.com and consolidating the scattered "banned" rules.
- **strength** DESIGN.md's 8 body sections appear in the exact canonical order (Brand & Style → Colors → Typography → Layout & Spacing → Elevation & Depth → Shapes → Components → Do's and Don'ts) with none omitted.
- **strength** EXPERIENCE.md includes all required defaults (Foundation, IA, Voice and Tone, Component Patterns, State Patterns, Interaction Primitives, Accessibility Floor, Key Flows), and correctly includes Responsive & Platform since this is a genuinely multi-surface (mobile + responsive web) product.

## Mechanical notes

- No name inconsistencies found between DESIGN.md component tokens and EXPERIENCE.md references — all kebab-case names match exactly.
- No broken `{path.to.token}` cross-references in either file; every reference resolves to a defined frontmatter token.
- Frontmatter is complete in both files (`name`, `status`, `sources`, `updated` present; DESIGN.md additionally carries `description`, `colors`, `typography`, `rounded`, `spacing`, `components` per spec).
- No Mermaid diagrams are used in either file, so no Mermaid syntax to validate.
- One dangling IA reference: "Operational lists" (Sarah/staff web row) is never defined or referenced again (see Finding 1.2).
- One component-name mismatch in intent vs. reference: "Photo upload + retry queue" row points to `{components.toast-banner}` but is actually describing an undefined upload-list-item component (see Finding 3.4).
