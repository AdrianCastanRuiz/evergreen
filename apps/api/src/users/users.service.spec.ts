import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as Sentry from '@sentry/nestjs';
import { Prisma } from '../../generated/prisma';
import { PasswordResetService } from '../auth/password-reset.service';
import { MailService } from '../notifications/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));

describe('UsersService', () => {
  let usersService: UsersService;
  let prisma: {
    client: {
      user: { create: jest.Mock; delete: jest.Mock; findUnique: jest.Mock };
      homeMembership: {
        create: jest.Mock;
        findUnique: jest.Mock;
        delete: jest.Mock;
      };
    };
  };
  let passwordResetService: { issueActivationToken: jest.Mock };
  let mailService: {
    sendAccountInviteEmail: jest.Mock;
    sendSuperAdminInviteEmail: jest.Mock;
    sendHomeAccessAddedEmail: jest.Mock;
  };

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

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = {
      client: {
        user: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
        homeMembership: {
          create: jest.fn(),
          findUnique: jest.fn(),
          delete: jest.fn(),
        },
      },
    };
    passwordResetService = { issueActivationToken: jest.fn() };
    mailService = {
      sendAccountInviteEmail: jest.fn().mockResolvedValue(undefined),
      sendSuperAdminInviteEmail: jest.fn().mockResolvedValue(undefined),
      sendHomeAccessAddedEmail: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: PasswordResetService, useValue: passwordResetService },
        { provide: MailService, useValue: mailService },
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
        data: { email: 'admin@evergreen.test', role: 'admin', isActive: false },
        select: { id: true, email: true, role: true, isActive: true },
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
        },
        select: { id: true, email: true, role: true, isActive: true },
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
        select: { id: true, email: true, role: true, isActive: true },
      });
      expect(prisma.client.user.create).toHaveBeenCalledWith({
        data: { email: 'staff@evergreen.test', role: 'staff', isActive: false },
        select: { id: true, email: true, role: true, isActive: true },
      });
      expect(prisma.client.homeMembership.create).toHaveBeenCalledWith({
        data: { userId: 'user-3', homeId: 'home-1', role: 'staff' },
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

    it('creates a pending family User and a HomeMembership (AC #3)', async () => {
      prisma.client.user.findUnique.mockResolvedValue(null);
      prisma.client.user.create.mockResolvedValue(pendingFamily);
      passwordResetService.issueActivationToken.mockResolvedValue('raw-token');

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
        },
        select: { id: true, email: true, role: true, isActive: true },
      });
      expect(prisma.client.homeMembership.create).toHaveBeenCalledWith({
        data: { userId: 'user-4', homeId: 'home-1', role: 'family' },
      });
      expect(result).toEqual({ ...pendingFamily, homeId: 'home-1' });
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
        select: { id: true, email: true, role: true, isActive: true },
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
});
