# Deferred Work

## Deferred from: code review of epics.md (Story 1.6) (2026-08-02)

- **bcryptjs is pure-JS and can block the Node event loop under sustained load.** Chosen deliberately over native `bcrypt` this session to avoid node-gyp/Windows build fragility (see `apps/api/src/auth/password.service.ts`). Accepted tradeoff for now — revisit with worker-thread offloading or native `bcrypt` behind an optional build step if login volume becomes a real concern.

- **`super_admin` carries no `home_id` in the JWT, though AD-8/AD-18's prose lists it alongside staff/admin.** Deferred as a documentation issue, not a code bug: the Prisma schema comment (Phase 0) and AD-1's `@BypassTenantScope()` cross-home model both assume `super_admin` is unscoped, so the code matches the actual intended design. AD-8/AD-18's wording should be corrected to call out `super_admin` as the third home-id-less case alongside `family`, or clarified — worth a small architecture-doc fix later.

- **No per-request re-validation of `isActive`/role, and no refresh-token revocation on logout/refresh.** Accepted stateless-JWT tradeoff: 15-minute access-token TTL bounds the exposure window for a deactivated account or a leaked refresh token. No AD mandates a revocation list and the schema has no table for one. Revisit if/when a real incident or compliance requirement calls for immediate revocation (would need a denylist/jti table).

- **Access and refresh tokens share a single `JWT_SECRET`, discriminated only by a `type` claim.** Matches the original Phase 0 `.env.example` design intent (single secret documented there). The `type` claim is the accepted mitigation against cross-use. Revisit with a dedicated `JWT_REFRESH_SECRET` only if defense-in-depth becomes a priority.
