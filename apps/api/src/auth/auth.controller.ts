import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Role } from '../../generated/prisma';
import { Public } from '../common/auth/public.decorator';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, type TokenPair } from './auth.service';
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
  login(@Body() dto: LoginDto): Promise<TokenPair> {
    return this.authService.login(dto.email, dto.password);
  }

  // Looser than login but still tighter than the global default — this
  // mints fresh tokens from a bearer credential, so it deserves its own
  // limit rather than the generic 60/min (NFR10/AD-8).
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto): Promise<TokenPair> {
    return this.authService.refresh(dto.refreshToken);
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
  logout(): void {}

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
