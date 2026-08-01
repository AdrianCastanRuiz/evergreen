import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Role } from '../../../generated/prisma/enums.js';

export interface TenantStore {
  userId: string | null;
  role: Role | null;
  homeId: string | null;
  bypass: boolean;
}

// Request-scoped tenant context (AD-1 rule 1). Populated by
// TenantContextMiddleware, read by the Prisma tenant-scoping extension and by
// the BypassTenantScope interceptor. AsyncLocalStorage propagates correctly
// across awaits, so this stays valid through guards, interceptors, and
// service calls for the lifetime of a single request.
@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantStore>();

  run<T>(store: TenantStore, fn: () => T): T {
    return this.storage.run(store, fn);
  }

  getStore(): TenantStore | undefined {
    return this.storage.getStore();
  }

  getHomeId(): string | null {
    return this.getStore()?.homeId ?? null;
  }

  getUserId(): string | null {
    return this.getStore()?.userId ?? null;
  }

  isBypassed(): boolean {
    return this.getStore()?.bypass ?? false;
  }
}
