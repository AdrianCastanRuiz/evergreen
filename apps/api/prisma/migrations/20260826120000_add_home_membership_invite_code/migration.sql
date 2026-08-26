-- Story 1.8 invite-code onboarding (FR5): lets a pending family member
-- resolve their account by typing the invite code into the app and setting
-- a password, instead of following the emailed activation link. One code per
-- HomeMembership (AD-18: a family user may join several homes, each with its
-- own code). All three columns are nullable so pre-existing rows (staff,
-- admin, and already-active family memberships) are unaffected. Only the
-- opaque hash is stored; the raw code exists solely in the invite email.
ALTER TABLE "home_memberships"
  ADD COLUMN "invite_code_hash" TEXT,
  ADD COLUMN "invite_code_expires_at" TIMESTAMP(3),
  ADD COLUMN "invite_code_used_at" TIMESTAMP(3);

-- A single code may never resolve two memberships. NULLs are allowed by
-- PostgreSQL, so the non-family/inactive rows simply don't participate.
CREATE UNIQUE INDEX "home_memberships_invite_code_hash_key"
  ON "home_memberships"("invite_code_hash");
