import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import type { Role } from '../../generated/prisma';
import { Public } from '../common/auth/public.decorator';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuthService,
  REFRESH_TOKEN_TTL_MS,
  type TokenPair,
} from './auth.service';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { PasswordResetService } from './password-reset.service';

export interface MeResponse {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  isActive: boolean;
  homeId: string | null;
}

const REFRESH_COOKIE_NAME = 'refresh_token';

// apps/admin's session (Story 1.14): the refresh token never reaches its
// JS — only this cookie carries it, scoped to /auth so it's sent on
// refresh/logout but not on every unrelated API call. `sameSite: 'none'`
// (not 'lax') because apps/admin and this API may be deployed on separate
// registrable domains (e.g. distinct *.onrender.com subdomains, which are
// cross-SITE, not just cross-origin) — 'lax' would silently drop the
// cookie on fetch/XHR in that case. Requires `secure: true`; browsers
// special-case localhost to still allow that over plain HTTP in dev.
const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  path: '/auth',
  maxAge: REFRESH_TOKEN_TTL_MS,
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tenantContext: TenantContextService,
    private readonly prisma: PrismaService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  // NFR10/AD-8: tighter than the global default — 5 attempts/minute.
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenPair> {
    const tokens = await this.authService.login(dto.email, dto.password);
    // Body is unchanged (mobile needs refreshToken there — it has no
    // cookie jar); apps/admin must discard the field and rely on this
    // cookie instead (Story 1.14 Dev Notes).
    res.cookie(
      REFRESH_COOKIE_NAME,
      tokens.refreshToken,
      REFRESH_COOKIE_OPTIONS,
    );
    return tokens;
  }

  // Looser than login but still tighter than the global default — this
  // mints fresh tokens from a bearer credential, so it deserves its own
  // limit rather than the generic 60/min (NFR10/AD-8).
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenPair> {
    // Mobile sends it in the body; apps/admin sends none and relies on the
    // cookie (Story 1.14). Either source is accepted, body takes priority
    // only because it's the pre-existing contract — a caller never sends
    // both in practice.
    const refreshToken: string | undefined =
      dto.refreshToken ??
      (req.cookies as Record<string, string> | undefined)?.[
        REFRESH_COOKIE_NAME
      ];
    if (!refreshToken) throw new UnauthorizedException('Invalid refresh token');

    const tokens = await this.authService.refresh(refreshToken);
    // AuthService.refresh rotates both tokens on every call — the cookie
    // must be re-set with the new refresh token each time, or the browser
    // would keep sending the now-invalid, already-rotated-away one.
    res.cookie(
      REFRESH_COOKIE_NAME,
      tokens.refreshToken,
      REFRESH_COOKIE_OPTIONS,
    );
    return tokens;
  }

  // Silently no-ops for an unknown email — same 204 either way, so the
  // response can never be used to enumerate registered accounts (NFR9/AD-8).
  // Also backs invited-account activation (Story 1.3/1.5): a pending
  // account (isActive=false, no passwordHash) uses the same link.
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password-reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  requestPasswordReset(@Body() dto: RequestPasswordResetDto): Promise<void> {
    return this.passwordResetService.requestReset(dto.email);
  }

  // Looser than the request endpoint since a legitimate user may mistype
  // their new password and retry, but still tighter than the global
  // default (NFR10/AD-8). Does not return a token pair — the client
  // navigates to login after a successful confirm (frozen spec boundary).
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmPasswordReset(
    @Body() dto: ConfirmPasswordResetDto,
  ): Promise<{ success: true }> {
    await this.passwordResetService.confirmReset(dto.token, dto.newPassword);
    return { success: true };
  }

  // Stateless JWTs: there is no server-side session to destroy. Deleting
  // the tokens from the platform keychain client-side is what actually logs
  // the user out (FR9) — this endpoint exists so the client has a
  // consistent call to make (and a hook for a future revocation list).
  // Public so a client with an already-expired access token can still call
  // it and get a clean 204 instead of a 401 on the way out.
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: Response): void {
    // Still no server-side session to destroy (stateless JWT, see
    // deferred-work.md) — this only clears the browser-held cookie
    // (Story 1.14). Mobile has no cookie to clear; this is a no-op for it.
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth' });
  }

  // Backs the splash-screen auth-state resolution (FR8): the client calls
  // this with whatever access token it has in the keychain to find out if
  // the session is still valid and who it belongs to.
  @Get('me')
  async me(): Promise<MeResponse> {
    const userId = this.tenantContext.getUserId();
    if (!userId) throw new UnauthorizedException();

    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
      },
    });

    // The token can still be valid for up to its 15-minute TTL after the
    // account was deactivated or deleted (accepted tradeoff — see
    // deferred-work.md) — but /me itself should never 500 on that gap, and
    // shouldn't report a deactivated account as a live session.
    if (!user || !user.isActive) throw new UnauthorizedException();

    return { ...user, homeId: this.tenantContext.getHomeId() };
  }
}
