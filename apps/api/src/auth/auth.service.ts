import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '../../generated/prisma';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
} from '../common/auth/token-payload';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '30d';

// Mirrors REFRESH_TOKEN_TTL above (30 days) as milliseconds, for the
// refresh_token cookie's maxAge (Story 1.14, AuthController). Exported
// rather than duplicated so the two can't silently drift apart.
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// A precomputed bcrypt hash of no real password. Compared against on every
// login where the account doesn't exist or has no passwordHash yet, so a
// failed lookup costs the same wall-clock time as a wrong-password compare
// on a real account — otherwise the missing-account short-circuit is a
// timing side-channel that lets an attacker enumerate registered emails.
const DUMMY_PASSWORD_HASH =
  '$2b$12$h1oTG2CtnbQOBIB3uRt1furOcOeczo8SbYHKLDlt48YQdewb9Tg3e';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly tenantContext: TenantContextService,
    private readonly passwordService: PasswordService,
  ) {}

  async login(email: string, password: string): Promise<TokenPair> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.client.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Same generic error whether the email doesn't exist, the account is
    // still pending (no passwordHash yet — Story 1.7 sets it), or the
    // password is wrong: never reveal which case it was. Always run a
    // bcrypt compare — against a dummy hash when there's no real one — so
    // the response time doesn't betray which case it was either.
    const passwordMatches = await this.passwordService.compare(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user?.passwordHash || !user.isActive || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const homeId = await this.resolveFixedHomeId(user.id, user.role);
    this.assertFixedHomeInvariant(user.role, homeId);
    return this.issueTokenPair(user.id, user.role, homeId);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: RefreshTokenPayload;
    try {
      payload =
        await this.jwtService.verifyAsync<RefreshTokenPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.client.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const homeId = await this.resolveFixedHomeId(user.id, user.role);
    this.assertFixedHomeInvariant(user.role, homeId);
    return this.issueTokenPair(user.id, user.role, homeId);
  }

  // staff/admin must always resolve to a fixed home — a membership-less
  // staff/admin account is a data-integrity bug (invitations, once built,
  // must not allow one), and issuing a token with no homeId for one would
  // otherwise 500 on every subsequent tenant-scoped query instead of
  // failing cleanly here.
  private assertFixedHomeInvariant(role: Role, homeId: string | null): void {
    if ((role === 'staff' || role === 'admin') && !homeId) {
      throw new UnauthorizedException(
        'Account is not fully set up — contact your home admin',
      );
    }
  }

  private async issueTokenPair(
    userId: string,
    role: Role,
    homeId: string | null,
  ): Promise<TokenPair> {
    const accessPayload: AccessTokenPayload = {
      sub: userId,
      role,
      type: 'access',
      ...(homeId ? { homeId } : {}),
    };
    const refreshPayload: RefreshTokenPayload = {
      sub: userId,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        expiresIn: ACCESS_TOKEN_TTL,
      }),
      this.jwtService.signAsync(refreshPayload, {
        expiresIn: REFRESH_TOKEN_TTL,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  // staff/admin carry exactly one fixed home; super_admin carries none;
  // family's homeId is never baked into the token, resolved per-request
  // from X-Active-Home-Id instead (AD-1 rule 6, AD-18).
  private async resolveFixedHomeId(
    userId: string,
    role: Role,
  ): Promise<string | null> {
    if (role === 'family' || role === 'super_admin') return null;

    // Ordered so the result is deterministic even if the "exactly one
    // membership" invariant is ever violated by a data bug — always the
    // earliest membership, not whichever row Postgres happens to return
    // first.
    const membership = await this.tenantContext.runBypassed(() =>
      this.prisma.client.homeMembership.findFirst({
        where: { userId },
        select: { homeId: true },
        orderBy: { createdAt: 'asc' },
      }),
    );
    return membership?.homeId ?? null;
  }
}
