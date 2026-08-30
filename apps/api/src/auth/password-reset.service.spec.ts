import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from '../notifications/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordResetService } from './password-reset.service';
import { PasswordService } from './password.service';

describe('PasswordResetService', () => {
  let service: PasswordResetService;
  let prisma: {
    client: {
      user: { findUnique: jest.Mock; updateMany: jest.Mock };
      passwordResetToken: {
        findFirst: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
        updateMany: jest.Mock;
      };
      $transaction: jest.Mock;
    };
  };
  let passwordService: { hash: jest.Mock };
  let mailService: { sendPasswordResetEmail: jest.Mock };

  const activeUser = {
    id: 'user-1',
    email: 'staff@evergreen.test',
    passwordHash: 'hashed',
    role: 'staff' as const,
    isActive: true,
    revokedAt: null,
  };

  const pendingUser = {
    id: 'user-2',
    email: 'invited@evergreen.test',
    passwordHash: null,
    role: 'staff' as const,
    isActive: false,
    revokedAt: null,
  };

  // Revoked one hour ago — a token created before that instant is stale
  // (the vulnerability this guard closes); one created after is fresh (e.g.
  // issued by a legitimate re-invite) and must still work.
  const revokedAt = new Date(Date.now() - 60 * 60 * 1000);

  const revokedUser = {
    ...activeUser,
    id: 'user-3',
    isActive: false,
    revokedAt,
  };

  // Same revoked state, but with no revokedAt on record — models a row
  // revoked before this column existed. No token can be proven to have
  // been issued after an unknown revocation, so the guard defaults to
  // reject (the safe side).
  const revokedUserNoTimestamp = {
    ...activeUser,
    id: 'user-4',
    isActive: false,
    revokedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      client: {
        user: { findUnique: jest.fn(), updateMany: jest.fn() },
        passwordResetToken: {
          findFirst: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
        },
        // Runs the callback against the same mocked client — good enough
        // for unit tests, which only assert which model methods were
        // called with what args, not real transactional isolation.
        $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
          fn(prisma.client),
        ),
      },
    };
    passwordService = { hash: jest.fn() };
    mailService = { sendPasswordResetEmail: jest.fn() };
    // Default: both atomic claims succeed (one row affected). Individual
    // tests override with mockResolvedValueOnce to simulate a concurrent
    // claim, or a TOCTOU revoke racing the user reactivation.
    prisma.client.passwordResetToken.updateMany.mockResolvedValue({
      count: 1,
    });
    prisma.client.user.updateMany.mockResolvedValue({ count: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordResetService,
        { provide: PrismaService, useValue: prisma },
        { provide: PasswordService, useValue: passwordService },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    service = module.get(PasswordResetService);
    mailService.sendPasswordResetEmail.mockResolvedValue(undefined);
  });

  describe('requestReset', () => {
    it('creates a token and emails an existing active user', async () => {
      prisma.client.user.findUnique.mockResolvedValue(activeUser);

      await expect(
        service.requestReset(activeUser.email),
      ).resolves.toBeUndefined();

      expect(prisma.client.passwordResetToken.create).toHaveBeenCalledTimes(1);
      const [createArgs] = prisma.client.passwordResetToken.create.mock
        .calls[0] as [
        { data: { userId: string; tokenHash: string; expiresAt: Date } },
      ];
      expect(createArgs.data.userId).toBe(activeUser.id);
      expect(typeof createArgs.data.tokenHash).toBe('string');
      expect(createArgs.data.tokenHash).toHaveLength(64); // sha256 hex
      expect(createArgs.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(createArgs.data.expiresAt.getTime()).toBeLessThanOrEqual(
        Date.now() + 60 * 60 * 1000 + 1000,
      );

      expect(mailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
      const [emailArg, rawTokenArg] = mailService.sendPasswordResetEmail.mock
        .calls[0] as [string, string];
      expect(emailArg).toBe(activeUser.email);
      expect(typeof rawTokenArg).toBe('string');
      expect(rawTokenArg.length).toBeGreaterThan(0);
    });

    it('silently no-ops for an unknown email — no token, no email', async () => {
      prisma.client.user.findUnique.mockResolvedValue(null);

      await expect(
        service.requestReset('nobody@evergreen.test'),
      ).resolves.toBeUndefined();

      expect(prisma.client.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('creates a token and emails a pending (invited) user — the activation path', async () => {
      prisma.client.user.findUnique.mockResolvedValue(pendingUser);

      await service.requestReset(pendingUser.email);

      expect(prisma.client.passwordResetToken.create).toHaveBeenCalledTimes(1);
      expect(mailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        pendingUser.email,
        expect.any(String),
      );
    });

    it('normalizes email casing/whitespace before lookup', async () => {
      prisma.client.user.findUnique.mockResolvedValue(null);

      await service.requestReset('  STAFF@Evergreen.test ');

      expect(prisma.client.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'staff@evergreen.test' },
      });
    });

    it('never lets a rejected mail send become an unhandled rejection', async () => {
      prisma.client.user.findUnique.mockResolvedValue(activeUser);
      mailService.sendPasswordResetEmail.mockRejectedValue(
        new Error('mail service exploded'),
      );

      await expect(
        service.requestReset(activeUser.email),
      ).resolves.toBeUndefined();
    });
  });

  describe('confirmReset', () => {
    const matchedToken = {
      id: 'token-1',
      userId: activeUser.id,
      tokenHash: 'irrelevant-in-mock',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 5 * 60 * 1000),
    };

    it('sets the new password, activates the account, and marks the token used', async () => {
      prisma.client.passwordResetToken.findFirst.mockResolvedValue(
        matchedToken,
      );
      prisma.client.user.findUnique.mockResolvedValue(activeUser);
      passwordService.hash.mockResolvedValue('new-hashed-password');

      await expect(
        service.confirmReset('raw-token', 'a-new-password'),
      ).resolves.toBeUndefined();

      // The pre-check lookup filters by expiry/single-use too (cheap fail
      // fast), but it is NOT what enforces single-use — see the claim
      // assertion below.
      const [lookupArgs] = prisma.client.passwordResetToken.findFirst.mock
        .calls[0] as [{ where: { usedAt: null; expiresAt: { gt: Date } } }];
      expect(lookupArgs.where.usedAt).toBeNull();
      expect(lookupArgs.where.expiresAt.gt).toBeInstanceOf(Date);

      const anyDate = expect.any(Date) as Date;

      // The actual single-use guard: claiming the token is a conditional
      // updateMany (usedAt: null in the WHERE), atomic against a concurrent
      // confirmReset racing on the same token.
      const updateManyCalls = prisma.client.passwordResetToken.updateMany.mock
        .calls as [{ where: Record<string, unknown>; data: unknown }][];
      expect(updateManyCalls[0][0]).toEqual({
        where: {
          id: matchedToken.id,
          usedAt: null,
          expiresAt: { gt: anyDate },
        },
        data: { usedAt: anyDate },
      });

      // Reactivation is also a conditional updateMany — re-verifies the
      // guard atomically at commit time (TOCTOU protection), mirroring the
      // token claim above.
      expect(prisma.client.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: activeUser.id,
          OR: [
            { passwordHash: null },
            { isActive: true },
            { revokedAt: { lte: matchedToken.createdAt } },
          ],
        },
        data: {
          passwordHash: 'new-hashed-password',
          isActive: true,
          revokedAt: null,
        },
      });

      // Second updateMany call invalidates the user's other outstanding
      // tokens.
      expect(updateManyCalls[1][0]).toEqual({
        where: {
          userId: activeUser.id,
          id: { not: matchedToken.id },
          usedAt: null,
          expiresAt: { gt: anyDate },
        },
        data: { usedAt: anyDate },
      });
    });

    it('rejects instead of reusing a token already claimed by a concurrent confirm', async () => {
      // Simulates the exact race this atomic claim closes: two confirmReset
      // calls both pass the initial findFirst pre-check (e.g. one raced
      // ahead while the other was awaiting bcrypt), but only one can win the
      // conditional updateMany claim — the loser's claim affects 0 rows.
      prisma.client.passwordResetToken.findFirst.mockResolvedValue(
        matchedToken,
      );
      prisma.client.user.findUnique.mockResolvedValue(activeUser);
      passwordService.hash.mockResolvedValue('new-hashed-password');
      prisma.client.passwordResetToken.updateMany.mockResolvedValueOnce({
        count: 0,
      });

      await expect(
        service.confirmReset('raw-token', 'a-new-password'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.client.user.updateMany).not.toHaveBeenCalled();
      // The loser must not proceed to invalidate other tokens either — the
      // claim call was its only updateMany invocation.
      expect(prisma.client.passwordResetToken.updateMany).toHaveBeenCalledTimes(
        1,
      );
    });

    it('aborts reactivation if the account is revoked between the pre-check and the transaction commit (TOCTOU)', async () => {
      // Pre-check sees a pending, never-activated account — passes. Models
      // an admin revoking access in the window between that read and the
      // transaction's commit (e.g. while this call was awaiting bcrypt) via
      // the same atomic-updateMany pattern the token claim already uses:
      // the conditional reactivation update affects 0 rows.
      prisma.client.passwordResetToken.findFirst.mockResolvedValue({
        ...matchedToken,
        userId: pendingUser.id,
      });
      prisma.client.user.findUnique.mockResolvedValue(pendingUser);
      passwordService.hash.mockResolvedValue('new-hashed-password');
      prisma.client.user.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.confirmReset('raw-token', 'a-new-password'),
      ).rejects.toBeInstanceOf(BadRequestException);

      // Aborted before invalidating the user's other outstanding tokens —
      // the token claim was this call's only other DB write.
      expect(prisma.client.passwordResetToken.updateMany).toHaveBeenCalledTimes(
        1,
      );
    });

    it('activates a pending account on confirm — it can log in afterwards', async () => {
      prisma.client.passwordResetToken.findFirst.mockResolvedValue({
        ...matchedToken,
        userId: pendingUser.id,
      });
      prisma.client.user.findUnique.mockResolvedValue(pendingUser);
      passwordService.hash.mockResolvedValue('new-hashed-password');

      await service.confirmReset('raw-token', 'a-new-password');

      expect(prisma.client.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: pendingUser.id,
          OR: [
            { passwordHash: null },
            { isActive: true },
            { revokedAt: { lte: matchedToken.createdAt } },
          ],
        },
        data: {
          passwordHash: 'new-hashed-password',
          isActive: true,
          revokedAt: null,
        },
      });
    });

    it('rejects a stale reset attempt for a revoked account — token issued before the revocation — without reactivating it', async () => {
      prisma.client.passwordResetToken.findFirst.mockResolvedValue({
        ...matchedToken,
        userId: revokedUser.id,
        createdAt: new Date(revokedAt.getTime() - 60 * 60 * 1000), // 1h before revoke
      });
      prisma.client.user.findUnique.mockResolvedValue(revokedUser);
      passwordService.hash.mockResolvedValue('new-hashed-password');

      await expect(
        service.confirmReset('raw-token', 'a-new-password'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.client.user.updateMany).not.toHaveBeenCalled();
      // Rejected before the token-claiming transaction — the token is left
      // untouched, not marked used (AC #4).
      expect(
        prisma.client.passwordResetToken.updateMany,
      ).not.toHaveBeenCalled();
      // Timing side-channel mitigation: still pays the bcrypt cost before
      // rejecting, so this path takes about as long as the success path.
      expect(passwordService.hash).toHaveBeenCalledWith('a-new-password');
    });

    it('accepts a fresh reset attempt for a revoked account — token issued after the revocation, e.g. by a legitimate re-invite — and reactivates it', async () => {
      const freshTokenCreatedAt = new Date(revokedAt.getTime() + 60 * 1000); // 1min after revoke
      prisma.client.passwordResetToken.findFirst.mockResolvedValue({
        ...matchedToken,
        userId: revokedUser.id,
        createdAt: freshTokenCreatedAt,
      });
      prisma.client.user.findUnique.mockResolvedValue(revokedUser);
      passwordService.hash.mockResolvedValue('new-hashed-password');

      await expect(
        service.confirmReset('raw-token', 'a-new-password'),
      ).resolves.toBeUndefined();

      expect(prisma.client.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: revokedUser.id,
          OR: [
            { passwordHash: null },
            { isActive: true },
            { revokedAt: { lte: freshTokenCreatedAt } },
          ],
        },
        data: {
          passwordHash: 'new-hashed-password',
          isActive: true,
          revokedAt: null,
        },
      });
    });

    it('rejects a revoked account with no revokedAt on record (legacy row), regardless of token age', async () => {
      prisma.client.passwordResetToken.findFirst.mockResolvedValue({
        ...matchedToken,
        userId: revokedUserNoTimestamp.id,
      });
      prisma.client.user.findUnique.mockResolvedValue(revokedUserNoTimestamp);
      passwordService.hash.mockResolvedValue('new-hashed-password');

      await expect(
        service.confirmReset('raw-token', 'a-new-password'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.client.user.updateMany).not.toHaveBeenCalled();
      expect(
        prisma.client.passwordResetToken.updateMany,
      ).not.toHaveBeenCalled();
      expect(passwordService.hash).toHaveBeenCalledWith('a-new-password');
    });

    it('rejects when the token references a user row that no longer exists, without paying the timing-mitigation cost', async () => {
      // FK-backed (PasswordResetToken.userId references User with
      // onDelete: Cascade) — near-impossible in practice, but the guard has
      // a defensive `!user` branch that should still reject cleanly. Unlike
      // the revoked-account case, there's no revoked-vs-active status to
      // hide here, so no dummy hash is needed.
      prisma.client.passwordResetToken.findFirst.mockResolvedValue(
        matchedToken,
      );
      prisma.client.user.findUnique.mockResolvedValue(null);

      await expect(
        service.confirmReset('raw-token', 'a-new-password'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(passwordService.hash).not.toHaveBeenCalled();
      expect(prisma.client.user.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an expired token with the generic invalid-or-expired message', async () => {
      // The where-clause filter (expiresAt > now) means an expired row
      // simply doesn't come back from the query.
      prisma.client.passwordResetToken.findFirst.mockResolvedValue(null);

      await expect(
        service.confirmReset('expired-token', 'a-new-password'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.client.user.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an already-used token with the same generic message (no oracle)', async () => {
      prisma.client.passwordResetToken.findFirst.mockResolvedValue(null);

      const expiredCall = service.confirmReset(
        'expired-token',
        'a-new-password',
      );
      const usedCall = service.confirmReset('used-token', 'a-new-password');

      const [expiredError, usedError] = await Promise.all([
        expiredCall.catch((e: unknown) => e),
        usedCall.catch((e: unknown) => e),
      ]);
      expect(expiredError).toBeInstanceOf(BadRequestException);
      expect(usedError).toBeInstanceOf(BadRequestException);
      expect((expiredError as BadRequestException).message).toBe(
        (usedError as BadRequestException).message,
      );
    });

    it('rejects an unknown/malformed token with the same generic message', async () => {
      prisma.client.passwordResetToken.findFirst.mockResolvedValue(null);

      await expect(
        service.confirmReset('not-a-real-token', 'a-new-password'),
      ).rejects.toThrow(
        'This link is invalid or has expired. Please request a new one.',
      );
    });
  });
});
