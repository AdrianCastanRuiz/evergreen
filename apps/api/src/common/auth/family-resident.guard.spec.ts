import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { FamilyResidentGuard } from './family-resident.guard';

describe('FamilyResidentGuard', () => {
  let guard: FamilyResidentGuard;
  let tenantContext: {
    getStore: jest.Mock;
    runBypassed: jest.Mock;
  };
  let prisma: {
    client: {
      familyLink: { findUnique: jest.Mock };
      resident: { findUnique: jest.Mock };
      homeMembership: { findUnique: jest.Mock };
    };
  };

  const resident = {
    id: '11111111-1111-4111-8111-111111111111',
    homeId: 'home-1',
  };

  function contextWithResidentId(residentId?: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ params: { residentId } }),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    prisma = {
      client: {
        familyLink: { findUnique: jest.fn() },
        resident: { findUnique: jest.fn() },
        homeMembership: { findUnique: jest.fn() },
      },
    };
    tenantContext = {
      getStore: jest.fn(),
      // Mirrors the real implementation just enough for these tests: run the
      // callback and return its result — no real bypass-flag semantics to
      // exercise against a mock Prisma client.
      runBypassed: jest.fn((fn: () => unknown) => fn()),
    };
    guard = new FamilyResidentGuard(
      tenantContext as unknown as TenantContextService,
      prisma as unknown as PrismaService,
    );
  });

  it('exempts non-family callers (staff/admin/super_admin already scoped elsewhere)', async () => {
    for (const role of ['staff', 'admin', 'super_admin']) {
      tenantContext.getStore.mockReturnValue({ role, userId: 'user-1' });
      await expect(
        guard.canActivate(
          contextWithResidentId('11111111-1111-4111-8111-111111111111'),
        ),
      ).resolves.toBe(true);
    }
    expect(prisma.client.familyLink.findUnique).not.toHaveBeenCalled();
  });

  it('allows a family caller with both a live FamilyLink and a HomeMembership in the resident home (AD-11)', async () => {
    tenantContext.getStore.mockReturnValue({
      role: 'family',
      userId: 'user-1',
    });
    prisma.client.familyLink.findUnique.mockResolvedValue({
      userId: 'user-1',
      residentId: '11111111-1111-4111-8111-111111111111',
    });
    prisma.client.resident.findUnique.mockResolvedValue(resident);
    prisma.client.homeMembership.findUnique.mockResolvedValue({
      userId: 'user-1',
      homeId: 'home-1',
    });

    await expect(
      guard.canActivate(
        contextWithResidentId('11111111-1111-4111-8111-111111111111'),
      ),
    ).resolves.toBe(true);
    expect(prisma.client.familyLink.findUnique).toHaveBeenCalledWith({
      where: {
        userId_residentId: {
          userId: 'user-1',
          residentId: '11111111-1111-4111-8111-111111111111',
        },
      },
    });
  });

  it('rejects a family caller with no FamilyLink to the resident', async () => {
    tenantContext.getStore.mockReturnValue({
      role: 'family',
      userId: 'user-1',
    });
    prisma.client.familyLink.findUnique.mockResolvedValue(null);
    prisma.client.resident.findUnique.mockResolvedValue(resident);

    await expect(
      guard.canActivate(
        contextWithResidentId('11111111-1111-4111-8111-111111111111'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.client.homeMembership.findUnique).not.toHaveBeenCalled();
  });

  it('rejects immediate access loss after a FamilyLink is removed — AC #5', async () => {
    tenantContext.getStore.mockReturnValue({
      role: 'family',
      userId: 'user-1',
    });
    // The link was just deleted — same shape as a caller re-requesting the
    // same resident right after an admin removes the link.
    prisma.client.familyLink.findUnique.mockResolvedValue(null);
    prisma.client.resident.findUnique.mockResolvedValue(resident);

    await expect(
      guard.canActivate(
        contextWithResidentId('11111111-1111-4111-8111-111111111111'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a family caller whose own HomeMembership in the resident home was revoked, despite a stale FamilyLink (AD-11 condition b)', async () => {
    tenantContext.getStore.mockReturnValue({
      role: 'family',
      userId: 'user-1',
    });
    prisma.client.familyLink.findUnique.mockResolvedValue({
      userId: 'user-1',
      residentId: '11111111-1111-4111-8111-111111111111',
    });
    prisma.client.resident.findUnique.mockResolvedValue(resident);
    prisma.client.homeMembership.findUnique.mockResolvedValue(null);

    await expect(
      guard.canActivate(
        contextWithResidentId('11111111-1111-4111-8111-111111111111'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a resident id belonging to no home (cross-home / nonexistent resident)', async () => {
    tenantContext.getStore.mockReturnValue({
      role: 'family',
      userId: 'user-1',
    });
    prisma.client.familyLink.findUnique.mockResolvedValue({
      userId: 'user-1',
      residentId: '22222222-2222-4222-8222-222222222222',
    });
    prisma.client.resident.findUnique.mockResolvedValue(null);

    await expect(
      guard.canActivate(
        contextWithResidentId('22222222-2222-4222-8222-222222222222'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.client.homeMembership.findUnique).not.toHaveBeenCalled();
  });

  it('rejects when no residentId route param is present', async () => {
    tenantContext.getStore.mockReturnValue({
      role: 'family',
      userId: 'user-1',
    });

    await expect(
      guard.canActivate(contextWithResidentId(undefined)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.client.familyLink.findUnique).not.toHaveBeenCalled();
  });

  // Review finding (Blind Hunter + Edge Case Hunter): a missing tenant
  // context must fail CLOSED, not be treated the same as an exempt
  // staff/admin/super_admin role.
  it('rejects when there is no tenant context at all, rather than exempting it like a non-family role', async () => {
    tenantContext.getStore.mockReturnValue(undefined);

    await expect(
      guard.canActivate(
        contextWithResidentId('11111111-1111-4111-8111-111111111111'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.client.familyLink.findUnique).not.toHaveBeenCalled();
  });

  // Review finding (Edge Case Hunter): every controller route touching
  // residentId guards it with ParseUUIDPipe first — this guard has no
  // route-level pipe to rely on, so it must validate the format itself.
  it('rejects a malformed (non-UUID) residentId instead of reaching Prisma with it', async () => {
    tenantContext.getStore.mockReturnValue({
      role: 'family',
      userId: 'user-1',
    });

    await expect(
      guard.canActivate(contextWithResidentId('not-a-uuid')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.client.familyLink.findUnique).not.toHaveBeenCalled();
  });
});
