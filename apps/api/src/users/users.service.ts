import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Role } from '../../generated/prisma';
import { Prisma } from '../../generated/prisma';
import { PasswordResetService } from '../auth/password-reset.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { MailService } from '../notifications/mail.service';
import { PrismaService } from '../prisma/prisma.service';

// Story 1.5 (AC #5): invitation is strictly downward — a caller may only
// invite a role ranked below their own. Derived from epics.md's coarse
// chain (super_admin -> home_admin -> staff/family) plus its one worked
// example (staff inviting a home admin is rejected); `family` ranks below
// `staff` so a staff member can invite family but never another staff
// (same-rank, also rejected). Scoped to this file only — no other story
// needs a role-hierarchy comparison yet.
const ROLE_RANK: Record<Role, number> = {
  family: 0,
  staff: 1,
  admin: 2,
  super_admin: 3,
};

// Story 1.12: a home admin only ever lists/manages `staff`/`family` within
// their own home — `admin`/`super_admin` stay Story 1.3/1.4's exclusive
// territory. Same boundary as InviteUserDto's INVITABLE_ROLES, kept
// separate on purpose (DTO validation vs. service-layer query filter).
const MANAGEABLE_ROLES: Role[] = ['staff', 'family'];

export interface PendingUserResponse {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  // null for super_admin (Story 1.4) — the role has no home scope at all,
  // unlike admin/staff which always get a real HomeMembership-backed value.
  homeId: string | null;
}

export interface HomeUserSummary {
  id: string;
  email: string;
  name: string | null;
  role: 'staff' | 'family';
  isActive: boolean;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordResetService: PasswordResetService,
    private readonly mailService: MailService,
    private readonly tenantContext: TenantContextService,
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

  // Story 1.4: super_admin creates another super_admin. Unlike
  // createPendingHomeAdmin, this role has no home scope at all — no
  // HomeMembership row is ever created for it (the schema has no `home_id`
  // on `User`; home scoping only exists via HomeMembership, which this role
  // never gets a row in). That also means no @BypassTenantScope() is needed
  // on the controller route: nothing here touches a tenant-scoped model.
  async createSuperAdmin(email: string): Promise<PendingUserResponse> {
    const normalizedEmail = email.trim().toLowerCase();
    const role: Role = 'super_admin';

    const user = await this.createUser(normalizedEmail, role);

    let rawToken: string;
    try {
      rawToken = await this.passwordResetService.issueActivationToken(user.id);
    } catch (error) {
      await this.rollbackPendingUser(user.id, error);
      throw error;
    }

    this.mailService
      .sendSuperAdminInviteEmail(normalizedEmail, rawToken)
      .catch(() => {});

    return { ...user, homeId: null };
  }

  // Story 1.5: a home admin/staff invites a staff or family member into
  // their own home (`actorHomeId`, resolved server-side from the caller's
  // JWT — never attacker-suppliable). Unlike createPendingHomeAdmin, the
  // actor is never super_admin here, so their JWT already carries a real
  // homeId and the tenant-scoping Prisma extension auto-injects it into the
  // HomeMembership write with no @BypassTenantScope() needed.
  async inviteUser(
    actorRole: Role,
    actorHomeId: string,
    homeName: string,
    email: string,
    targetRole: Role,
  ): Promise<PendingUserResponse> {
    // AC #5: strictly downward invitation. Checked before any read/write —
    // a same-or-higher-rank invite never even looks up the target email.
    if (ROLE_RANK[targetRole] >= ROLE_RANK[actorRole]) {
      throw new ForbiddenException();
    }

    const normalizedEmail = email.trim().toLowerCase();
    // Explicit select — never return the raw Prisma User (passwordHash must
    // never leak into an API response), same as createUser's helper below.
    // Code-review finding: the AC #4 branch spreads `existing` straight into
    // the HTTP response, so without this the caller would receive the
    // target user's bcrypt hash.
    const existing = await this.prisma.client.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (existing) {
      // AC #4 only carves out one narrow exception: an existing *family*
      // user being added to *another* home. Every other existing-email case
      // (non-family role, or a family email being invited as staff) is a
      // plain conflict — non-family roles are strictly single-home (AC #2),
      // and a family email can't be "promoted" to staff via an invite.
      if (targetRole !== 'family' || existing.role !== 'family') {
        throw new ConflictException('A user with this email already exists');
      }
      return this.grantExistingFamilyUserHomeAccess(
        existing,
        actorHomeId,
        homeName,
      );
    }

    const user = await this.createUser(normalizedEmail, targetRole);

    let rawToken: string;
    try {
      // `homeId` here is required by Prisma's generated type (no default
      // on the column) but is NOT actually what determines the row's
      // home_id: this is the non-bypass auto-inject path, and the
      // tenant-scoping extension always overwrites it with the request
      // context's own homeId last (tenant-scoping.extension.ts's
      // injectHomeId spreads its value after the caller's data). The two
      // values are guaranteed equal today (both derive from the same
      // context), so this field is effectively inert — code-review finding.
      await this.prisma.client.homeMembership.create({
        data: { userId: user.id, homeId: actorHomeId, role: targetRole },
      });
      rawToken = await this.passwordResetService.issueActivationToken(user.id);
    } catch (error) {
      await this.rollbackPendingUser(user.id, error);
      throw error;
    }

    this.mailService
      .sendAccountInviteEmail(normalizedEmail, rawToken, homeName)
      .catch(() => {});

    return { ...user, homeId: actorHomeId };
  }

  // AC #4: the invited email already belongs to a family user active in a
  // different home. No new User row — just a new HomeMembership — so the
  // existing user gains access to both homes (AD-18) instead of a rejected
  // duplicate-email conflict.
  private async grantExistingFamilyUserHomeAccess(
    existing: Omit<PendingUserResponse, 'homeId'>,
    actorHomeId: string,
    homeName: string,
  ): Promise<PendingUserResponse> {
    const alreadyMember = await this.prisma.client.homeMembership.findUnique({
      where: {
        userId_homeId: { userId: existing.id, homeId: actorHomeId },
      },
    });
    if (alreadyMember) {
      throw new ConflictException('This user is already a member of this home');
    }

    try {
      await this.prisma.client.homeMembership.create({
        data: { userId: existing.id, homeId: actorHomeId, role: 'family' },
      });
    } catch (error) {
      // TOCTOU: two concurrent invites of the same existing user into the
      // same home can both pass the alreadyMember check above before
      // either create commits — the loser's insert then violates
      // @@unique([userId, homeId]) (code-review finding). Map that P2002 to
      // the same 409 the single-request path already returns, instead of
      // letting a raw Prisma error surface as an unhandled 500.
      throw this.mapUniqueMembershipViolation(error);
    }

    if (existing.isActive) {
      // Already has a password — no token/activation-link needed, just a
      // plain notification (see MailService.sendHomeAccessAddedEmail's
      // comment for why this is deliberately NOT the same mechanism as a
      // fresh invite, despite epics.md's AC #4 wording).
      this.mailService
        .sendHomeAccessAddedEmail(existing.email, homeName)
        .catch(() => {});
    } else {
      let rawToken: string;
      try {
        rawToken = await this.passwordResetService.issueActivationToken(
          existing.id,
        );
      } catch (error) {
        // Code-review finding: without this, a token-issuance failure here
        // left the HomeMembership committed with no token/email ever sent —
        // the same partial-write bug createPendingHomeAdmin's own rollback
        // already exists to prevent, just missing from this branch.
        await this.rollbackHomeMembership(existing.id, actorHomeId, error);
        throw error;
      }
      this.mailService
        .sendAccountInviteEmail(existing.email, rawToken, homeName)
        .catch(() => {});
    }

    return { ...existing, homeId: actorHomeId };
  }

  // Compensating delete for grantExistingFamilyUserHomeAccess's
  // HomeMembership write — mirrors rollbackPendingUser's shape (log +
  // report to Sentry without masking the original error if the delete
  // itself also fails).
  private async rollbackHomeMembership(
    userId: string,
    homeId: string,
    originalError: unknown,
  ): Promise<void> {
    try {
      await this.prisma.client.homeMembership.delete({
        where: { userId_homeId: { userId, homeId } },
      });
    } catch (deleteError) {
      this.logger.error(
        `Failed to roll back orphaned HomeMembership for user ${userId}/home ${homeId} after: ${String(originalError)}`,
      );
      Sentry.captureException(deleteError);
    }
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

  // Story 1.12 (AC #1): every staff+family user in the caller's own home,
  // via HomeMembership (auto-scoped by the tenant-scoping extension) — User
  // itself has no home_id column to filter on directly.
  async listHomeUsers(homeId: string): Promise<HomeUserSummary[]> {
    const memberships = await this.prisma.client.homeMembership.findMany({
      where: { homeId, role: { in: MANAGEABLE_ROLES } },
      include: {
        user: {
          select: { id: true, email: true, name: true, isActive: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((membership) => ({
      id: membership.user.id,
      email: membership.user.email,
      name: membership.user.name,
      role: membership.role as 'staff' | 'family',
      isActive: membership.user.isActive,
    }));
  }

  // Story 1.12 (AC #2, #4): changes a target user's role within the
  // caller's own home. Updates User.role AND this home's HomeMembership.role
  // together — User.role is what AuthService.login/refresh actually put in
  // the JWT (AD-8), so HomeMembership.role alone would be cosmetic.
  async updateUserRole(
    actorUserId: string,
    actorHomeId: string,
    targetUserId: string,
    newRole: 'staff' | 'family',
  ): Promise<HomeUserSummary> {
    // Self-lockout guard — not in the story's AC, but changing your own role
    // through the same endpoint that manages users *below* you invites an
    // accidental self-demotion with no one left to undo it.
    if (targetUserId === actorUserId) {
      throw new ForbiddenException();
    }

    const membership = await this.prisma.client.homeMembership.findUnique({
      where: { userId_homeId: { userId: targetUserId, homeId: actorHomeId } },
      include: {
        user: {
          select: { id: true, email: true, name: true, isActive: true },
        },
      },
    });
    // Covers both "not in my home" and "is admin/super_admin" (out of
    // MANAGEABLE_ROLES) with the same 404 — never reveals which (AC #3).
    if (!membership || !MANAGEABLE_ROLES.includes(membership.role)) {
      throw new NotFoundException('User not found in your home');
    }

    if (newRole === 'staff') {
      // `staff` requires the "exactly one home" invariant AuthService's
      // login/refresh already assumes (resolveFixedHomeId /
      // assertFixedHomeInvariant) — promoting a user linked to several
      // homes would silently violate it. Counted across ALL of the user's
      // homes, not just this one, so this must step outside the current
      // tenant scope (AD-1) — same escape hatch AuthService.resolveFixedHomeId
      // uses, not the (super_admin-only) @BypassTenantScope() decorator.
      const membershipCount = await this.tenantContext.runBypassed(() =>
        this.prisma.client.homeMembership.count({
          where: { userId: targetUserId },
        }),
      );
      if (membershipCount > 1) {
        throw new ConflictException(
          'Cannot promote a user who belongs to more than one home to staff',
        );
      }
    }

    await this.prisma.client.user.update({
      where: { id: targetUserId },
      data: { role: newRole },
    });
    await this.prisma.client.homeMembership.update({
      where: { userId_homeId: { userId: targetUserId, homeId: actorHomeId } },
      data: { role: newRole },
    });

    return {
      id: membership.user.id,
      email: membership.user.email,
      name: membership.user.name,
      role: newRole,
      isActive: membership.user.isActive,
    };
  }

  // Story 1.12 (AC #5): removes a user's access to the caller's home —
  // deletes their HomeMembership row for this home, not the User itself
  // (a family user may still legitimately belong to other homes). If this
  // was their last membership anywhere, also deactivates the account: a
  // homeless-but-active User can't do anything useful, and this makes their
  // very next refresh()/login() (which both re-check isActive fresh from
  // the DB) fail immediately instead of only via the up-to-15-minute
  // residual window on an already-issued access token.
  async revokeAccess(
    actorUserId: string,
    actorHomeId: string,
    targetUserId: string,
  ): Promise<void> {
    if (targetUserId === actorUserId) {
      throw new ForbiddenException();
    }

    const membership = await this.prisma.client.homeMembership.findUnique({
      where: { userId_homeId: { userId: targetUserId, homeId: actorHomeId } },
    });
    if (!membership || !MANAGEABLE_ROLES.includes(membership.role)) {
      throw new NotFoundException('User not found in your home');
    }

    await this.prisma.client.homeMembership.delete({
      where: { userId_homeId: { userId: targetUserId, homeId: actorHomeId } },
    });

    // Same cross-home escape hatch as updateUserRole's promotion check —
    // a plain (non-bypassed) count here would be auto-scoped to
    // actorHomeId and always read 0 right after the delete above,
    // regardless of memberships the user still holds elsewhere.
    const remaining = await this.tenantContext.runBypassed(() =>
      this.prisma.client.homeMembership.count({
        where: { userId: targetUserId },
      }),
    );
    if (remaining === 0) {
      await this.prisma.client.user.update({
        where: { id: targetUserId },
        data: { isActive: false },
      });
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

  private mapUniqueMembershipViolation(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException(
        'This user is already a member of this home',
      );
    }
    return error;
  }
}
