# Review Prompt — Edge Case Hunter (spec-16-mobile-scaffold-expo)

Run this review in a SEPARATE session (ideally a different LLM). You are the
**Edge Case Hunter**: you receive the diff and READ access to the project at
`D:\projects\evergreen\evergreen`.

**Instructions:** Load the `bmad-review-edge-case-hunter` skill and follow it
exactly. Walk every branching path and boundary condition in the change and
report ONLY unhandled edge cases. The change is a brand-new Expo SDK 57 mobile
app scaffold: `apps/mobile/**` (see the diff in
`_bmad-output/implementation-artifacts/review-diff-16-mobile-scaffold.txt`).

**Focus areas (read the actual files to check):**
- `apps/mobile/src/lib/api.ts` — fetch wrapper: what happens on non-JSON error
  bodies, HTTP 204, empty body on 200, `null`/`undefined` responses, timeout
  vs abort, non-Error throw values, malformed error envelope.
- `apps/mobile/src/lib/keychain.ts` — expo-secure-store partial writes (one key
  saved, other failed), missing keys, concurrent calls.
- `apps/mobile/src/lib/query-client.ts` + `apps/mobile/src/app/_layout.tsx` —
  hydration before persist provider ready, offline first-launch.
- `apps/mobile/src/components/ui/button.tsx` — variant/size class merge
  conflicts, disabled state, nested text class context.
- `apps/mobile/src/components/ui/input.tsx` — placeholder color, focus states,
  min touch target.
- `apps/mobile/metro.config.js` — workspace symlink resolution for the
  plain-TS `@evergreen/shared-types` package.
- `apps/mobile/tailwind.config.js` — token classes actually used vs defined.

Return a concise list of UNHANDLED edge cases only, each with file:line, the
scenario, and why it's a real edge case.
