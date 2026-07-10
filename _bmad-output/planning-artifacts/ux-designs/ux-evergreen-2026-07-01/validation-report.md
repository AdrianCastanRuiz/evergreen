# Validation Report — Evergreen

- **DESIGN.md:** `_bmad-output/planning-artifacts/ux-designs/ux-evergreen-2026-07-01/DESIGN.md`
- **EXPERIENCE.md:** `_bmad-output/planning-artifacts/ux-designs/ux-evergreen-2026-07-01/EXPERIENCE.md`
- **Run at:** 2026-07-01

## Overall verdict

DESIGN.md is strong: canonical section order intact, every color has a hex value, every `{path.to.token}` reference in both files resolves, and the shadcn-shaped token naming is disciplined. EXPERIENCE.md is adequate but not airtight as a downstream contract: two top-level family-facing IA surfaces (Menu, News & Documents) have no real component definition anywhere, no state is defined for permission-denied/role-gated access despite RBAC/multi-tenancy being the PRD's headline technical requirement, and three of the four Key Flows omit the explicit failure path the fourth flow and both calibration examples provide. None of this is broken — a human downstream consumer can infer sensible defaults — but an AI story-dev consumer would have to invent load-bearing behavior that should have been committed here.

Accessibility lens: the spine mostly honors its stated "basic good practices" bar in the places it explicitly designed for it, but two concrete gaps would quietly undermine that bar for the stated older/less-tech-fluent audience: `muted-foreground` gray fails AA contrast on exactly the meta text (dates/times) this persona relies on, and the photo gallery — the single most emotionally load-bearing feature in Flow 1 — is swipe-only with no tap fallback, contradicting the team's own stated swipe-gesture caution elsewhere.

## Category verdicts
- Flow coverage — Adequate
- Token completeness — Strong
- Component coverage — Thin
- State coverage — Thin
- Visual reference coverage — Expected / fine
- Bloat & overspecification — Strong
- Inheritance discipline — Strong
- Shape fit — Adequate

## Findings by severity

### Critical (2)
**Component coverage** — "Meal selection row" has no DESIGN.md component (EXPERIENCE.md Component Patterns; DESIGN.md Components — absent)
Menu is a top-level family tab (FR37–40) exercised in Maria's own Key Flow, with zero visual spec.
Fix: add a `meal-row` entry to DESIGN.md frontmatter `components` and the Components section.

**Accessibility** — `muted-foreground` fails AA contrast on the exact meta text this persona needs (DESIGN.md Colors/Typography; EXPERIENCE.md Accessibility Floor)
#7A7A7A against #FFFFFF (≈4.29:1) and #F8F8F8 (≈4.04:1), both below 4.5:1 — used for timestamps, event date/time, captions, inactive tab labels at 13px.
Fix: darken to ≈#5C5C5C/#5E5E5E (≈4.6–4.7:1) or increase caption size; correct the Accessibility Floor claim.

### High (5)
**Flow coverage** — Flows 2–4 (Sarah, James, Priya) have no explicit "Failure path" line (EXPERIENCE.md, Key Flows §Flow 2/3/4)
Fix: add one `Failure:` line per flow.

**Component coverage** — News & Documents has no component in either file (EXPERIENCE.md IA/Component Patterns; DESIGN.md Components — absent)
Fix: add a news-post/document list-item component, or state it reuses `event-list-item`/`card`.

**State coverage** — No "permission-denied" state anywhere (EXPERIENCE.md State Patterns — row absent)
Despite RBAC + strict `home_id` isolation being the PRD's #1 Technical Success criterion.
Fix: add a state for role-gated/home-scoped access attempts.

**Accessibility** — Gallery viewer is swipe-only with no tap fallback (EXPERIENCE.md Component Patterns — Gallery tile / full-screen viewer)
Contradicts the team's own swipe-gesture caution elsewhere; photos are the emotional core of Flow 1.
Fix: add visible tap zones or arrow affordances alongside swipe.

**Accessibility** — 13px caption floor compounds the contrast failure (EXPERIENCE.md Accessibility Floor; DESIGN.md typography.caption)
Fix: fix contrast first; consider a 14–15px caption floor as a more forgiving default.

### Medium (11)
- Token completeness — contrast statement doesn't cover every load-bearing pair (secondary/accent-blue/destructive foregrounds). *Fix:* extend the statement or scope it explicitly.
- Component coverage — several DESIGN.md components have no EXPERIENCE.md behavior row. *Fix:* add minimal behavior rows or a "visual-only" disclaimer.
- State coverage — no state for invalid/expired invite code during onboarding. *Fix:* add an "Invalid invite code" row.
- Inheritance discipline — shadcn primitive inheritance (Table/Dialog/Sheet/Tabs) never enumerated. *Fix:* add a short inheritance line.
- Shape fit — no "Inspiration & Anti-patterns" section despite a genuine reference product (evergreen-homecare.com) and scattered anti-pattern rules. *Fix:* add the section.
- Flow coverage — dangling IA reference "Operational lists" never defined again. *Fix:* name the actual screen(s) or remove the term.
- Accessibility — primary green on white / white on primary has almost no AA margin (≈4.69:1), and hex is `[ASSUMPTION]`. *Fix:* re-verify once brand hex is confirmed.
- Accessibility — calendar "has event" dot is an uncovered color-only signal (≈2.94:1, under 3:1). *Fix:* extend no-color-only rule or deepen the teal.
- Accessibility — card/input hairline borders nearly invisible (≈1.4–1.5:1, under 3:1). *Fix:* darken the default border token.
- Accessibility — touch-target minimum not stated for form-input, calendar cells, meal "Cancel order" link. *Fix:* add to the explicit list; flag the calendar 7-column tension.
- Accessibility — resident switcher has no pill-row-vs-dropdown rule or scroll affordance. *Fix:* pick a threshold and specify a scroll cue.
- Accessibility — no default stated between Events list vs. calendar view. *Fix:* set list as default for family users.

### Low (7)
- Flow coverage — inconsistent failure-path labeling in Flow 2.
- Token completeness — orphan token `accent-foreground`.
- Component coverage — upload-item component conflated with `toast-banner`.
- Bloat — mild redundancy between frontmatter comments and Colors prose (not true bloat).
- Accessibility — web portal focus order/Esc behavior only asserted, not specified.
- Accessibility — hover-only `accent-blue-hover` fill is sub-AA (low real-world impact, touch-only app).
- Accessibility — teal accent described as "info-toast background" but not used that way; prose/component mismatch.

## Reviewer files
- `review-rubric.md`
- `review-accessibility.md`
