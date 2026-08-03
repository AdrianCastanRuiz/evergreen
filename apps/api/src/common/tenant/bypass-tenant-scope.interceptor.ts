import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { BYPASS_TENANT_SCOPE_KEY } from './bypass-tenant-scope.decorator';
import { TenantContextService } from './tenant-context.service';

// Global interceptor: honors @BypassTenantScope() only for an authenticated
// super_admin, and audit-logs every activation with the acting user's id
// (AD-1 rule 5). Runs after auth has populated the TenantContextService via
// TenantContextMiddleware, so `role`/`userId` are already resolved.
@Injectable()
export class BypassTenantScopeInterceptor implements NestInterceptor {
  private readonly logger = new Logger('TenantScopeBypass');

  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContext: TenantContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isBypassRoute = this.reflector.getAllAndOverride<boolean>(
      BYPASS_TENANT_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isBypassRoute) {
      const store = this.tenantContext.getStore();
      if (store?.role === 'super_admin') {
        store.bypass = true;
        this.logger.log({
          event: 'tenant_scope_bypass',
          userId: store.userId,
          route: `${context.getClass().name}.${context.getHandler().name}`,
        });
      }
    }

    return next.handle();
  }
}
