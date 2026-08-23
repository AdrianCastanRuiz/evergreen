import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PasswordService } from './../src/auth/password.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { TenantContextService } from './../src/common/tenant/tenant-context.service';

// Story 1.12: a home admin listing/managing the staff+family users of their
// own home (role changes + access revocation). Exercises the same
// non-bypass tenant-scoping branch as users-invite.e2e-spec.ts, plus the
// cross-home escape hatch (TenantContextService.runBypassed) UsersService
// now uses for the "does this user belong to more than one home" checks.
describe('Users — manage home users (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tenantContext: TenantContextService;
  let passwordService: PasswordService;

  const seededUserIds: string[] = [];
  const seededHomeIds: string[] = [];
  const PASSWORD = 'E2E-test-pass-123';

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
  });

  afterAll(async () => {
    await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () => {
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
    homeIds: string[],
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

    for (const homeId of homeIds) {
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

  async function login(email: string): Promise<string> {
    const { accessToken } = await loginPair(email);
    return accessToken;
  }

  async function loginPair(
    email: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body as { accessToken: string; refreshToken: string };
  }

  it('lists only staff+family of the admin own home, not other roles or other homes (AC #1, #3)', async () => {
    const homeA = await seedHome(`E2E Manage Home A ${Date.now()}`);
    const homeB = await seedHome(`E2E Manage Home B ${Date.now()}`);
    const admin = await seedActiveUser('admin', [homeA]);
    const staffA = await seedActiveUser('staff', [homeA]);
    const familyA = await seedActiveUser('family', [homeA]);
    await seedActiveUser('admin', [homeA]); // a second admin — must not appear
    await seedActiveUser('staff', [homeB]); // another home — must not appear
    const accessToken = await login(admin.email);

    const res = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const ids = (res.body as { id: string }[]).map((u) => u.id).sort();
    expect(ids).toEqual([staffA.id, familyA.id].sort());
  });

  it('rejects a staff caller — role management is home-admin-and-above (AC #4)', async () => {
    const homeId = await seedHome(`E2E Manage Home ${Date.now()}`);
    const staff = await seedActiveUser('staff', [homeId]);
    const family = await seedActiveUser('family', [homeId]);
    const accessToken = await login(staff.email);

    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/users/${family.id}/role`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ role: 'staff' })
      .expect(403);
  });

  it('rejects managing a user in a different home with 404, regardless of the target id being valid (AC #3)', async () => {
    const homeA = await seedHome(`E2E Manage Home A ${Date.now()}`);
    const homeB = await seedHome(`E2E Manage Home B ${Date.now()}`);
    const adminA = await seedActiveUser('admin', [homeA]);
    const familyB = await seedActiveUser('family', [homeB]);
    const accessToken = await login(adminA.email);

    await request(app.getHttpServer())
      .patch(`/users/${familyB.id}/role`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ role: 'staff' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/users/${familyB.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('promotes a single-home family user to staff — updates User.role, effective on their next refresh (AC #2)', async () => {
    const homeId = await seedHome(`E2E Manage Home ${Date.now()}`);
    const admin = await seedActiveUser('admin', [homeId]);
    const family = await seedActiveUser('family', [homeId]);
    const adminToken = await login(admin.email);
    const { refreshToken: familyRefreshToken } = await loginPair(family.email);

    const res = await request(app.getHttpServer())
      .patch(`/users/${family.id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'staff' })
      .expect(200);
    expect((res.body as { role: string }).role).toBe('staff');

    const membership = await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.homeMembership.findUnique({
          where: { userId_homeId: { userId: family.id, homeId } },
        }),
    );
    expect(membership?.role).toBe('staff');

    // The family user's already-issued access token still carries the old
    // role claim — the promotion takes effect at their next refresh, which
    // re-reads User.role fresh from the DB (AuthService.refresh).
    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: familyRefreshToken })
      .expect(200);
    const newAccessToken = (refreshRes.body as { accessToken: string })
      .accessToken;

    const meRes = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${newAccessToken}`)
      .expect(200);
    expect((meRes.body as { role: string }).role).toBe('staff');
  });

  it('rejects promoting a family user linked to more than one home to staff (409)', async () => {
    const homeA = await seedHome(`E2E Manage Home A ${Date.now()}`);
    const homeB = await seedHome(`E2E Manage Home B ${Date.now()}`);
    const admin = await seedActiveUser('admin', [homeA]);
    const family = await seedActiveUser('family', [homeA, homeB]);
    const adminToken = await login(admin.email);

    await request(app.getHttpServer())
      .patch(`/users/${family.id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'staff' })
      .expect(409);
  });

  it('rejects a home admin changing their own role (self-lockout)', async () => {
    const homeId = await seedHome(`E2E Manage Home ${Date.now()}`);
    const admin = await seedActiveUser('admin', [homeId]);
    const adminToken = await login(admin.email);

    await request(app.getHttpServer())
      .patch(`/users/${admin.id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'staff' })
      .expect(403);
  });

  it('revokes a staff user with no other home — deletes the membership and deactivates the account, blocking their next login (AC #5)', async () => {
    const homeId = await seedHome(`E2E Manage Home ${Date.now()}`);
    const admin = await seedActiveUser('admin', [homeId]);
    const staff = await seedActiveUser('staff', [homeId]);
    const adminToken = await login(admin.email);

    await request(app.getHttpServer())
      .delete(`/users/${staff.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    const membership = await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.homeMembership.findUnique({
          where: { userId_homeId: { userId: staff.id, homeId } },
        }),
    );
    expect(membership).toBeNull();

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: staff.email, password: PASSWORD })
      .expect(401);
  });

  it('revokes a family user from one home but leaves them active and able to log in via their other home', async () => {
    const homeA = await seedHome(`E2E Manage Home A ${Date.now()}`);
    const homeB = await seedHome(`E2E Manage Home B ${Date.now()}`);
    const admin = await seedActiveUser('admin', [homeA]);
    const family = await seedActiveUser('family', [homeA, homeB]);
    const adminToken = await login(admin.email);

    await request(app.getHttpServer())
      .delete(`/users/${family.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: family.email, password: PASSWORD })
      .expect(200);
  });
});
