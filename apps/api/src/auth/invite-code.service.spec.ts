import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { InviteCodeService } from './invite-code.service';
import { PasswordService } from './password.service';

describe('InviteCodeService', () => {
  let service: InviteCodeService;
  let prisma: {
    client: {
      homeMembership: {
        update: jest.Mock;
        findFirst: jest.Mock;
        updateMany: jest.Mock;
      };
      user: { update: jest.Mock };
      $transaction: jest.Mock;
    };
  };
  let passwordService: { hash: jest.Mock };
  let tenantContext: { runBypassed: jest.Mock };

  const pendingFamilyMembership = {
    id: 'membership-1',
    userId: 'user-1',
    role: 'family' as const,
    user: { id: 'user-1', isActive: false },
  };

  beforeEach(async () => {
    prisma = {
      client: {
        homeMembership: {
          update: jest.fn(),
          findFirst: jest.fn(),
          updateMany: jest.fn(),
        },
        user: { update: jest.fn() },
        // Runs the callback against the same mocked client — enough for
        // unit tests, which only assert which model methods were called.
        $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
          fn(prisma.client),
        ),
      },
    };
    passwordService = { hash: jest.fn() };
    // Default: the atomic single-use claim succeeds (one row affected).
    prisma.client.homeMembership.updateMany.mockResolvedValue({ count: 1 });
    prisma.client.homeMembership.update.mockResolvedValue({});
    // runBypassed just runs the callback against the mocked client — the mock
    // Prisma client isn't RLS-aware, so there's no bypass branch to exercise;
    // only that the service resolves its tenant-scoped work through it.
    tenantContext = {
      runBypassed: jest.fn((fn: () => unknown) => fn()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InviteCodeService,
        { provide: PrismaService, useValue: prisma },
        { provide: PasswordService, useValue: passwordService },
        { provide: TenantContextService, useValue: tenantContext },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(InviteCodeService);
  });

  describe('generateForMembership', () => {
    it('persists only the hash + expiry + usedAt:null and returns the raw code', async () => {
      const raw = await service.generateForMembership('membership-1');

      expect(typeof raw).toBe('string');
      expect(raw).toHaveLength(10);
      expect(prisma.client.homeMembership.update).toHaveBeenCalledTimes(1);

      const [arg0] = prisma.client.homeMembership.update.mock.calls[0] as [
        {
          where: { id: string };
          data: {
            inviteCodeHash: string;
            inviteCodeExpiresAt: Date;
            inviteCodeUsedAt: null;
          };
        },
      ];
      expect(arg0.where).toEqual({ id: 'membership-1' });
      // Hash is opaque sha256 hex, never equal to the raw code.
      expect(arg0.data.inviteCodeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(arg0.data.inviteCodeHash).not.toBe(raw);
      expect(arg0.data.inviteCodeExpiresAt.getTime()).toBeGreaterThan(
        Date.now(),
      );
      expect(arg0.data.inviteCodeUsedAt).toBeNull();
    });
  });

  describe('resolveInviteCode', () => {
    it('sets the password, activates the account, and claims the code once (happy path)', async () => {
      prisma.client.homeMembership.findFirst.mockResolvedValue(
        pendingFamilyMembership,
      );
      passwordService.hash.mockResolvedValue('hashed-password');

      await expect(
        service.resolveInviteCode('ABCDEFGHJK', 'new-password-123'),
      ).resolves.toBeUndefined();

      expect(passwordService.hash).toHaveBeenCalledWith('new-password-123');
      // Atomic claim keyed on usedAt:null + unexpired.
      const [claimArg] = prisma.client.homeMembership.updateMany.mock
        .calls[0] as [{ where: object; data: { inviteCodeUsedAt: Date } }];
      expect(claimArg.where).toMatchObject({
        id: 'membership-1',
        inviteCodeUsedAt: null,
      });
      expect(claimArg.data.inviteCodeUsedAt).toBeInstanceOf(Date);
      expect(prisma.client.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: 'hashed-password', isActive: true },
      });
    });

    it('rejects an unknown/expired/used code with one generic message (no oracle)', async () => {
      prisma.client.homeMembership.findFirst.mockResolvedValue(null);

      await expect(
        service.resolveInviteCode('ABCDEFGHJK', 'new-password-123'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(passwordService.hash).not.toHaveBeenCalled();
      expect(prisma.client.user.update).not.toHaveBeenCalled();
    });

    it('rejects a code whose membership is not a pending family one (defensive)', async () => {
      prisma.client.homeMembership.findFirst.mockResolvedValue({
        ...pendingFamilyMembership,
        role: 'staff',
      });

      await expect(
        service.resolveInviteCode('ABCDEFGHJK', 'new-password-123'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.client.user.update).not.toHaveBeenCalled();
    });

    it('does not resolve an already-active family membership through the code', async () => {
      prisma.client.homeMembership.findFirst.mockResolvedValue({
        ...pendingFamilyMembership,
        user: { id: 'user-1', isActive: true },
      });

      await expect(
        service.resolveInviteCode('ABCDEFGHJK', 'new-password-123'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.client.user.update).not.toHaveBeenCalled();
    });

    it('is single-use — a concurrent resolution that already claimed the code fails (atomic guard)', async () => {
      prisma.client.homeMembership.findFirst.mockResolvedValue(
        pendingFamilyMembership,
      );
      passwordService.hash.mockResolvedValue('hashed-password');
      prisma.client.homeMembership.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.resolveInviteCode('ABCDEFGHJK', 'new-password-123'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.client.user.update).not.toHaveBeenCalled();
    });
  });
});
