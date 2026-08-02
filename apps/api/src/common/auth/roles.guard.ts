import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../../../generated/prisma';
import { TenantContextService } from '../tenant/tenant-context.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ROLES_KEY } from './roles.decorator';

// Global guard enforcing @Roles(...) (AD-12). Runs after JwtAuthGuard, so an
// authenticated store.role is already resolved by the time it matters.
// Routes with no @Roles() metadata are left open to any authenticated user.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContext: TenantContextService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // A @Public() route may have no authenticated role at all — defer to
    // JwtAuthGuard's public/401 handling instead of 403ing an anonymous
    // caller if it also happens to carry @Roles().
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const role = this.tenantContext.getStore()?.role;
    if (!role || !requiredRoles.includes(role)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
