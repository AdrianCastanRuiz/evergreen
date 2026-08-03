import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import type { AccessTokenPayload } from '../auth/token-payload';
import {
  TenantContextService,
  type TenantStore,
} from './tenant-context.service';

// Resolves the authenticated request's tenant context into AsyncLocalStorage
// (AD-1 rule 1) before any Guard, Interceptor, or Service runs:
//  - staff/admin/super_admin: home_id comes straight from the JWT (fixed).
//  - family: home_id comes from the X-Active-Home-Id header, validated
//    against the user's HomeMembership rows (AD-1 rule 7, AD-18).
// An invalid/expired/missing token simply leaves the context empty — route
// protection (401/403) is a Guard's job (Phase 1), not this middleware's.
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('TenantContext');

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const store: TenantStore = {
      userId: null,
      role: null,
      homeId: null,
      bypass: false,
    };

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
          authHeader.slice('Bearer '.length),
        );
        if (payload.type !== 'access') {
          throw new Error('Not an access token');
        }
        store.userId = payload.sub;
        store.role = payload.role;

        if (payload.role === 'family') {
          store.homeId = await this.resolveFamilyActiveHomeId(payload.sub, req);
        } else {
          store.homeId = payload.homeId ?? null;
        }
      } catch {
        // Invalid/expired token: leave the context unauthenticated.
      }
    }

    this.tenantContext.run(store, () => next());
  }

  private async resolveFamilyActiveHomeId(
    userId: string,
    req: Request,
  ): Promise<string | null> {
    const header = req.headers['x-active-home-id'];
    const activeHomeId = Array.isArray(header) ? header[0] : header;
    if (!activeHomeId) return null;

    // Internal, narrowly-scoped bypass: we're determining home_id itself, so
    // there's nothing to auto-inject yet. The explicit userId+homeId filter
    // below does the actual scoping — this is not the controller-facing
    // @BypassTenantScope() escape hatch.
    const membership = await this.tenantContext.run(
      { userId, role: 'family', homeId: null, bypass: true },
      () =>
        this.prisma.client.homeMembership.findFirst({
          where: { userId, homeId: activeHomeId },
          select: { homeId: true },
        }),
    );

    if (!membership) {
      this.logger.warn({
        event: 'invalid_active_home_header',
        userId,
        attemptedHomeId: activeHomeId,
      });
      return null;
    }

    return membership.homeId;
  }
}
