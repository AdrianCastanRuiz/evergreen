import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Role } from '../../../generated/prisma';

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

  // Runs `fn` with the CURRENT store's `bypass` flag temporarily flipped on,
  // then restored — for one-off cross-home lookups (e.g. resolving a fixed
  // home_id at login, before request-scoped homeId is known) that need to
  // read a tenant-scoped table without a homeId in context.
  //
  // Deliberately mutates the existing store object in place rather than
  // nesting a new `run()` context: a `run()` call nested inside a store that
  // is itself already inside a `run()` (i.e. anywhere past
  // TenantContextMiddleware) does not reliably propagate through Prisma 7's
  // WASM query engine — confirmed by direct reproduction. Mutating the
  // store Prisma's extension already reads from sidesteps that entirely.
  async runBypassed<T>(fn: () => Promise<T>): Promise<T> {
    const store = this.getStore();
    if (!store) {
      throw new Error(
        'runBypassed() called with no tenant context established — ' +
          'must run within TenantContextMiddleware.',
      );
    }

    const previousBypass = store.bypass;
    store.bypass = true;
    try {
      return await fn();
    } finally {
      store.bypass = previousBypass;
    }
  }
}
