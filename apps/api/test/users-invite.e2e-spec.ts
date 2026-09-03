import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PasswordService } from './../src/auth/password.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { TenantContextService } from './../src/common/tenant/tenant-context.service';

// Story 1.5: the first write path where an admin/staff (not super_admin)
// actor writes to a tenant-scoped model (HomeMembership) relying purely on
// the auto-inject branch of the tenant-scoping extension — no
// @BypassTenantScope() involved. Every prior HomeMembership write
// (Story 1.3) exercised only the bypass branch, so this is genuinely new
// coverage, not a copy of an existing regression test.
describe('Users — invite staff/family (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tenantContext: TenantContextService;
  let passwordService: PasswordService;

  const seededUserIds: string[] = [];
  const seededHomeIds: string[] = [];
  const seededResidentIds: string[] = [];
  const PASSWORD = 'E2E-test-pass-123';

  // Shared fixture for the tests below that just need "an admin of some
  // home" — reused instead of a fresh seedHome+seedActiveUser+login each,
  // to stay within this file's shared 5/min login-endpoint budget (AD-8;
  // same rationale as residents-manage-home.e2e-spec.ts's shared fixtures).
  let homeA: string;
  let adminA: { id: string; email: string };
  let adminAToken: string;

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
    passwordService = app.get(PasswordService);

    homeA = await seedHome(`E2E Invite Home A ${Date.now()}`);
    adminA = await seedActiveUser('admin', homeA);
    adminAToken = await login(adminA.email);
  });

  afterAll(async () => {
    await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () => {
        await prisma.client.passwordResetToken.deleteMany({
          where: { userId: { in: seededUserIds } },
        });
        // Cascades any FamilyLink created by this file's Story 2.2 tests
        // before the User/Home rows they reference are deleted below.
        await prisma.client.resident.deleteMany({
          where: { id: { in: seededResidentIds } },
        });
        await prisma.client.homeMembership.deleteMany({
          where: { userId: { in: seededUserIds } },
        });
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

  async function seedHome(name: string): Promise<string> {
    const home = await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.home.create({
          data: { name, timezone: 'Europe/Madrid' },
        }),
    );
    seededHomeIds.push(home.id);
    return home.id;
  }

  async function seedActiveUser(
    role: 'admin' | 'staff' | 'family',
    homeId: string | null,
  ): Promise<{ id: string; email: string }> {
    const passwordHash = await passwordService.hash(PASSWORD);
    const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@e2e.evergreen.test`;
    const user = await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.user.create({
          data: { email, passwordHash, role, isActive: true },
        }),
    );
    seededUserIds.push(user.id);

    if (homeId) {
      await tenantContext.run(
        { userId: null, role: 'super_admin', homeId: null, bypass: true },
        async () =>
          await prisma.client.homeMembership.create({
            data: { userId: user.id, homeId, role },
          }),
      );
    }

    return { id: user.id, email };
  }

  async function seedResident(homeId: string, name: string): Promise<string> {
    const resident = await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.resident.create({ data: { homeId, name } }),
    );
    seededResidentIds.push(resident.id);
    return resident.id;
  }

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return (res.body as { accessToken: string }).accessToken;
  }

  it('lets an admin invite a new staff member, scoped to the admin own home (AC #1)', async () => {
    const inviteEmail = `new-staff-${Date.now()}@e2e.evergreen.test`;
    const res = await request(app.getHttpServer())
      .post('/users/invites')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ email: inviteEmail, role: 'staff' })
      .expect(201);

    const invitedId = (res.body as { id: string }).id;
    seededUserIds.push(invitedId);
    expect(res.body).toEqual({
      id: invitedId,
      email: inviteEmail,
      // Pre-existing gap, unrelated to Story 2.2: this assertion predates
      // the invitee-name-capture feature (commit e1a75f9) and never picked
      // up the response's `name` field.
      name: null,
      role: 'staff',
      isActive: false,
      homeId: homeA,
    });

    const membership = await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.homeMembership.findFirst({
          where: { userId: invitedId },
        }),
    );
    expect(membership?.homeId).toBe(homeA);
    expect(membership?.role).toBe('staff');
  });

  it('lets a staff member invite a new family member (AC #3)', async () => {
    const homeId = await seedHome(`E2E Invite Home ${Date.now()}`);
    const staff = await seedActiveUser('staff', homeId);
    const accessToken = await login(staff.email);

    const inviteEmail = `new-family-${Date.now()}@e2e.evergreen.test`;
    const res = await request(app.getHttpServer())
      .post('/users/invites')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: inviteEmail, role: 'family' })
      .expect(201);

    const invitedId = (res.body as { id: string }).id;
    seededUserIds.push(invitedId);
    expect((res.body as { role: string }).role).toBe('family');
  });

  it('rejects staff inviting another staff — same rank, not strictly downward (AC #5)', async () => {
    const homeId = await seedHome(`E2E Invite Home ${Date.now()}`);
    const staff = await seedActiveUser('staff', homeId);
    const accessToken = await login(staff.email);

    await request(app.getHttpServer())
      .post('/users/invites')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        email: `blocked-${Date.now()}@e2e.evergreen.test`,
        role: 'staff',
      })
      .expect(403);
  });

  it('rejects a family caller — not in @Roles(admin, staff)', async () => {
    const homeId = await seedHome(`E2E Invite Home ${Date.now()}`);
    const family = await seedActiveUser('family', homeId);
    const accessToken = await login(family.email);

    await request(app.getHttpServer())
      .post('/users/invites')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        email: `blocked-${Date.now()}@e2e.evergreen.test`,
        role: 'family',
      })
      .expect(403);
  });

  // AC #4: the invited email already belongs to an active family user in a
  // different home — gains a second HomeMembership, no duplicate User row.
  it('grants an existing family user from another home a second HomeMembership, without duplicating the User (AC #4)', async () => {
    const homeA = await seedHome(`E2E Home A ${Date.now()}`);
    const homeB = await seedHome(`E2E Home B ${Date.now()}`);
    const family = await seedActiveUser('family', homeA);
    const admin = await seedActiveUser('admin', homeB);
    const adminToken = await login(admin.email);

    const res = await request(app.getHttpServer())
      .post('/users/invites')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: family.email, role: 'family' })
      .expect(201);

    expect((res.body as { id: string }).id).toBe(family.id);

    const memberships = await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.homeMembership.findMany({
          where: { userId: family.id },
        }),
    );
    expect(memberships.map((m) => m.homeId).sort()).toEqual(
      [homeA, homeB].sort(),
    );

    const users = await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.user.findMany({ where: { email: family.email } }),
    );
    expect(users).toHaveLength(1);
  });

  // Story 2.2 (AC #1, AC #4): a FamilyLink is written at invite time,
  // alongside the HomeMembership — usable once the account activates
  // (Story 1.7/1.8) — and a residentId that doesn't resolve in the caller's
  // own home 404s cleanly, creating no user, never leaking cross-home
  // resident existence. Combined into one test (rather than one login each)
  // to stay within this file's shared 5/min login-endpoint budget (AD-8).
  it('links a resident given at invite time, and rejects one from another home (Story 2.2 AC #1, #4)', async () => {
    const homeB = await seedHome(`E2E Invite+Link Home B ${Date.now()}`);
    const residentA = await seedResident(homeA, 'Linked at invite time');
    const residentB = await seedResident(homeB, 'Home B Resident');

    const linkedInviteEmail = `new-family-linked-${Date.now()}@e2e.evergreen.test`;
    const linkedRes = await request(app.getHttpServer())
      .post('/users/invites')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ email: linkedInviteEmail, role: 'family', residentId: residentA })
      .expect(201);

    const invitedId = (linkedRes.body as { id: string }).id;
    seededUserIds.push(invitedId);

    const familyLink = await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.familyLink.findUnique({
          where: {
            userId_residentId: { userId: invitedId, residentId: residentA },
          },
        }),
    );
    expect(familyLink).not.toBeNull();
    expect(familyLink?.homeId).toBe(homeA);

    const blockedInviteEmail = `blocked-link-${Date.now()}@e2e.evergreen.test`;
    await request(app.getHttpServer())
      .post('/users/invites')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        email: blockedInviteEmail,
        role: 'family',
        residentId: residentB,
      })
      .expect(404);

    const blockedUsers = await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.user.findMany({
          where: { email: blockedInviteEmail },
        }),
    );
    expect(blockedUsers).toHaveLength(0);
  });

  // Review finding (Acceptance Auditor + Edge Case Hunter): the
  // "already-active family user from another home" branch
  // (grantExistingFamilyUserHomeAccess) used to silently drop residentId —
  // reusing adminAToken/homeA here (no new login) to stay within this
  // file's login budget.
  it('creates a FamilyLink when granting an existing active family user access to a new home, given a residentId (Story 2.2 AC #1, #4)', async () => {
    const homeB = await seedHome(`E2E Invite+Link Home C ${Date.now()}`);
    const existingFamily = await seedActiveUser('family', homeB);
    const residentA = await seedResident(homeA, 'For an existing family user');

    const res = await request(app.getHttpServer())
      .post('/users/invites')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        email: existingFamily.email,
        role: 'family',
        residentId: residentA,
      })
      .expect(201);

    expect((res.body as { id: string }).id).toBe(existingFamily.id);

    const familyLink = await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.familyLink.findUnique({
          where: {
            userId_residentId: {
              userId: existingFamily.id,
              residentId: residentA,
            },
          },
        }),
    );
    expect(familyLink).not.toBeNull();
    expect(familyLink?.homeId).toBe(homeA);
  });
});
