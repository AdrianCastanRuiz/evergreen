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

      await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash, isActive: true },
      });
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
