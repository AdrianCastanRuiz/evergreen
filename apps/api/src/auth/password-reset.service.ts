import { BadRequestException, Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../notifications/mail.service';
import { PasswordService } from './password.service';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour (NFR9)

// Same message for expired, already-used, and unknown-token cases — never
// let the response distinguish which case it was (no oracle, mirrors
// AuthService.login's generic "Invalid email or password").
const INVALID_OR_EXPIRED_MESSAGE =
  'This link is invalid or has expired. Please request a new one.';

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly mailService: MailService,
  ) {}

  // Always resolves void regardless of whether the email matched an
  // account — never reveal account existence (same principle as
  // AuthService.login's dummy-hash compare).
  async requestReset(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.client.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (!user) return;

    const rawToken = await this.issueActivationToken(user.id);

    // Fire-and-forget: never await the email send from the request thread —
    // only the DB write, so response timing can't leak account existence
    // and the endpoint doesn't block on third-party network I/O.
    // MailService itself never rejects (retries/logs internally), but this
    // `.catch()` is a defensive backstop against an unhandled rejection.
    this.mailService
      .sendPasswordResetEmail(normalizedEmail, rawToken)
      .catch(() => {});
  }

  // Shared by requestReset (self-service) and UsersService's invite flow
  // (Story 1.3): creates a single-use, 1h-expiry token for `userId` and
  // returns the raw (unhashed) value — the only place it ever exists outside
  // the emailed link.
  async issueActivationToken(userId: string): Promise<string> {
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await this.prisma.client.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    return rawToken;
  }

  async confirmReset(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const now = new Date();

    // Cheap pre-check so an obviously-invalid token 400s before paying for
    // a bcrypt hash below. This lookup is NOT what enforces single-use —
    // that's the conditional `updateMany` inside the transaction, below.
    const resetToken = await this.prisma.client.passwordResetToken.findFirst({
      where: { tokenHash, expiresAt: { gt: now }, usedAt: null },
    });
    if (!resetToken) {
      throw new BadRequestException(INVALID_OR_EXPIRED_MESSAGE);
    }

    // Distinguish "never-activated invite" (passwordHash still null — must
    // activate, AC #2) from "was active, since revoked by an admin"
    // (passwordHash set from the original activation, isActive now false).
    // The revoked case still needs a second distinction: a *stale* token
    // issued before the revocation (the actual vulnerability — reject) vs a
    // *fresh* token issued after it, e.g. by a legitimate re-invite via
    // UsersService.grantExistingFamilyUserHomeAccess, which must still work
    // (reactivate). revokedAt (set by UsersService.revokeAccess, cleared on
    // reactivation) makes that comparable against the token's own createdAt.
    // A revoked user with no revokedAt (pre-migration legacy row) has no
    // provable "issued after revocation" token, so it defaults to reject —
    // the safe side, matching this guard's original behavior.
    // Folded into the same generic message as expired/used/unknown tokens —
    // a distinct message here would itself be an account-status oracle.
    //
    // This is a cheap pre-check for a fast/typical rejection, same role as
    // the token findFirst above — it is NOT what enforces the guard for a
    // concurrent revoke (see the transaction's mirrored `updateMany` below,
    // code-review finding: a bare read-then-write here would leave a TOCTOU
    // window across the bcrypt hash below for an admin to revoke access
    // into).
    const user = await this.prisma.client.user.findUnique({
      where: { id: resetToken.userId },
      select: { isActive: true, passwordHash: true, revokedAt: true },
    });
    if (!user) {
      throw new BadRequestException(INVALID_OR_EXPIRED_MESSAGE);
    }
    const isStaleTokenOnRevokedAccount =
      !user.isActive &&
      user.passwordHash !== null &&
      (user.revokedAt === null || resetToken.createdAt < user.revokedAt);
    if (isStaleTokenOnRevokedAccount) {
      // Timing side-channel mitigation (code-review finding): without this,
      // this rejection returns near-instantly while the active-user success
      // path below awaits a real bcrypt hash + transaction — letting anyone
      // who already holds a valid token for the account infer revoked-vs-
      // active status from response latency alone, which is itself a
      // distinguishing signal even though the thrown message is identical
      // (AC #1: "no distinguishing signal that reveals the account was
      // deactivated"). Mirrors AuthService.login's dummy-hash compare for
      // the same class of leak.
      await this.passwordService.hash(newPassword);
      throw new BadRequestException(INVALID_OR_EXPIRED_MESSAGE);
    }

    const passwordHash = await this.passwordService.hash(newPassword);

    await this.prisma.client.$transaction(async (tx) => {
      // The actual single-use guard: `usedAt: null` in this update's WHERE
      // clause makes claiming the token atomic. If a concurrent confirmReset
      // already claimed it between our findFirst above and here (e.g. while
      // this call was awaiting bcrypt), `count` is 0 and we abort instead of
      // silently applying a second password change (frozen spec, Boundaries
      // & Constraints: single-use enforced at consumption time in the DB
      // query itself, not a post-fetch application-code check).
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id: resetToken.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (count === 0) {
        throw new BadRequestException(INVALID_OR_EXPIRED_MESSAGE);
      }

      // Re-verifies the same guard at commit time, atomically — closes the
      // TOCTOU window between the pre-check read above and here (e.g. an
      // admin revoking the account while this call was awaiting bcrypt).
      // Mirrors the token claim's own atomic-conditional-update pattern.
      const { count: userUpdateCount } = await tx.user.updateMany({
        where: {
          id: resetToken.userId,
          OR: [
            { passwordHash: null }, // never-activated invite (AC #2)
            { isActive: true }, // already active (AC #3)
            { revokedAt: { lte: resetToken.createdAt } }, // revoked, but this token postdates it (re-invite)
          ],
        },
        data: { passwordHash, isActive: true, revokedAt: null },
      });
      if (userUpdateCount === 0) {
        throw new BadRequestException(INVALID_OR_EXPIRED_MESSAGE);
      }

      // Invalidate any other still-unused, unexpired tokens for this user —
      // a fresh password makes all older outstanding reset links moot.
      await tx.passwordResetToken.updateMany({
        where: {
          userId: resetToken.userId,
          id: { not: resetToken.id },
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
    });
  }

  // Reset tokens are single-use, high-entropy (32 random bytes), and
  // discarded after one use — no brute-force-by-repeated-guessing surface
  // that bcrypt's cost factor would defend against, so a fast hash keeps
  // the lookup cheap (Design Notes).
  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }
}
