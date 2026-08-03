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
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';

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
