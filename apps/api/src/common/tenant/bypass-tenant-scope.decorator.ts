import { SetMetadata } from '@nestjs/common';

export const BYPASS_TENANT_SCOPE_KEY = 'bypassTenantScope';

// Marks a single controller method as legitimately cross-home (e.g. super
// admin listing all homes or platform analytics). Never a global toggle —
// applied per-endpoint only. Enforced by BypassTenantScopeInterceptor, which
// only honors it for the super_admin role, and every use is audit-logged
// (AD-1 rule 5).
export const BypassTenantScope = () =>
  SetMetadata(BYPASS_TENANT_SCOPE_KEY, true);
