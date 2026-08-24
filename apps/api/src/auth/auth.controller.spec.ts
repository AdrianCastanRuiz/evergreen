import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { login: jest.Mock; refresh: jest.Mock };
  let res: { cookie: jest.Mock; clearCookie: jest.Mock };

  const tokens = { accessToken: 'access-1', refreshToken: 'refresh-1' };
  const rotatedTokens = { accessToken: 'access-2', refreshToken: 'refresh-2' };

  beforeEach(async () => {
    authService = { login: jest.fn(), refresh: jest.fn() };
    res = { cookie: jest.fn(), clearCookie: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: TenantContextService, useValue: {} },
        { provide: PrismaService, useValue: {} },
        { provide: PasswordResetService, useValue: {} },
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
});
