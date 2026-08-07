import { ConflictException, Injectable } from '@nestjs/common';
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

    try {
      await this.prisma.client.homeMembership.create({
        data: { userId: user.id, homeId, role },
      });
    } catch (error) {
      // Roll back the orphaned pending user so a retry doesn't hit the
      // email-uniqueness conflict below for an account that never got its
      // membership (see Dev Notes — remaining crash-window edge case is
      // documented in deferred-work.md).
      await this.prisma.client.user.delete({ where: { id: user.id } });
      throw error;
    }

    const rawToken = await this.passwordResetService.issueActivationToken(
      user.id,
    );

    // Fire-and-forget, same convention as PasswordResetService.requestReset:
    // never block the HTTP response on third-party email delivery.
    this.mailService
      .sendAccountInviteEmail(normalizedEmail, rawToken, homeName)
      .catch(() => {});

    return { ...user, homeId };
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
