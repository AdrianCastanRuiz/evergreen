import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

describe('AuthService', () => {
  let authService: AuthService;
  let tenantContext: TenantContextService;
  let prisma: {
    client: {
      user: { findUnique: jest.Mock };
      homeMembership: { findFirst: jest.Mock };
    };
  };
  let jwtService: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let passwordService: { compare: jest.Mock };

  const activeUser = {
    id: 'user-1',
    email: 'staff@evergreen.test',
    passwordHash: 'hashed',
    role: 'staff' as const,
    isActive: true,
  };

  // Every real call into AuthService happens inside the ALS context
  // TenantContextMiddleware establishes for the whole request — including
  // @Public() routes like login/refresh, which still get an (empty)
  // context. runBypassed() requires that context to exist, so tests must
  // simulate it the same way.
  function withRequestContext<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { userId: null, role: null, homeId: null, bypass: false },
      fn,
    );
  }

  beforeEach(async () => {
    prisma = {
      client: {
        user: { findUnique: jest.fn() },
        homeMembership: { findFirst: jest.fn() },
      },
    };
    jwtService = { signAsync: jest.fn(), verifyAsync: jest.fn() };
    passwordService = { compare: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: TenantContextService, useClass: TenantContextService },
        { provide: PasswordService, useValue: passwordService },
      ],
    }).compile();

    authService = module.get(AuthService);
    tenantContext = module.get(TenantContextService);
    jwtService.signAsync.mockImplementation(
      (payload: Record<string, unknown>) => `token:${JSON.stringify(payload)}`,
    );
  });

  describe('login', () => {
    it('rejects an unknown email without revealing which check failed', async () => {
      prisma.client.user.findUnique.mockResolvedValue(null);

      await expect(
        withRequestContext(() =>
          authService.login('nobody@evergreen.test', 'irrelevant'),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a pending account (no passwordHash yet)', async () => {
      prisma.client.user.findUnique.mockResolvedValue({
        ...activeUser,
        passwordHash: null,
      });

      await expect(
        withRequestContext(() =>
          authService.login(activeUser.email, 'irrelevant'),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('still runs a bcrypt compare for an unknown email (timing-attack mitigation)', async () => {
      prisma.client.user.findUnique.mockResolvedValue(null);

      await expect(
        withRequestContext(() =>
          authService.login('nobody@evergreen.test', 'irrelevant'),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(passwordService.compare).toHaveBeenCalledTimes(1);
    });

    it('normalizes email casing/whitespace before lookup', async () => {
      prisma.client.user.findUnique.mockResolvedValue(null);

      await expect(
        withRequestContext(() =>
          authService.login('  STAFF@Evergreen.test ', 'irrelevant'),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.client.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'staff@evergreen.test' },
      });
    });

    it('rejects a staff/admin account with no HomeMembership instead of issuing a broken token', async () => {
      prisma.client.user.findUnique.mockResolvedValue(activeUser);
      passwordService.compare.mockResolvedValue(true);
      prisma.client.homeMembership.findFirst.mockResolvedValue(null);

      await expect(
        withRequestContext(() =>
          authService.login(activeUser.email, 'correct'),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a wrong password', async () => {
      prisma.client.user.findUnique.mockResolvedValue(activeUser);
      passwordService.compare.mockResolvedValue(false);

      await expect(
        withRequestContext(() => authService.login(activeUser.email, 'wrong')),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('issues an access+refresh pair with the staff member fixed homeId on success', async () => {
      prisma.client.user.findUnique.mockResolvedValue(activeUser);
      passwordService.compare.mockResolvedValue(true);
      prisma.client.homeMembership.findFirst.mockResolvedValue({
        homeId: 'home-1',
      });

      const tokens = await withRequestContext(() =>
        authService.login(activeUser.email, 'correct'),
      );

      expect(tokens.accessToken).toContain('"homeId":"home-1"');
      expect(tokens.accessToken).toContain('"type":"access"');
      expect(tokens.refreshToken).toContain('"type":"refresh"');
    });

    it('never bakes a homeId into a family member access token', async () => {
      prisma.client.user.findUnique.mockResolvedValue({
        ...activeUser,
        role: 'family',
      });
      passwordService.compare.mockResolvedValue(true);

      const tokens = await withRequestContext(() =>
        authService.login(activeUser.email, 'correct'),
      );

      expect(tokens.accessToken).not.toContain('homeId');
    });
  });

  describe('refresh', () => {
    it('rejects a token that fails verification', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('expired'));

      await expect(
        withRequestContext(() => authService.refresh('bad-token')),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an access token presented as a refresh token', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: activeUser.id,
        type: 'access',
      });

      await expect(
        withRequestContext(() => authService.refresh('access-token')),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('issues a fresh pair for a valid refresh token', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: activeUser.id,
        type: 'refresh',
      });
      prisma.client.user.findUnique.mockResolvedValue(activeUser);
      prisma.client.homeMembership.findFirst.mockResolvedValue({
        homeId: 'home-1',
      });

      const tokens = await withRequestContext(() =>
        authService.refresh('valid-refresh-token'),
      );

      expect(tokens.accessToken).toContain('"sub":"user-1"');
    });
  });
});
