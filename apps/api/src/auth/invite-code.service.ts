import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';

// Story 1.8 (FR5): invite-code onboarding. A family member invited by a care
// home (Story 1.5) resolves their pending account by typing the invite code
// into the app and setting a password. The code is generated at invite time,
// stored as an opaque hash on the pending HomeMembership, and delivered (in
// clear) only in the invite email.
//
// Code generation is deterministic-hashable (sha256) rather than bcrypt on
// purpose: the resolution endpoint must look a HomeMembership up BY code
// value (findFirst where inviteCodeHash = H(code)), which a salt-based hash
// like bcrypt can't do. Online brute-force is contained by the endpoint's
// @Throttle (NFR10/AD-8), the 1-week TTL, and atomic single-use — and the
// hash is never exposed by any response (mirrors PasswordResetToken's
// design decision; see its file comment).

// Unambiguous code alphabet (no 0/O, 1/I/L) so a home admin can read the
// code aloud and a family member can type it without transcription errors.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 10;
const DEFAULT_TTL_HOURS = 168; // 7 days — a family invitee may take days to
// install the app, far slower than the 1h self-service reset token.
const INVALID_OR_EXPIRED_MESSAGE =
  "That invite code isn't valid — check with the home for a new one";

@Injectable()
export class InviteCodeService {
  private readonly logger = new Logger(InviteCodeService.name);
  private readonly inviteCodeTtlHours: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tenantContext: TenantContextService,
    config: ConfigService,
  ) {
    this.inviteCodeTtlHours =
      (config.get<number>('INVITE_CODE_TTL_HOURS') as number) ??
      DEFAULT_TTL_HOURS;
  }

  /**
   * Generates a fresh invite code for an existing (pending family) membership,
   * persists only its hash + expiry, and returns the raw code — the only
   * place it ever exists before landing in the invite email.
   */
  async generateForMembership(membershipId: string): Promise<string> {
    const rawCode = this.generateRawCode();
    const hash = this.hashCode(rawCode);
    const expiresAt = new Date(Date.now() + this.inviteCodeTtlHours * 3600_000);

    await this.prisma.client.homeMembership.update({
      where: { id: membershipId },
      data: {
        inviteCodeHash: hash,
        inviteCodeExpiresAt: expiresAt,
        inviteCodeUsedAt: null,
      },
    });

    return rawCode;
  }

  /**
   * Resolves a pending family account from its invite code + chosen password.
   * Single-use is enforced atomically at consumption time (same pattern as
   * PasswordResetService.confirmReset). Never returns a token pair — the
   * client navigates to login so the user signs in with the new password.
   */
  async resolveInviteCode(
    inviteCode: string,
    newPassword: string,
  ): Promise<void> {
    // Public request: no JWT, so unlike an authenticated actor there's no
    // home_id in context to auto-inject — every touch of the tenant-scoped
    // home_memberships table below would be blocked by RLS. `runBypassed`
    // flips the CURRENT store's bypass flag (the middleware always creates a
    // store, even for public routes) — safe here because resolution is by an
    // opaque high-entropy code + @Throttle, with no enumeration surface
    // (AD-1 rule 5 bypass is honored only for super_admin, so the public
    // interceptor path @BypassTenantScope() can't be used).
    return this.tenantContext.runBypassed(async () => {
      const hash = this.hashCode(inviteCode);
      const now = new Date();

      // Cheap pre-check so an obviously-invalid code 400s before paying for a
      // bcrypt hash below. This lookup is NOT what enforces single-use — that's
      // the conditional `updateMany` inside the transaction, below.
      const membership = await this.prisma.client.homeMembership.findFirst({
        where: {
          inviteCodeHash: hash,
          inviteCodeUsedAt: null,
          inviteCodeExpiresAt: { gt: now },
        },
        // Only isActive is needed below — never pull the full User (incl.
        // passwordHash) into a public-touch path.
        include: { user: { select: { isActive: true } } },
      });
      if (!membership) {
        throw new BadRequestException(INVALID_OR_EXPIRED_MESSAGE);
      }

      // Defensive: the code's membership must still be a pending family one.
      // Under normal flow the code is only generated for a pending family
      // invite, but never let a resolved/activated or non-family membership
      // be re-resolved through this path.
      if (membership.role !== 'family' || membership.user.isActive) {
        throw new BadRequestException(INVALID_OR_EXPIRED_MESSAGE);
      }

      const passwordHash = await this.passwordService.hash(newPassword);

      await this.prisma.client.$transaction(async (tx) => {
        // The actual single-use guard: `inviteCodeUsedAt: null` in this
        // update's WHERE makes claiming the code atomic. If a concurrent
        // resolve already claimed it between our findFirst above and here
        // (e.g. while this call was awaiting bcrypt), `count` is 0 and we
        // abort instead of silently applying a second password change.
        const { count } = await tx.homeMembership.updateMany({
          where: {
            id: membership.id,
            inviteCodeUsedAt: null,
            inviteCodeExpiresAt: { gt: now },
          },
          data: { inviteCodeUsedAt: now },
        });
        if (count === 0) {
          throw new BadRequestException(INVALID_OR_EXPIRED_MESSAGE);
        }

        await tx.user.update({
          where: { id: membership.userId },
          data: { passwordHash, isActive: true },
        });
      });
    });
  }

  private generateRawCode(): string {
    const bytes = crypto.randomBytes(CODE_LENGTH);
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      // Map each random byte onto the alphabet without modulo bias.
      const idx = bytes[i] % CODE_ALPHABET.length;
      code += CODE_ALPHABET.charAt(idx);
    }
    return code;
  }

  // Deterministic hash so the endpoint can look a code up by value, and
  // identical in style to PasswordResetToken's. Discard-after-use: the hash
  // itself never leaves the DB.
  private hashCode(rawCode: string): string {
    return crypto.createHash('sha256').update(rawCode).digest('hex');
  }
}
