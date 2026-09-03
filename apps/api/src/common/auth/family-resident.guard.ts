import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';

// Story 2.2 (AD-11, AC #5): a `family` caller may only reach a resident they
// hold a live FamilyLink to, in a home they still belong to. Exempt for
// staff/admin/super_admin — they're already scoped by @Roles()/home_id
// (AD-1), so this guard is a no-op for them.
//
// No route uses this yet (that's Story 2.3/2.4's family-facing "view
// resident" endpoint) — proven here by a unit test directly against the
// guard instead of a throwaway protected route.
@Injectable()
export class FamilyResidentGuard implements CanActivate {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const store = this.tenantContext.getStore();
    // Review finding: fail CLOSED, not open, when there's no tenant context
    // at all (e.g. a future guard-ordering bug placing this guard before
    // auth populates the store) — only a confirmed non-family role is
    // exempt, never "anything that isn't literally 'family'".
    if (!store) throw new ForbiddenException();
    if (store.role !== 'family') return true;

    const request = context
      .switchToHttp()
      .getRequest<{ params: Record<string, string | undefined> }>();
    const residentId = request.params.residentId;
    const userId = store.userId;
    // Review finding: every controller route touching residentId guards it
    // with ParseUUIDPipe first — this guard has no route-level pipe to rely
    // on, so a malformed id must be rejected here too, before it reaches
    // Prisma (which would otherwise throw an unhandled validation error
    // instead of a clean 403).
    if (!userId || !residentId || !isUUID(residentId)) {
      throw new ForbiddenException();
    }

    // A family caller's JWT carries no home_id (AuthService.resolveFixedHomeId
    // returns null for `family` — a family user can belong to several homes),
    // so neither FamilyLink nor HomeMembership can be read through the
    // tenant-scoping extension's normal auto-injected-homeId path here.
    // runBypassed() is safe: this guard supplies its own userId/residentId
    // filters instead of relying on injected home_id scoping.
    const [familyLink, resident] = await this.tenantContext.runBypassed(() =>
      Promise.all([
        this.prisma.client.familyLink.findUnique({
          where: { userId_residentId: { userId, residentId } },
        }),
        this.prisma.client.resident.findUnique({ where: { id: residentId } }),
      ]),
    );

    // Condition (a): a live FamilyLink row for this (user, resident) pair.
    if (!familyLink || !resident) {
      throw new ForbiddenException();
    }

    // Condition (b): the resident's home is one this user still belongs to —
    // catches a stale FamilyLink left behind after the user's own
    // HomeMembership in that home was revoked (Story 1.12).
    const membership = await this.tenantContext.runBypassed(() =>
      this.prisma.client.homeMembership.findUnique({
        where: { userId_homeId: { userId, homeId: resident.homeId } },
      }),
    );
    if (!membership) {
      throw new ForbiddenException();
    }

    return true;
  }
}
