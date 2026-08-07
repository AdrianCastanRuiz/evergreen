import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../../generated/prisma';
import { PasswordResetService } from '../auth/password-reset.service';
import { MailService } from '../notifications/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let usersService: UsersService;
  let prisma: {
    client: {
      user: { create: jest.Mock; delete: jest.Mock };
      homeMembership: { create: jest.Mock };
    };
  };
  let passwordResetService: { issueActivationToken: jest.Mock };
  let mailService: { sendAccountInviteEmail: jest.Mock };

  const pendingUser = {
    id: 'user-1',
    email: 'admin@evergreen.test',
    role: 'admin' as const,
    isActive: false,
  };

  const uniqueViolation = new Prisma.PrismaClientKnownRequestError('conflict', {
    code: 'P2002',
    clientVersion: 'test',
  });

  beforeEach(async () => {
    prisma = {
      client: {
        user: { create: jest.fn(), delete: jest.fn() },
        homeMembership: { create: jest.fn() },
      },
    };
    passwordResetService = { issueActivationToken: jest.fn() };
    mailService = {
      sendAccountInviteEmail: jest.fn().mockResolvedValue(undefined),
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
  });
});
