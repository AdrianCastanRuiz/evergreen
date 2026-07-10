# Verification Review — ARCHITECTURE-SPINE.md (Evergreen, 2026-07-02)

## Verdict

Roughly half of the Stack table's version claims (pnpm, NestJS 11, Prisma 7, PostgreSQL 17, Cloudinary, Render, Neon) are traceable to an explicit `(version)` web-search entry in the memlog and check out against a live spot-check, but the entire client-side/frontend stack (Expo/React Native, React Native Reusables/NativeWind, Vite, shadcn/ui, TanStack Router/Query, Expo EAS) is committed in the spine with no corresponding verification entry at all — those are asserted, not checked — and one verified claim (Postgres 17) is already slightly behind Neon's current default (Postgres 18) as of the memlog's own date.

## Findings

### HIGH — Frontend/client stack versions have zero verification trail
The Stack table commits six technologies as "latest stable"/"latest" with no backing `(version)` memlog entry:
- `React Native / Expo | latest stable SDK`
- `React Native Reusables / NativeWind | latest stable`
- `Vite + React | latest stable`
- `shadcn/ui | latest`
- `TanStack Router / TanStack Query | latest stable`
- `Expo EAS (Build + Update) | latest`

The memlog only records these as `(constraint)`/`(decision)` adoptions (lines 9–10, 31) — i.e. "we will use X" — never as a web-searched, dated confirmation that X is current, maintained, or compatible with the rest of the stack (e.g. NativeWind's compatibility with the Expo SDK version actually chosen, or shadcn/ui's compatibility with the pinned TanStack Router version). Contrast with pnpm, NestJS/Prisma/Postgres, Cloudinary, and Render/Neon, each of which has an explicit "verified via web search 2026-07-02" line. This is the clearest sign the frontend row was filled from training-data assumption rather than the same reality-check discipline applied to the backend.

### MEDIUM — "latest stable" / "latest" is not a pinned version anywhere it appears
Every one of: pnpm, Expo/RN SDK, RN Reusables/NativeWind, Vite+React, shadcn/ui, TanStack Router/Query, Expo EAS is recorded as "latest stable" or "latest" with no actual version number, date, or lockfile-equivalent commitment. Even where a web search genuinely happened (pnpm — memlog line 20), the search verified *fit* (workspace protocol, install speed, adoption by Vue/Vite/Nuxt/Turborepo) but never resolved to a specific version. A build substrate meant to be an "invariant" spine should pin real version numbers (or at minimum a semver range) before being treated as final — "latest" drifts silently and isn't reproducible across a two-person team's machines or CI.

### MEDIUM — PostgreSQL 17 pin is already one major version behind Neon's current default
Live spot-check (2026-07-02): Neon currently supports Postgres 14/15/16/17/18, and **Postgres 18 is now the default for newly created Neon projects** as of Neon's 2026 changelog entries. The memlog's version entry (line 25) verified "PostgreSQL 17" as current on 2026-07-02, and the Render/Neon entry (line 35) separately confirms Neon runs standard Postgres — but neither entry acknowledges that 18 had already become Neon's default by the same date, nor gives a reason for pinning 17 over 18 (e.g. ecosystem/extension lag, Prisma 7 compatibility). This isn't necessarily wrong, but it reads as a claim that was verified for existence-and-currency ("17 is available and real") without being verified for optimality ("17, not 18, is the right choice today") — worth an explicit one-line rationale if 17 is intentional.

### LOW — Cloudinary, GitHub Actions, and Neon "branch-per-PR" have decision-level detail but only partial version/pricing verification
Cloudinary pricing/tier math (line 30) and Render/Neon vendor comparison (line 35) are genuinely web-searched and dated. GitHub Actions itself carries no version concept and isn't flagged as a concern, but the specific mechanism relied on for AD-7 (GitHub Environments manual-approval gate) has no `(version)`-style confirmation that this feature still exists/behaves as described — it's asserted as a `(decision)` only. Low severity because this is a stable, long-standing GitHub feature, but it's the one AD-7 depends on entirely and got no explicit reality-check line.

## What checked out cleanly

- **pnpm workspaces** — memlog line 20 explicit web-search verification (2-3x faster installs, ~70% less disk, `workspace:*` protocol, `--filter`), consistent with spine.
- **NestJS 11** — memlog line 25 verification, and live spot-check confirms `@nestjs/core` is at 11.1.x as of mid-2026, actively maintained, "gold standard" framing holds up.
- **Prisma 7 (TS-native/Rust-free runtime)** — memlog line 25 verification is accurate: Prisma 7.0.0 (Nov 19, 2025) genuinely shipped the Rust-free client as default, matching the "TS-native runtime" claim precisely.
- **Prisma RLS client-extension pattern (AD-1)** — live spot-check confirms this is a real, officially documented Prisma pattern (`prisma/prisma-client-extensions` repo, official docs on Client Extensions), not an invented or stale claim. The `FORCE ROW LEVEL SECURITY` gotcha cited in memlog line 22 is also a genuine, well-known Postgres footgun — correctly caught.
- **PostgreSQL 17 availability on Neon** — confirmed Neon does support Postgres 17 (see Medium finding above for the "not the default anymore" nuance).
- **Cloudinary vs S3 cost/tier reasoning** (memlog line 30) — internally consistent with the ~16x/GB premium and 50k-photo/NFR13 ceiling math cited in the spine's AD-4 rationale.
- **Render vs Railway/Fly.io and Neon branch tiers** (memlog line 35) — has a genuine comparative rationale trail, not just a bare assertion.
