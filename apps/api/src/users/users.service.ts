import { ConflictException, Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Role } from '../../generated/prisma';
import { Prisma } from '../../generated/prisma';
import { PasswordResetService } from '../auth/password-reset.service';
import { MailService } from '../notifications/mail.service';
import { PrismaService } from '../prisma/prisma.service';

export interface PendingUserResponse {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  homeId: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordResetService: PasswordResetService,
    private readonly mailService: MailService,
  ) {}

  // Story 1.3: super_admin invites a home admin for `homeId`. Creates a
  // pending account (no password) + its HomeMembership, then dispatches the
  // same one-time activation link Story 1.7 already knows how to consume.
  //
  // The two writes are deliberately NOT wrapped in a single $transaction:
  // HomeMembership is tenant-scoped, and the tenant-scoping Prisma extension
  // opens its own internal transaction against the base (non-interactive)
  // client for every tenant-scoped operation — nesting that inside an
  // already-open interactive transaction is unverified territory this
  // codebase has never exercised (no tenant-scoped model has a write path
  // yet). Two sequential top-level calls, each already atomic on its own via
  // the extension, sidesteps that entirely.
  async createPendingHomeAdmin(
    homeId: string,
    email: string,
    homeName: string,
  ): Promise<PendingUserResponse> {
    const normalizedEmail = email.trim().toLowerCase();
    const role: Role = 'admin';

    const user = await this.createUser(normalizedEmail, role);

    // Everything from here on rolls back to a clean state on any failure —
    // not just the HomeMembership write (code-review finding: the original
    // version only guarded that one call, leaving a committed User+
    // HomeMembership with no token/email, and thus a permanently
    // unrecoverable invite, if the token write below failed instead).
    let rawToken: string;
    try {
      await this.prisma.client.homeMembership.create({
        data: { userId: user.id, homeId, role },
      });
      rawToken = await this.passwordResetService.issueActivationToken(user.id);
    } catch (error) {
      await this.rollbackPendingUser(user.id, error);
      throw error;
    }

    // Fire-and-forget, same convention as PasswordResetService.requestReset:
    // never block the HTTP response on third-party email delivery.
    this.mailService
      .sendAccountInviteEmail(normalizedEmail, rawToken, homeName)
      .catch(() => {});

    return { ...user, homeId };
  }

  // HomeMembership cascades on User delete (schema's onDelete: Cascade), so
  // this one delete cleans up both rows regardless of which step above
  // failed — so a retry after a transient failure doesn't hit the
  // email-uniqueness conflict for an account that never fully got set up
  // (remaining crash-window edge case documented in deferred-work.md).
  private async rollbackPendingUser(
    userId: string,
    originalError: unknown,
  ): Promise<void> {
    try {
      await this.prisma.client.user.delete({ where: { id: userId } });
    } catch (deleteError) {
      // The compensating delete can itself fail for the same transient
      // reason the original write did — report both instead of letting the
      // delete's exception silently replace and hide the original one
      // (code-review finding).
      this.logger.error(
        `Failed to roll back orphaned pending user ${userId} after: ${String(originalError)}`,
      );
      Sentry.captureException(deleteError);
    }
  }

  private async createUser(
    email: string,
    role: Role,
  ): Promise<Omit<PendingUserResponse, 'homeId'>> {
    try {
      // Explicit `select` — never return the raw Prisma User (passwordHash
      // and any future sensitive field must never leak into an API
      // response), mirroring AuthController.me().
      return await this.prisma.client.user.create({
        data: { email, role, isActive: false },
        select: { id: true, email: true, role: true, isActive: true },
      });
    } catch (error) {
      throw this.mapUniqueEmailViolation(error);
    }
  }

  private mapUniqueEmailViolation(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException('A user with this email already exists');
    }
    return error;
  }
}
