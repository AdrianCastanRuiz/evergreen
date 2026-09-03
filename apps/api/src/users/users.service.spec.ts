import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as Sentry from '@sentry/nestjs';
import { Prisma } from '../../generated/prisma';
import { InviteCodeService } from '../auth/invite-code.service';
import { PasswordResetService } from '../auth/password-reset.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { MailService } from '../notifications/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));

describe('UsersService', () => {
  let usersService: UsersService;
  let prisma: {
    client: {
      user: {
        create: jest.Mock;
        delete: jest.Mock;
        findUnique: jest.Mock;
        update: jest.Mock;
      };
      homeMembership: {
        create: jest.Mock;
        findUnique: jest.Mock;
        findMany: jest.Mock;
        update: jest.Mock;
        delete: jest.Mock;
        count: jest.Mock;
      };
      resident: {
        findUnique: jest.Mock;
      };
      familyLink: {
        create: jest.Mock;
      };
    };
  };
  let passwordResetService: { issueActivationToken: jest.Mock };
  let mailService: {
    sendAccountInviteEmail: jest.Mock;
    sendSuperAdminInviteEmail: jest.Mock;
    sendHomeAccessAddedEmail: jest.Mock;
    sendFamilyInviteEmail: jest.Mock;
  };
  let inviteCodeService: { generateForMembership: jest.Mock };
  let tenantContext: { runBypassed: jest.Mock };

  const pendingUser = {
    id: 'user-1',
    email: 'admin@evergreen.test',
    role: 'admin' as const,
    isActive: false,
  };

  const pendingSuperAdmin = {
    id: 'user-2',
    email: 'super@evergreen.test',
    role: 'super_admin' as const,
    isActive: false,
  };

  const uniqueViolation = new Prisma.PrismaClientKnownRequestError('conflict', {
    code: 'P2002',
    clientVersion: 'test',
  });

  const recordNotFoundViolation = new Prisma.PrismaClientKnownRequestError(
    'not found',
    { code: 'P2025', clientVersion: 'test' },
  );

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = {
      client: {
        user: {
          create: jest.fn(),
          delete: jest.fn(),
          findUnique: jest.fn(),
          update: jest.fn(),
        },
        homeMembership: {
          create: jest.fn(),
          findUnique: jest.fn(),
          findMany: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
          count: jest.fn(),
        },
        resident: {
          findUnique: jest.fn(),
        },
        familyLink: {
          create: jest.fn(),
        },
      },
    };
    passwordResetService = { issueActivationToken: jest.fn() };
    mailService = {
      sendAccountInviteEmail: jest.fn().mockResolvedValue(undefined),
      sendSuperAdminInviteEmail: jest.fn().mockResolvedValue(undefined),
      sendHomeAccessAddedEmail: jest.fn().mockResolvedValue(undefined),
      sendFamilyInviteEmail: jest.fn().mockResolvedValue(undefined),
    };
    inviteCodeService = { generateForMembership: jest.fn() };
    // runBypassed just runs the callback for these tests — the mock Prisma
    // client isn't tenant-scoping-aware, so there's no real bypass branch to
    // exercise; only that UsersService calls through it (not a plain
    // homeMembership.count) is what these tests assert.
    tenantContext = {
      runBypassed: jest.fn((fn: () => unknown) => fn()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: PasswordResetService, useValue: passwordResetService },
        { provide: MailService, useValue: mailService },
        { provide: InviteCodeService, useValue: inviteCodeService },
        { provide: TenantContextService, useValue: tenantContext },
      ],
    }).compile();

    usersService = module.get(UsersService);
  });

  describe('createPendingHomeAdmin', () => {
    it('creates a pending admin User, a HomeMembership, issues a token, and emails the invite', async () => {
      prisma.client.user.create.mockResolvedValue(pendingUser);
      passwordResetService.issueActivationToken.mockResolvedValue('raw-token');

      const result = await usersService.createPendingHomeAdmin(
        'home-1',
        '  Admin@Evergreen.test  ',
        'Evergreen Oaks',
      );

      expect(prisma.client.user.create).toHaveBeenCalledWith({
        data: {
          email: 'admin@evergreen.test',
          role: 'admin',
          isActive: false,
          name: null,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
        },
      });
      expect(prisma.client.homeMembership.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', homeId: 'home-1', role: 'admin' },
      });
      expect(passwordResetService.issueActivationToken).toHaveBeenCalledWith(
        'user-1',
      );
      expect(mailService.sendAccountInviteEmail).toHaveBeenCalledWith(
        'admin@evergreen.test',
        'raw-token',
        'Evergreen Oaks',
      );
      expect(result).toEqual({ ...pendingUser, homeId: 'home-1' });
    });

    it('does not leak passwordHash — response only contains the selected fields', async () => {
      prisma.client.user.create.mockResolvedValue(pendingUser);
      passwordResetService.issueActivationToken.mockResolvedValue('raw-token');

      const result = await usersService.createPendingHomeAdmin(
        'home-1',
        'admin@evergreen.test',
        'Evergreen Oaks',
      );

      expect(result).not.toHaveProperty('passwordHash');
    });

    it('rejects a duplicate email with ConflictException instead of a raw 500, and never creates a membership', async () => {
      prisma.client.user.create.mockRejectedValue(uniqueViolation);

      await expect(
        usersService.createPendingHomeAdmin(
          'home-1',
          'admin@evergreen.test',
          'Evergreen Oaks',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.client.homeMembership.create).not.toHaveBeenCalled();
      expect(passwordResetService.issueActivationToken).not.toHaveBeenCalled();
    });

    it('rolls back the orphaned pending User when HomeMembership creation fails', async () => {
      prisma.client.user.create.mockResolvedValue(pendingUser);
      const membershipError = new Error('membership insert failed');
      prisma.client.homeMembership.create.mockRejectedValue(membershipError);

      await expect(
        usersService.createPendingHomeAdmin(
          'home-1',
          'admin@evergreen.test',
          'Evergreen Oaks',
        ),
      ).rejects.toBe(membershipError);

      expect(prisma.client.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
      expect(passwordResetService.issueActivationToken).not.toHaveBeenCalled();
      expect(mailService.sendAccountInviteEmail).not.toHaveBeenCalled();
    });

    it('rolls back the orphaned pending User when token issuance fails after HomeMembership already succeeded', async () => {
      prisma.client.user.create.mockResolvedValue(pendingUser);
      prisma.client.homeMembership.create.mockResolvedValue({});
      const tokenError = new Error('token insert failed');
      passwordResetService.issueActivationToken.mockRejectedValue(tokenError);

      await expect(
        usersService.createPendingHomeAdmin(
          'home-1',
          'admin@evergreen.test',
          'Evergreen Oaks',
        ),
      ).rejects.toBe(tokenError);

      expect(prisma.client.homeMembership.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', homeId: 'home-1', role: 'admin' },
      });
      expect(prisma.client.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
      expect(mailService.sendAccountInviteEmail).not.toHaveBeenCalled();
    });

    it('reports to Sentry (without losing the original error) when the rollback delete itself fails', async () => {
      prisma.client.user.create.mockResolvedValue(pendingUser);
      const membershipError = new Error('membership insert failed');
      prisma.client.homeMembership.create.mockRejectedValue(membershipError);
      const deleteError = new Error('delete also failed');
      prisma.client.user.delete.mockRejectedValue(deleteError);

      await expect(
        usersService.createPendingHomeAdmin(
          'home-1',
          'admin@evergreen.test',
          'Evergreen Oaks',
        ),
      ).rejects.toBe(membershipError);

      expect(Sentry.captureException).toHaveBeenCalledWith(deleteError);
    });
  });

  describe('createSuperAdmin', () => {
    it('creates a pending super_admin User with no HomeMembership, issues a token, and emails the invite', async () => {
      prisma.client.user.create.mockResolvedValue(pendingSuperAdmin);
      passwordResetService.issueActivationToken.mockResolvedValue('raw-token');

      const result = await usersService.createSuperAdmin(
        '  Super@Evergreen.test  ',
      );

      expect(prisma.client.user.create).toHaveBeenCalledWith({
        data: {
          email: 'super@evergreen.test',
          role: 'super_admin',
          isActive: false,
          name: null,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
        },
      });
      expect(prisma.client.homeMembership.create).not.toHaveBeenCalled();
      expect(passwordResetService.issueActivationToken).toHaveBeenCalledWith(
        'user-2',
      );
      expect(mailService.sendSuperAdminInviteEmail).toHaveBeenCalledWith(
        'super@evergreen.test',
        'raw-token',
      );
      expect(result).toEqual({ ...pendingSuperAdmin, homeId: null });
    });

    it('does not leak passwordHash — response only contains the selected fields', async () => {
      prisma.client.user.create.mockResolvedValue(pendingSuperAdmin);
      passwordResetService.issueActivationToken.mockResolvedValue('raw-token');

      const result = await usersService.createSuperAdmin(
        'super@evergreen.test',
      );

      expect(result).not.toHaveProperty('passwordHash');
    });

    it('rejects a duplicate email with ConflictException instead of a raw 500, and never issues a token', async () => {
      prisma.client.user.create.mockRejectedValue(uniqueViolation);

      await expect(
        usersService.createSuperAdmin('super@evergreen.test'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(passwordResetService.issueActivationToken).not.toHaveBeenCalled();
      expect(mailService.sendSuperAdminInviteEmail).not.toHaveBeenCalled();
    });

    it('rolls back the orphaned pending User when token issuance fails', async () => {
      prisma.client.user.create.mockResolvedValue(pendingSuperAdmin);
      const tokenError = new Error('token insert failed');
      passwordResetService.issueActivationToken.mockRejectedValue(tokenError);

      await expect(
        usersService.createSuperAdmin('super@evergreen.test'),
      ).rejects.toBe(tokenError);

      expect(prisma.client.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-2' },
      });
      expect(mailService.sendSuperAdminInviteEmail).not.toHaveBeenCalled();
    });
  });

  describe('inviteUser', () => {
    const pendingStaff = {
      id: 'user-3',
      email: 'staff@evergreen.test',
      role: 'staff' as const,
      isActive: false,
    };

    const pendingFamily = {
      id: 'user-4',
      email: 'family@evergreen.test',
      role: 'family' as const,
      isActive: false,
    };

    const existingActiveFamily = {
      id: 'user-5',
      email: 'existing-family@evergreen.test',
      role: 'family' as const,
      isActive: true,
    };

    const existingPendingFamily = {
      id: 'user-6',
      email: 'pending-family@evergreen.test',
      role: 'family' as const,
      isActive: false,
    };

    const existingStaff = {
      id: 'user-7',
      email: 'other-home-staff@evergreen.test',
      role: 'staff' as const,
      isActive: true,
    };

    it('creates a pending staff User, a HomeMembership, issues a token, and emails the invite (AC #1)', async () => {
      prisma.client.user.findUnique.mockResolvedValue(null);
      prisma.client.user.create.mockResolvedValue(pendingStaff);
      passwordResetService.issueActivationToken.mockResolvedValue('raw-token');

      const result = await usersService.inviteUser(
        'admin',
        'home-1',
        'Evergreen Oaks',
        '  Staff@Evergreen.test  ',
        'staff',
      );

      expect(prisma.client.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'staff@evergreen.test' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
        },
      });
      expect(prisma.client.user.create).toHaveBeenCalledWith({
        data: {
          email: 'staff@evergreen.test',
          role: 'staff',
          isActive: false,
          name: null,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
        },
      });
      expect(prisma.client.homeMembership.create).toHaveBeenCalledWith({
        data: { userId: 'user-3', homeId: 'home-1', role: 'staff' },
        select: { id: true },
      });
      expect(passwordResetService.issueActivationToken).toHaveBeenCalledWith(
        'user-3',
      );
      expect(mailService.sendAccountInviteEmail).toHaveBeenCalledWith(
        'staff@evergreen.test',
        'raw-token',
        'Evergreen Oaks',
      );
      expect(mailService.sendHomeAccessAddedEmail).not.toHaveBeenCalled();
      expect(result).toEqual({ ...pendingStaff, homeId: 'home-1' });
    });

    it('creates a pending family User + HomeMembership, generates an invite code, and emails the family invite (AC #3)', async () => {
      prisma.client.user.findUnique.mockResolvedValue(null);
      prisma.client.user.create.mockResolvedValue(pendingFamily);
      prisma.client.homeMembership.create.mockResolvedValue({
        id: 'membership-family',
      });
      inviteCodeService.generateForMembership.mockResolvedValue('ABCDEFGHJK');

      const result = await usersService.inviteUser(
        'staff',
        'home-1',
        'Evergreen Oaks',
        'family@evergreen.test',
        'family',
      );

      expect(prisma.client.user.create).toHaveBeenCalledWith({
        data: {
          email: 'family@evergreen.test',
          role: 'family',
          isActive: false,
          name: null,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
        },
      });
      expect(prisma.client.homeMembership.create).toHaveBeenCalledWith({
        data: { userId: 'user-4', homeId: 'home-1', role: 'family' },
        select: { id: true },
      });
      // Story 1.8: a NEW family member gets an invite code (not an
      // activation link/token) — FR5's invite-code onboarding path.
      expect(inviteCodeService.generateForMembership).toHaveBeenCalledWith(
        'membership-family',
      );
      expect(passwordResetService.issueActivationToken).not.toHaveBeenCalled();
      expect(mailService.sendFamilyInviteEmail).toHaveBeenCalledWith(
        'family@evergreen.test',
        'ABCDEFGHJK',
        'Evergreen Oaks',
      );
      expect(mailService.sendAccountInviteEmail).not.toHaveBeenCalled();
      expect(result).toEqual({ ...pendingFamily, homeId: 'home-1' });
    });

    it('creates a FamilyLink alongside the invite when residentId is given for a new family invite (Story 2.2 AC #1)', async () => {
      prisma.client.user.findUnique.mockResolvedValue(null);
      prisma.client.resident.findUnique.mockResolvedValue({
        id: 'resident-1',
        homeId: 'home-1',
      });
      prisma.client.user.create.mockResolvedValue(pendingFamily);
      prisma.client.homeMembership.create.mockResolvedValue({
        id: 'membership-family',
      });
      inviteCodeService.generateForMembership.mockResolvedValue('ABCDEFGHJK');
      prisma.client.familyLink.create.mockResolvedValue({});

      await usersService.inviteUser(
        'staff',
        'home-1',
        'Evergreen Oaks',
        'family@evergreen.test',
        'family',
        undefined,
        'resident-1',
      );

      expect(prisma.client.resident.findUnique).toHaveBeenCalledWith({
        where: { id: 'resident-1' },
      });
      expect(prisma.client.familyLink.create).toHaveBeenCalledWith({
        data: { userId: 'user-4', residentId: 'resident-1', homeId: 'home-1' },
      });
    });

    it('rejects a residentId that does not resolve in the caller home, before creating any user (Story 2.2 AC #4)', async () => {
      prisma.client.resident.findUnique.mockResolvedValue(null);

      await expect(
        usersService.inviteUser(
          'staff',
          'home-1',
          'Evergreen Oaks',
          'family@evergreen.test',
          'family',
          undefined,
          'other-home-resident',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.client.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.client.user.create).not.toHaveBeenCalled();
    });

    it('ignores residentId as a no-op when inviting staff (Story 2.2)', async () => {
      prisma.client.user.findUnique.mockResolvedValue(null);
      prisma.client.user.create.mockResolvedValue(pendingStaff);
      passwordResetService.issueActivationToken.mockResolvedValue('raw-token');

      await usersService.inviteUser(
        'admin',
        'home-1',
        'Evergreen Oaks',
        'staff@evergreen.test',
        'staff',
        undefined,
        'resident-1',
      );

      expect(prisma.client.resident.findUnique).not.toHaveBeenCalled();
      expect(prisma.client.familyLink.create).not.toHaveBeenCalled();
    });

    it('rolls back the orphaned pending User when the FamilyLink write fails', async () => {
      prisma.client.user.findUnique.mockResolvedValue(null);
      prisma.client.resident.findUnique.mockResolvedValue({
        id: 'resident-1',
        homeId: 'home-1',
      });
      prisma.client.user.create.mockResolvedValue(pendingFamily);
      prisma.client.homeMembership.create.mockResolvedValue({
        id: 'membership-family',
      });
      inviteCodeService.generateForMembership.mockResolvedValue('ABCDEFGHJK');
      const familyLinkError = new Error('family link insert failed');
      prisma.client.familyLink.create.mockRejectedValue(familyLinkError);

      await expect(
        usersService.inviteUser(
          'staff',
          'home-1',
          'Evergreen Oaks',
          pendingFamily.email,
          'family',
          undefined,
          'resident-1',
        ),
      ).rejects.toBe(familyLinkError);

      expect(prisma.client.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-4' },
      });
      expect(mailService.sendFamilyInviteEmail).not.toHaveBeenCalled();
    });

    it('rolls back the orphaned pending User when invite-code generation fails for a new family invite', async () => {
      prisma.client.user.findUnique.mockResolvedValue(null);
      prisma.client.user.create.mockResolvedValue(pendingFamily);
      prisma.client.homeMembership.create.mockResolvedValue({
        id: 'membership-family',
      });
      const codeError = new Error('invite code write failed');
      inviteCodeService.generateForMembership.mockRejectedValue(codeError);

      await expect(
        usersService.inviteUser(
          'staff',
          'home-1',
          'Evergreen Oaks',
          pendingFamily.email,
          'family',
        ),
      ).rejects.toBe(codeError);

      expect(prisma.client.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-4' },
      });
      expect(mailService.sendFamilyInviteEmail).not.toHaveBeenCalled();
    });

    it('rejects inviting an existing non-family user from another home as staff (AC #2)', async () => {
      prisma.client.user.findUnique.mockResolvedValue(existingStaff);

      await expect(
        usersService.inviteUser(
          'admin',
          'home-1',
          'Evergreen Oaks',
          existingStaff.email,
          'staff',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.client.user.create).not.toHaveBeenCalled();
      expect(prisma.client.homeMembership.create).not.toHaveBeenCalled();
    });

    it('rejects inviting an existing non-family user as family (AC #2)', async () => {
      prisma.client.user.findUnique.mockResolvedValue(existingStaff);

      await expect(
        usersService.inviteUser(
          'admin',
          'home-1',
          'Evergreen Oaks',
          existingStaff.email,
          'family',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.client.homeMembership.create).not.toHaveBeenCalled();
    });

    it('grants an existing active family user a new home without a duplicate User, and sends a link-free notification (AC #4)', async () => {
      prisma.client.user.findUnique.mockResolvedValue(existingActiveFamily);
      prisma.client.homeMembership.findUnique.mockResolvedValue(null);

      const result = await usersService.inviteUser(
        'admin',
        'home-2',
        'Sunny Meadows',
        existingActiveFamily.email,
        'family',
      );

      expect(prisma.client.user.create).not.toHaveBeenCalled();
      expect(prisma.client.homeMembership.findUnique).toHaveBeenCalledWith({
        where: {
          userId_homeId: { userId: existingActiveFamily.id, homeId: 'home-2' },
        },
      });
      expect(prisma.client.homeMembership.create).toHaveBeenCalledWith({
        data: {
          userId: existingActiveFamily.id,
          homeId: 'home-2',
          role: 'family',
        },
      });
      expect(passwordResetService.issueActivationToken).not.toHaveBeenCalled();
      expect(mailService.sendAccountInviteEmail).not.toHaveBeenCalled();
      expect(mailService.sendHomeAccessAddedEmail).toHaveBeenCalledWith(
        existingActiveFamily.email,
        'Sunny Meadows',
      );
      expect(result).toEqual({ ...existingActiveFamily, homeId: 'home-2' });
    });

    it('creates a FamilyLink when residentId is given for an existing active family user gaining a new home (review finding, Story 2.2 AC #1/#4)', async () => {
      prisma.client.user.findUnique.mockResolvedValue(existingActiveFamily);
      prisma.client.homeMembership.findUnique.mockResolvedValue(null);
      prisma.client.resident.findUnique.mockResolvedValue({
        id: 'resident-1',
        homeId: 'home-2',
      });
      prisma.client.familyLink.create.mockResolvedValue({});

      await usersService.inviteUser(
        'admin',
        'home-2',
        'Sunny Meadows',
        existingActiveFamily.email,
        'family',
        undefined,
        'resident-1',
      );

      expect(prisma.client.familyLink.create).toHaveBeenCalledWith({
        data: {
          userId: existingActiveFamily.id,
          residentId: 'resident-1',
          homeId: 'home-2',
        },
      });
      expect(mailService.sendHomeAccessAddedEmail).toHaveBeenCalled();
    });

    it('rolls back the HomeMembership when the FamilyLink write fails for an existing active family user (review finding)', async () => {
      prisma.client.user.findUnique.mockResolvedValue(existingActiveFamily);
      prisma.client.homeMembership.findUnique.mockResolvedValue(null);
      prisma.client.resident.findUnique.mockResolvedValue({
        id: 'resident-1',
        homeId: 'home-2',
      });
      const familyLinkError = new Error('family link insert failed');
      prisma.client.familyLink.create.mockRejectedValue(familyLinkError);

      await expect(
        usersService.inviteUser(
          'admin',
          'home-2',
          'Sunny Meadows',
          existingActiveFamily.email,
          'family',
          undefined,
          'resident-1',
        ),
      ).rejects.toBe(familyLinkError);

      expect(prisma.client.homeMembership.delete).toHaveBeenCalledWith({
        where: {
          userId_homeId: { userId: existingActiveFamily.id, homeId: 'home-2' },
        },
      });
      expect(mailService.sendHomeAccessAddedEmail).not.toHaveBeenCalled();
    });

    it('grants an existing PENDING family user a new home via the activation-email path, not the notification path (AC #4)', async () => {
      prisma.client.user.findUnique.mockResolvedValue(existingPendingFamily);
      prisma.client.homeMembership.findUnique.mockResolvedValue(null);
      passwordResetService.issueActivationToken.mockResolvedValue('raw-token');

      await usersService.inviteUser(
        'admin',
        'home-2',
        'Sunny Meadows',
        existingPendingFamily.email,
        'family',
      );

      expect(passwordResetService.issueActivationToken).toHaveBeenCalledWith(
        existingPendingFamily.id,
      );
      expect(mailService.sendAccountInviteEmail).toHaveBeenCalledWith(
        existingPendingFamily.email,
        'raw-token',
        'Sunny Meadows',
      );
      expect(mailService.sendHomeAccessAddedEmail).not.toHaveBeenCalled();
    });

    it('rejects re-inviting an existing family user who already belongs to this home (AC #4)', async () => {
      prisma.client.user.findUnique.mockResolvedValue(existingActiveFamily);
      prisma.client.homeMembership.findUnique.mockResolvedValue({
        id: 'membership-1',
      });

      await expect(
        usersService.inviteUser(
          'admin',
          'home-2',
          'Sunny Meadows',
          existingActiveFamily.email,
          'family',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.client.homeMembership.create).not.toHaveBeenCalled();
    });

    it('does not leak passwordHash for the AC #4 existing-user branch — the lookup uses an explicit select', async () => {
      prisma.client.user.findUnique.mockResolvedValue(existingActiveFamily);
      prisma.client.homeMembership.findUnique.mockResolvedValue(null);

      const result = await usersService.inviteUser(
        'admin',
        'home-2',
        'Sunny Meadows',
        existingActiveFamily.email,
        'family',
      );

      expect(prisma.client.user.findUnique).toHaveBeenCalledWith({
        where: { email: existingActiveFamily.email },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
        },
      });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('maps a concurrent-invite race (P2002 on the HomeMembership create) to the same 409 instead of a raw 500', async () => {
      prisma.client.user.findUnique.mockResolvedValue(existingActiveFamily);
      prisma.client.homeMembership.findUnique.mockResolvedValue(null);
      prisma.client.homeMembership.create.mockRejectedValue(uniqueViolation);

      await expect(
        usersService.inviteUser(
          'admin',
          'home-2',
          'Sunny Meadows',
          existingActiveFamily.email,
          'family',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mailService.sendHomeAccessAddedEmail).not.toHaveBeenCalled();
      expect(mailService.sendAccountInviteEmail).not.toHaveBeenCalled();
    });

    it('rolls back the just-created HomeMembership when token issuance fails for an existing PENDING family user', async () => {
      prisma.client.user.findUnique.mockResolvedValue(existingPendingFamily);
      prisma.client.homeMembership.findUnique.mockResolvedValue(null);
      const tokenError = new Error('token insert failed');
      passwordResetService.issueActivationToken.mockRejectedValue(tokenError);

      await expect(
        usersService.inviteUser(
          'admin',
          'home-2',
          'Sunny Meadows',
          existingPendingFamily.email,
          'family',
        ),
      ).rejects.toBe(tokenError);

      expect(prisma.client.homeMembership.delete).toHaveBeenCalledWith({
        where: {
          userId_homeId: {
            userId: existingPendingFamily.id,
            homeId: 'home-2',
          },
        },
      });
      expect(mailService.sendAccountInviteEmail).not.toHaveBeenCalled();
    });

    it('reports to Sentry (without losing the original error) when the HomeMembership rollback delete itself fails', async () => {
      prisma.client.user.findUnique.mockResolvedValue(existingPendingFamily);
      prisma.client.homeMembership.findUnique.mockResolvedValue(null);
      const tokenError = new Error('token insert failed');
      passwordResetService.issueActivationToken.mockRejectedValue(tokenError);
      const deleteError = new Error('delete also failed');
      prisma.client.homeMembership.delete.mockRejectedValue(deleteError);

      await expect(
        usersService.inviteUser(
          'admin',
          'home-2',
          'Sunny Meadows',
          existingPendingFamily.email,
          'family',
        ),
      ).rejects.toBe(tokenError);

      expect(Sentry.captureException).toHaveBeenCalledWith(deleteError);
    });

    it('rejects staff inviting another staff — same rank, not strictly downward (AC #5)', async () => {
      await expect(
        usersService.inviteUser(
          'staff',
          'home-1',
          'Evergreen Oaks',
          'someone@evergreen.test',
          'staff',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.client.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.client.user.create).not.toHaveBeenCalled();
    });

    it('rolls back the orphaned pending User when HomeMembership creation fails for a new invite', async () => {
      prisma.client.user.findUnique.mockResolvedValue(null);
      prisma.client.user.create.mockResolvedValue(pendingStaff);
      const membershipError = new Error('membership insert failed');
      prisma.client.homeMembership.create.mockRejectedValue(membershipError);

      await expect(
        usersService.inviteUser(
          'admin',
          'home-1',
          'Evergreen Oaks',
          pendingStaff.email,
          'staff',
        ),
      ).rejects.toBe(membershipError);

      expect(prisma.client.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-3' },
      });
      expect(passwordResetService.issueActivationToken).not.toHaveBeenCalled();
      expect(mailService.sendAccountInviteEmail).not.toHaveBeenCalled();
    });

    it('rolls back the orphaned pending User when token issuance fails for a new invite', async () => {
      prisma.client.user.findUnique.mockResolvedValue(null);
      prisma.client.user.create.mockResolvedValue(pendingStaff);
      prisma.client.homeMembership.create.mockResolvedValue({});
      const tokenError = new Error('token insert failed');
      passwordResetService.issueActivationToken.mockRejectedValue(tokenError);

      await expect(
        usersService.inviteUser(
          'admin',
          'home-1',
          'Evergreen Oaks',
          pendingStaff.email,
          'staff',
        ),
      ).rejects.toBe(tokenError);

      expect(prisma.client.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-3' },
      });
      expect(mailService.sendAccountInviteEmail).not.toHaveBeenCalled();
    });
  });

  describe('listHomeUsers', () => {
    it('returns staff+family memberships of the given home, using the membership role (AC #1)', async () => {
      prisma.client.homeMembership.findMany.mockResolvedValue([
        {
          role: 'staff',
          user: {
            id: 'user-10',
            email: 'staff@evergreen.test',
            name: 'Staff Person',
            isActive: true,
          },
        },
        {
          role: 'family',
          user: {
            id: 'user-11',
            email: 'family@evergreen.test',
            name: null,
            isActive: false,
          },
        },
      ]);

      const result = await usersService.listHomeUsers('home-1');

      expect(prisma.client.homeMembership.findMany).toHaveBeenCalledWith({
        where: { homeId: 'home-1', role: { in: ['staff', 'family'] } },
        include: {
          user: {
            select: { id: true, email: true, name: true, isActive: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual([
        {
          id: 'user-10',
          email: 'staff@evergreen.test',
          name: 'Staff Person',
          role: 'staff',
          isActive: true,
        },
        {
          id: 'user-11',
          email: 'family@evergreen.test',
          name: null,
          role: 'family',
          isActive: false,
        },
      ]);
    });
  });

  describe('updateUserRole', () => {
    const targetMembership = {
      role: 'family' as const,
      user: {
        id: 'user-20',
        email: 'family@evergreen.test',
        name: 'Family Person',
        isActive: true,
      },
    };

    it('rejects a home admin changing their own role (self-lockout)', async () => {
      await expect(
        usersService.updateUserRole('user-20', 'home-1', 'user-20', 'staff'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.client.homeMembership.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a target outside the caller home or with a non-manageable role (AC #3) with 404, not 403', async () => {
      prisma.client.homeMembership.findUnique.mockResolvedValue(null);

      await expect(
        usersService.updateUserRole('actor-1', 'home-1', 'user-99', 'staff'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.client.user.update).not.toHaveBeenCalled();
    });

    it('treats an admin-role membership as not-found — never manageable via this endpoint', async () => {
      prisma.client.homeMembership.findUnique.mockResolvedValue({
        role: 'admin',
        user: { id: 'user-30', email: 'admin@evergreen.test' },
      });

      await expect(
        usersService.updateUserRole('actor-1', 'home-1', 'user-30', 'staff'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('promotes family to staff and updates both User.role and HomeMembership.role (AC #2)', async () => {
      prisma.client.homeMembership.findUnique.mockResolvedValue(
        targetMembership,
      );
      prisma.client.homeMembership.count.mockResolvedValue(1);

      const result = await usersService.updateUserRole(
        'actor-1',
        'home-1',
        'user-20',
        'staff',
      );

      expect(tenantContext.runBypassed).toHaveBeenCalled();
      expect(prisma.client.homeMembership.count).toHaveBeenCalledWith({
        where: { userId: 'user-20' },
      });
      expect(prisma.client.user.update).toHaveBeenCalledWith({
        where: { id: 'user-20' },
        data: { role: 'staff' },
      });
      expect(prisma.client.homeMembership.update).toHaveBeenCalledWith({
        where: { userId_homeId: { userId: 'user-20', homeId: 'home-1' } },
        data: { role: 'staff' },
      });
      expect(result.role).toBe('staff');
    });

    it('rejects promoting a user linked to more than one home to staff (breaks the single-home invariant)', async () => {
      prisma.client.homeMembership.findUnique.mockResolvedValue(
        targetMembership,
      );
      prisma.client.homeMembership.count.mockResolvedValue(2);

      await expect(
        usersService.updateUserRole('actor-1', 'home-1', 'user-20', 'staff'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.client.user.update).not.toHaveBeenCalled();
      expect(prisma.client.homeMembership.update).not.toHaveBeenCalled();
    });

    it('demotes staff to family without checking membership count — single-home is already guaranteed', async () => {
      prisma.client.homeMembership.findUnique.mockResolvedValue({
        role: 'staff',
        user: {
          id: 'user-21',
          email: 'staff@evergreen.test',
          name: null,
          isActive: true,
        },
      });

      await usersService.updateUserRole(
        'actor-1',
        'home-1',
        'user-21',
        'family',
      );

      expect(prisma.client.homeMembership.count).not.toHaveBeenCalled();
      expect(prisma.client.user.update).toHaveBeenCalledWith({
        where: { id: 'user-21' },
        data: { role: 'family' },
      });
    });

    it('rolls back User.role when the HomeMembership.update fails, and maps a concurrent-delete race (P2025) to 404 (code-review finding)', async () => {
      prisma.client.homeMembership.findUnique.mockResolvedValue({
        role: 'staff',
        user: {
          id: 'user-22',
          email: 'staff@evergreen.test',
          name: null,
          isActive: true,
        },
      });
      prisma.client.homeMembership.update.mockRejectedValue(
        recordNotFoundViolation,
      );

      await expect(
        usersService.updateUserRole('actor-1', 'home-1', 'user-22', 'family'),
      ).rejects.toBeInstanceOf(NotFoundException);

      // First call sets the new role, second call (the rollback) restores
      // the pre-change role read from the membership lookup.
      expect(prisma.client.user.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'user-22' },
        data: { role: 'family' },
      });
      expect(prisma.client.user.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'user-22' },
        data: { role: 'staff' },
      });
    });

    it('rolls back User.role and rethrows the original error unmapped for a non-P2025 failure', async () => {
      prisma.client.homeMembership.findUnique.mockResolvedValue(
        targetMembership,
      );
      const transientError = new Error('connection reset');
      prisma.client.homeMembership.update.mockRejectedValue(transientError);

      await expect(
        usersService.updateUserRole('actor-1', 'home-1', 'user-20', 'staff'),
      ).rejects.toBe(transientError);

      expect(prisma.client.user.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'user-20' },
        data: { role: 'family' }, // rolled back to the pre-change role
      });
    });

    it('reports to Sentry (without losing the original error) when the User.role rollback itself fails', async () => {
      prisma.client.homeMembership.findUnique.mockResolvedValue(
        targetMembership,
      );
      const membershipError = new Error('membership update failed');
      prisma.client.homeMembership.update.mockRejectedValue(membershipError);
      const rollbackError = new Error('rollback also failed');
      prisma.client.user.update.mockImplementationOnce(() =>
        Promise.resolve({}),
      );
      prisma.client.user.update.mockImplementationOnce(() =>
        Promise.reject(rollbackError),
      );

      await expect(
        usersService.updateUserRole('actor-1', 'home-1', 'user-20', 'staff'),
      ).rejects.toBe(membershipError);

      expect(Sentry.captureException).toHaveBeenCalledWith(rollbackError);
    });
  });

  describe('revokeAccess', () => {
    it('rejects a home admin revoking their own access (self-lockout)', async () => {
      await expect(
        usersService.revokeAccess('user-40', 'home-1', 'user-40'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.client.homeMembership.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a target outside the caller home or with a non-manageable role with 404', async () => {
      prisma.client.homeMembership.findUnique.mockResolvedValue(null);

      await expect(
        usersService.revokeAccess('actor-1', 'home-1', 'user-99'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.client.homeMembership.delete).not.toHaveBeenCalled();
    });

    it('deletes the HomeMembership and deactivates the user when it was their last one (AC #5)', async () => {
      prisma.client.homeMembership.findUnique.mockResolvedValue({
        role: 'staff',
      });
      prisma.client.homeMembership.count.mockResolvedValue(0);

      await usersService.revokeAccess('actor-1', 'home-1', 'user-41');

      expect(prisma.client.homeMembership.delete).toHaveBeenCalledWith({
        where: { userId_homeId: { userId: 'user-41', homeId: 'home-1' } },
      });
      expect(tenantContext.runBypassed).toHaveBeenCalled();
      expect(prisma.client.user.update).toHaveBeenCalledWith({
        where: { id: 'user-41' },
        data: { isActive: false, revokedAt: expect.any(Date) as Date },
      });
    });

    it('deletes the HomeMembership but leaves the user active when they still belong to another home', async () => {
      prisma.client.homeMembership.findUnique.mockResolvedValue({
        role: 'family',
      });
      prisma.client.homeMembership.count.mockResolvedValue(1);

      await usersService.revokeAccess('actor-1', 'home-1', 'user-42');

      expect(prisma.client.homeMembership.delete).toHaveBeenCalled();
      expect(prisma.client.user.update).not.toHaveBeenCalled();
    });

    it('maps a concurrent second revoke of the same membership (P2025) to 404 instead of a raw 500 (code-review finding)', async () => {
      prisma.client.homeMembership.findUnique.mockResolvedValue({
        role: 'staff',
      });
      prisma.client.homeMembership.delete.mockRejectedValue(
        recordNotFoundViolation,
      );

      await expect(
        usersService.revokeAccess('actor-1', 'home-1', 'user-41'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.client.user.update).not.toHaveBeenCalled();
    });

    it('reports to Sentry and rethrows (not swallows) when the trailing deactivation check fails after the delete already committed', async () => {
      prisma.client.homeMembership.findUnique.mockResolvedValue({
        role: 'staff',
      });
      const countError = new Error('count query failed');
      prisma.client.homeMembership.count.mockRejectedValue(countError);

      await expect(
        usersService.revokeAccess('actor-1', 'home-1', 'user-41'),
      ).rejects.toBe(countError);

      // The membership delete itself is not retried/rolled back — it
      // already committed the revocation the caller asked for.
      expect(prisma.client.homeMembership.delete).toHaveBeenCalledTimes(1);
      expect(Sentry.captureException).toHaveBeenCalledWith(countError);
    });
  });
});
