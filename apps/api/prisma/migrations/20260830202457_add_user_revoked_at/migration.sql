-- Story 2.0 follow-up (code-review decision): PasswordResetService.confirmReset
-- needs to tell a *stale* password-reset token issued before a user was
-- revoked (the vulnerability the guard closes) apart from a *fresh* token
-- issued after — e.g. by a legitimate re-invite via
-- UsersService.grantExistingFamilyUserHomeAccess, which must still be able
-- to reactivate the account. Nullable so existing rows are unaffected; a
-- pre-existing revoked user with no revokedAt has no provable "issued after
-- revocation" token, so the guard treats that as reject (the safe side).
ALTER TABLE "users"
  ADD COLUMN "revoked_at" TIMESTAMP(3);
