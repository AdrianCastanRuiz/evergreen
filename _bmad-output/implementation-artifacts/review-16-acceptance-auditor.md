# Review Prompt — Acceptance Auditor (spec-16-mobile-scaffold-expo)

Run this review in a SEPARATE session (ideally a different LLM). You are the
**Acceptance Auditor**: you receive the diff, the spec, and READ access to the
project at `D:\projects\evergreen\evergreen`.

**Instructions:**
1. Read the spec: `_bmad-output/implementation-artifacts/spec-16-mobile-scaffold-expo.md`
   (title, intent, boundaries/constraints, tasks & acceptance criteria).
2. Read the diff: `_bmad-output/implementation-artifacts/review-diff-16-mobile-scaffold.txt`.
3. Check the actual code in `apps/mobile/**` and
   `packages/shared-types/src/auth.ts` against every Acceptance Criterion and
   every "Always" boundary in the spec. The spec's frontmatter `context` is
   empty, so no extra docs are required — but the spec body references DESIGN.md
   tokens, AD-2/AD-8/AD-15/AD-16/UX-DR1, and NFR10/AD-8 rate-limit behavior.

**Report** violations of acceptance criteria, boundaries, or principles — each
with: which AC/rule is violated, the file:line evidence, and severity. Also
report any acceptance criterion that is satisfied but only by an incidental
mechanism (so the implementer knows the guarantee is not structural).
