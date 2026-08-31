import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PasswordService } from './../src/auth/password.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { TenantContextService } from './../src/common/tenant/tenant-context.service';

// Story 2.1: a home admin creates/lists/edits resident profiles scoped to
// their own home. Exercises the same non-bypass tenant-scoping branch as
// users-manage-home.e2e-spec.ts — `Resident` is already tenant-scoped, so
// the cross-home case (AC #4) must resolve to a 404, never another home's
// row.
//
// POST /auth/login is throttled to 5/min per IP (NFR10/AD-8), shared by
// every test in this file. A shared admin/staff login in beforeAll, reused
// across every test below, keeps this file's total login-endpoint calls low.
describe('Residents — manage home residents (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tenantContext: TenantContextService;
  let passwordService: PasswordService;

  const seededUserIds: string[] = [];
  const seededHomeIds: string[] = [];
  const seededResidentIds: string[] = [];
  const PASSWORD = 'E2E-test-pass-123';

  let homeA: string;
  let adminA: { id: string; email: string };
  let staffA: { id: string; email: string };
  let familyA: { id: string; email: string };
  let adminAToken: string;
  let staffAToken: string;
  let familyAToken: string;

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

    homeA = await seedHome(`E2E Residents Home A ${Date.now()}`);
    adminA = await seedActiveUser('admin', [homeA]);
    staffA = await seedActiveUser('staff', [homeA]);
    familyA = await seedActiveUser('family', [homeA]);
    adminAToken = await login(adminA.email);
    staffAToken = await login(staffA.email);
    familyAToken = await login(familyA.email);
  });

  afterAll(async () => {
    await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () => {
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

  async function seedResident(homeId: string, name: string): Promise<string> {
    const resident = await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.resident.create({ data: { homeId, name } }),
    );
    seededResidentIds.push(resident.id);
    return resident.id;
  }

  // Consumes one of this file's 5/min login-endpoint budget — call sparingly.
  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return (res.body as { accessToken: string }).accessToken;
  }

  it('returns the empty-state list when the home has no residents yet (AC #3)', async () => {
    const homeEmpty = await seedHome(`E2E Residents Empty Home ${Date.now()}`);
    const adminEmpty = await seedActiveUser('admin', [homeEmpty]);
    const adminEmptyToken = await login(adminEmpty.email);

    const res = await request(app.getHttpServer())
      .get('/residents')
      .set('Authorization', `Bearer ${adminEmptyToken}`)
      .expect(200);

    expect(res.body).toEqual([]);
  });

  it('creates a resident scoped to the caller home admin own home (AC #1)', async () => {
    const res = await request(app.getHttpServer())
      .post('/residents')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ name: 'Jane Doe', room: '101', dob: '1940-01-01' })
      .expect(201);

    const created = res.body as { id: string; name: string; room: string };
    seededResidentIds.push(created.id);
    expect(created.name).toBe('Jane Doe');
    expect(created.room).toBe('101');

    const listRes = await request(app.getHttpServer())
      .get('/residents')
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    const ids = (listRes.body as { id: string }[]).map((r) => r.id);
    expect(ids).toContain(created.id);
  });

  it('edits a resident and the change is reflected immediately (AC #2)', async () => {
    const residentId = await seedResident(homeA, 'Original Name');

    await request(app.getHttpServer())
      .patch(`/residents/${residentId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ name: 'Updated Name', room: '202' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/residents/${residentId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    expect((res.body as { name: string }).name).toBe('Updated Name');
    expect((res.body as { room: string }).room).toBe('202');
  });

  it('rejects creating/editing a resident outside the caller home with 404, never another home data (AC #4)', async () => {
    const homeB = await seedHome(`E2E Residents Home B ${Date.now()}`);
    const residentB = await seedResident(homeB, 'Home B Resident');

    await request(app.getHttpServer())
      .get(`/residents/${residentB}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/residents/${residentB}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ name: 'Hijacked Name' })
      .expect(404);

    // Review Finding (patch): GET /residents (list) relies on the same
    // tenant-scoping extension as get-by-id/patch above, but had no test
    // proving the list itself excludes another home's residents.
    const listRes = await request(app.getHttpServer())
      .get('/residents')
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    const ids = (listRes.body as { id: string }[]).map((r) => r.id);
    expect(ids).not.toContain(residentB);
  });

  it('rejects family and staff callers — resident profile management is home-admin-only (AC #5)', async () => {
    const residentId = await seedResident(homeA, 'Guarded Resident');

    await request(app.getHttpServer())
      .get('/residents')
      .set('Authorization', `Bearer ${staffAToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post('/residents')
      .set('Authorization', `Bearer ${staffAToken}`)
      .send({ name: 'Nope' })
      .expect(403);

    await request(app.getHttpServer())
      .get('/residents')
      .set('Authorization', `Bearer ${familyAToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/residents/${residentId}`)
      .set('Authorization', `Bearer ${familyAToken}`)
      .send({ name: 'Nope' })
      .expect(403);
  });
});
