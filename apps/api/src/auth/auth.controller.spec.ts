import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { InviteCodeService } from './invite-code.service';
import { PasswordResetService } from './password-reset.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { login: jest.Mock; refresh: jest.Mock };
  let res: { cookie: jest.Mock; clearCookie: jest.Mock };
  let tenantContext: { getUserId: jest.Mock; getHomeId: jest.Mock };
  let prisma: {
    client: { user: { update: jest.Mock }; home: { findUnique: jest.Mock } };
  };

  const tokens = { accessToken: 'access-1', refreshToken: 'refresh-1' };
  const rotatedTokens = { accessToken: 'access-2', refreshToken: 'refresh-2' };

  beforeEach(async () => {
    authService = { login: jest.fn(), refresh: jest.fn() };
    res = { cookie: jest.fn(), clearCookie: jest.fn() };
    tenantContext = { getUserId: jest.fn(), getHomeId: jest.fn() };
    prisma = {
      client: { user: { update: jest.fn() }, home: { findUnique: jest.fn() } },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: TenantContextService, useValue: tenantContext },
        { provide: PrismaService, useValue: prisma },
        { provide: PasswordResetService, useValue: {} },
        {
          provide: InviteCodeService,
          useValue: { resolveInviteCode: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(AuthController);
  });

  describe('login', () => {
    it('returns the unchanged token pair AND sets an httpOnly refresh_token cookie scoped to /auth', async () => {
      authService.login.mockResolvedValue(tokens);

      const result = await controller.login(
        { email: 'a@b.com', password: 'pw' },
        res as unknown as Response,
      );

      expect(result).toEqual(tokens);
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        tokens.refreshToken,
        expect.objectContaining({
          httpOnly: true,
          secure: true,
          sameSite: 'none',
          path: '/auth',
          maxAge: expect.any(Number) as number,
        }),
      );
    });
  });

  describe('refresh', () => {
    function withCookies(cookies: Record<string, string> | undefined): Request {
      return { cookies } as unknown as Request;
    }

    it('accepts a body-only refresh token (mobile) and re-sets the cookie with the rotated token', async () => {
      authService.refresh.mockResolvedValue(rotatedTokens);

      const result = await controller.refresh(
        { refreshToken: 'mobile-refresh' },
        withCookies(undefined),
        res as unknown as Response,
      );

      expect(authService.refresh).toHaveBeenCalledWith('mobile-refresh');
      expect(result).toEqual(rotatedTokens);
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        rotatedTokens.refreshToken,
        expect.objectContaining({ httpOnly: true, path: '/auth' }),
      );
    });

    it('accepts a cookie-only refresh token (apps/admin) when the body has none', async () => {
      authService.refresh.mockResolvedValue(rotatedTokens);

      const result = await controller.refresh(
        {},
        withCookies({ refresh_token: 'cookie-refresh' }),
        res as unknown as Response,
      );

      expect(authService.refresh).toHaveBeenCalledWith('cookie-refresh');
      expect(result).toEqual(rotatedTokens);
    });

    it('rejects with 401 before calling the service when neither body nor cookie carries a token', async () => {
      await expect(
        controller.refresh(
          {},
          withCookies(undefined),
          res as unknown as Response,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(authService.refresh).not.toHaveBeenCalled();
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('clears the refresh_token cookie scoped to /auth', () => {
      controller.logout(res as unknown as Response);

      expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', {
        path: '/auth',
      });
    });
  });

  describe('updateMe', () => {
    const updatedUser = {
      id: 'user-1',
      email: 'user@example.com',
      name: 'New Name',
      role: 'family' as const,
      isActive: true,
    };

    it('updates only name when email is omitted', async () => {
      tenantContext.getUserId.mockReturnValue('user-1');
      tenantContext.getHomeId.mockReturnValue('home-1');
      prisma.client.user.update.mockResolvedValue(updatedUser);
      prisma.client.home.findUnique.mockResolvedValue({ name: 'Sunny Acres' });

      const result = await controller.updateMe({ name: 'New Name' });

      expect(prisma.client.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { name: 'New Name' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
        },
      });
      expect(prisma.client.home.findUnique).toHaveBeenCalledWith({
        where: { id: 'home-1' },
        select: { name: true },
      });
      expect(result).toEqual({
        ...updatedUser,
        homeId: 'home-1',
        homeName: 'Sunny Acres',
      });
    });

    it('trims and lowercases the email before persisting', async () => {
      tenantContext.getUserId.mockReturnValue('user-1');
      tenantContext.getHomeId.mockReturnValue(null);
      prisma.client.user.update.mockResolvedValue({
        ...updatedUser,
        email: 'foo@example.com',
      });

      await controller.updateMe({ email: '  Foo@Example.com  ' });

      expect(prisma.client.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { email: 'foo@example.com' } }),
      );
    });

    it('rejects with 401 before touching Prisma when there is no authenticated user', async () => {
      tenantContext.getUserId.mockReturnValue(undefined);

      await expect(
        controller.updateMe({ name: 'New Name' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.client.user.update).not.toHaveBeenCalled();
    });

    it('maps a unique-email violation to a 409 ConflictException', async () => {
      tenantContext.getUserId.mockReturnValue('user-1');
      prisma.client.user.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('conflict', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        controller.updateMe({ email: 'taken@example.com' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows any other error unchanged', async () => {
      tenantContext.getUserId.mockReturnValue('user-1');
      const unexpected = new Error('boom');
      prisma.client.user.update.mockRejectedValue(unexpected);

      await expect(controller.updateMe({ name: 'X' })).rejects.toBe(unexpected);
    });
  });
});
