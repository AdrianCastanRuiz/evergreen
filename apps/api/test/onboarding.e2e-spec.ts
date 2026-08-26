import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { InviteCodeService } from './../src/auth/invite-code.service';
import { TenantContextService } from './../src/common/tenant/tenant-context.service';
import { PrismaService } from './../src/prisma/prisma.service';

// Story 1.8 (FR5): a pending family member invites-clears their account via an
// invite code entered in the app + a new password (POST /auth/onboarding/confirm).
// Public + throttled (10/min), @BypassTenantScope (no JWT → no tenant context),
// never returns a token pair — the family then logs in with the new password.
//
// The endpoint is throttled to 10/min per IP (NFR10/AD-8). This file uses 3
// attempts on that route (invalid, valid, reuse) — under budget.
describe('Auth — invite-code onboarding (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tenantContext: TenantContextService;
  let inviteCodeService: InviteCodeService;

  const seededHomeIds: string[] = [];
  const seededUserIds: string[] = [];
  const NEW_PASSWORD = 'E2E-onboard-pass-123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    tenantContext = moduleFixture.get(TenantContextService);
    inviteCodeService = app.get(InviteCodeService);
  });

  afterAll(async () => {
    await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () => {
        await prisma.client.user.deleteMany({
          where: { id: { in: seededUserIds } },
        });
        await prisma.client.home.deleteMany({
          where: { id: { in: seededHomeIds } },
        });
      },
    );
    await app.close();
  });

  // Seeds a home + a PENDING family user (no password, inactive) + their
  // HomeMembership, then mints a real invite code for that membership via the
  // actual InviteCodeService. Returns everything needed to exercise the flow.
  async function seedPendingFamily(): Promise<{
    email: string;
    code: string;
    userId: string;
    membershipId: string;
  }> {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const email = `family-${suffix}@e2e.evergreen.test`;

    const { user, membershipId, code } = await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () => {
        const home = await prisma.client.home.create({
          data: { name: `E2E Home ${suffix}`, timezone: 'Europe/Madrid' },
        });
        seededHomeIds.push(home.id);
        const user = await prisma.client.user.create({
          data: { email, role: 'family', isActive: false },
        });
        seededUserIds.push(user.id);
        const membership = await prisma.client.homeMembership.create({
          data: { userId: user.id, homeId: home.id, role: 'family' },
        });
        // Generate + persist the invite code's hash inside the SAME bypass
        // context — generateForMembership writes to the tenant-scoped
        // home_memberships table, which needs the bypass to escape RLS.
        const code = await inviteCodeService.generateForMembership(
          membership.id,
        );
        return { home, user, membershipId: membership.id, code };
      },
    );

    return { email, code, userId: user.id, membershipId };
  }

  it('valid, unused invite code → resolves the pending family account, which can then log in', async () => {
    const { email, code, userId, membershipId } = await seedPendingFamily();

    const res = await request(app.getHttpServer())
      .post('/auth/onboarding/confirm')
      .send({ inviteCode: code, newPassword: NEW_PASSWORD })
      .expect(200);
    expect(res.body).toEqual({ success: true });

    // DB reflects the resolution: user active with a password, code consumed.
    const membership = await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.homeMembership.findUnique({
          where: { id: membershipId },
          include: { user: true },
        }),
    );
    expect(membership!.user.isActive).toBe(true);
    expect(membership!.user.passwordHash).not.toBeNull();
    expect(membership!.inviteCodeUsedAt).not.toBeNull();

    // The family can now log in with the email + the password they set
    // (proves the resolution wasn't cosmetic).
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: NEW_PASSWORD })
      .expect(200);

    expect(userId).toBeTruthy();
  });

  it('invalid invite code → 400 with the UX-DR24 message, no account resolved', async () => {
    const { email } = await seedPendingFamily();

    const res = await request(app.getHttpServer())
      .post('/auth/onboarding/confirm')
      .send({ inviteCode: 'ZZZZZZZZZZ', newPassword: NEW_PASSWORD })
      .expect(400);
    expect((res.body as { message: string }).message).toContain(
      "That invite code isn't valid",
    );

    // Nobody can log in with that email (the user is still pending).
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: NEW_PASSWORD })
      .expect(401);
  });

  it('reusing an already-consumed invite code → 400 (single-use)', async () => {
    const { code } = await seedPendingFamily();

    await request(app.getHttpServer())
      .post('/auth/onboarding/confirm')
      .send({ inviteCode: code, newPassword: NEW_PASSWORD })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/onboarding/confirm')
      .send({ inviteCode: code, newPassword: 'another-password-999' })
      .expect(400);
  });
});
