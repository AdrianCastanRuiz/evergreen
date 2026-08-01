import type { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../generated/prisma';
import type { TenantContextService } from '../common/tenant/tenant-context.service';
import { TENANT_SCOPED_MODELS } from './tenant-scoped-models';

type QueryArgs = { where?: Record<string, unknown>; data?: unknown } & Record<
  string,
  unknown
>;

// Merges home_id into a query's args for the given operation. Our injected
// value always wins over anything a caller supplied, by spreading it last.
function injectHomeId(
  operation: string,
  args: QueryArgs | undefined,
  homeId: string,
): QueryArgs {
  const base = args ?? {};

  switch (operation) {
    case 'create':
      return { ...base, data: { ...(base.data as object), homeId } };

    case 'createMany':
    case 'createManyAndReturn': {
      const data = base.data;
      return {
        ...base,
        data: Array.isArray(data)
          ? (data as Record<string, unknown>[]).map((item) => ({
              ...item,
              homeId,
            }))
          : data,
      };
    }

    case 'upsert':
      return {
        ...base,
        where: { ...base.where, homeId },
        create: { ...(base as { create?: object }).create, homeId },
        update: { ...(base as { update?: object }).update, homeId },
      };

    // findMany, findFirst(OrThrow), findUnique(OrThrow), update, updateMany,
    // updateManyAndReturn, delete, deleteMany, count, aggregate, groupBy —
    // all accept `where`. An extra equality filter alongside a unique
    // identifier (findUnique/update/delete) is valid Prisma usage.
    default:
      return { ...base, where: { ...base.where, homeId } };
  }
}

// AD-1 rule 2: a Prisma Client Extension auto-injects home_id into every
// query on a tenant-scoped model — a developer never writes the filter by
// hand. This is the convenience layer; Postgres RLS (FORCE ROW LEVEL
// SECURITY, set via app.current_home_id / app.bypass_tenant_scope below) is
// the actual backstop that also covers raw SQL and anything this extension
// misses.
//
// `set_config(..., true)` is transaction-local (equivalent to SET LOCAL), so
// every scoped operation runs inside its own single-statement transaction —
// no session variable can leak across pooled connections between requests.
export function createTenantScopedPrismaClient(
  adapter: PrismaPg,
  tenantContext: TenantContextService,
) {
  const prisma = new PrismaClient({ adapter });

  return prisma.$extends({
    name: 'tenant-scoping',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const store = tenantContext.getStore();

          if (store?.bypass) {
            const [, result] = await prisma.$transaction([
              prisma.$executeRaw`SELECT set_config('app.bypass_tenant_scope', 'true', true)`,
              query(args),
            ]);
            return result;
          }

          const homeId = store?.homeId ?? null;
          if (!homeId) {
            throw new Error(
              `Tenant-scoped query on "${model}.${operation}" attempted with no home_id in ` +
                'request context. This is a bug in the calling code — legitimate cross-home ' +
                'operations must use @BypassTenantScope() (AD-1).',
            );
          }

          const scopedArgs = injectHomeId(operation, args, homeId);
          const [, result] = await prisma.$transaction([
            prisma.$executeRaw`SELECT set_config('app.current_home_id', ${homeId}, true)`,
            query(scopedArgs),
          ]);
          return result;
        },
      },
    },
  });
}

export type TenantScopedPrismaClient = ReturnType<
  typeof createTenantScopedPrismaClient
>;
export { Prisma };
