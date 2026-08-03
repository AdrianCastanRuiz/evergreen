import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantContextService } from '../tenant/tenant-context.service';
import { IS_PUBLIC_KEY } from './public.decorator';

// Global guard: rejects any request with no valid Bearer token (401) unless
// the route is marked @Public(). Runs after TenantContextMiddleware, which
// has already verified the token and populated the tenant store — this
// guard only checks that resolution actually succeeded.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContext: TenantContextService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    if (!this.tenantContext.getUserId()) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
