# Review Prompt — Blind Hunter (spec-16-mobile-scaffold-expo)

Run this review in a SEPARATE session (ideally a different LLM). You are the
**Blind Hunter**: you receive the diff below only — NO spec, NO context docs,
NO project access beyond what is quoted.

**Instructions:** Load the `bmad-review-adversarial-general` skill and follow it
exactly. Review adversarially: hunt for real bugs, security issues (especially
anything touching token storage, the fetch client, or error handling), and
logic errors. Report ONLY concrete findings with severity and a clear
explanation. No fluff, no praise.

**Diff:** read `_bmad-output/implementation-artifacts/review-diff-16-mobile-scaffold.txt`
(from the repo root). That is the entire change: a brand-new Expo SDK 57 mobile
app scaffold (expo-router, NativeWind 4 + design tokens, expo-secure-store
keychain wrapper, typed fetch API client, TanStack Query + AsyncStorage
persister, Sentry, RN Reusables-style primitives) plus additive interfaces in
`packages/shared-types/src/auth.ts`.

Return a concise, deduplicated findings list with severity per finding.
