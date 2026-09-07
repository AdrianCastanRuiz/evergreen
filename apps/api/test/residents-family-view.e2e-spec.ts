import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PasswordService } from './../src/auth/password.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { TenantContextService } from './../src/common/tenant/tenant-context.service';

// Compiling the full AppModule + connecting to Postgres + seeding the shared
// fixtures in beforeAll exceeds Jest's default 5s hook timeout.
jest.setTimeout(60_000);

// Story 2.3: a family member sees only the residents linked to their own
// account (GET /residents/linked, AC #1/#2/#3) and - once guarded — the
// single resident reads are refused for residents they hold no link to
// (GET /residents/:residentId via FamilyResidentGuard, AC #4, AD-11).
//
// The family caller's JWT carries no home_id and the mobile app sends no
// X-Active-Home-Id header, so every family-scoped query below runs through
// the guard/bypass path with explicit userId filters — the same posture the
// guard spec proves at unit level, now exercised against the live DB.
describe('Residents — family view of linked residents (e2e)', () => {
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
  let familyA: { id: string; email: string };
  let familyB: { id: string; email: string };
  let adminAToken: string;
  let familyAToken: string;
  let familyBToken: string;

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

    homeA = await seedHome(`E2E Family View Home A ${Date.now()}`);
    adminA = await seedActiveUser('admin', [homeA]);
    familyA = await seedActiveUser('family', [homeA]);
    familyB = await seedActiveUser('family', [homeA]);
    adminAToken = await login(adminA.email);
    familyAToken = await login(familyA.email);
    familyBToken = await login(familyB.email);
  });

  afterAll(async () => {
    await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () => {
        await prisma.client.familyLink.deleteMany({
          where: { userId: { in: seededUserIds } },
        });
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

  async function seedLink(userId: string, residentId: string): Promise<void> {
    await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.familyLink.create({
          data: { userId, residentId, homeId: homeA },
        }),
    );
  }

  // Consumes one of this file's 5/min login-endpoint budget — call sparingly.
  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return (res.body as { accessToken: string }).accessToken;
  }

  // Declared FIRST, before any test links r3 to familyB: a family member with
  // no links yet must get an empty array. Seeded familyB has zero FamilyLinks
  // in beforeAll, so this assertion is only valid while that holds.
  it('returns an empty array for a family member with no links (zero-links, not an error)', async () => {
    const res = await request(app.getHttpServer())
      .get('/residents/linked')
      .set('Authorization', `Bearer ${familyBToken}`)
      .expect(200);

    expect(res.body).toEqual([]);
  });

  it("returns the family member's own linked residents only (AC #1/#2)", async () => {
    const r1 = await seedResident(homeA, 'R1 To Follow');
    const r2 = await seedResident(homeA, 'R2 To Follow');
    const r3 = await seedResident(homeA, 'R3 Not Mine');
    await seedLink(familyA.id, r1);
    await seedLink(familyA.id, r2);
    await seedLink(familyB.id, r3);

    const res = await request(app.getHttpServer())
      .get('/residents/linked')
      .set('Authorization', `Bearer ${familyAToken}`)
      .expect(200);

    const list = res.body as { id: string; name: string }[];
    const ids = list.map((r) => r.id).sort();
    expect(ids).toEqual([r1, r2].sort());
    expect(
      list.every((r) => 'name' in r && 'room' in r && !('homeId' in r)),
    ).toBe(true);
  });

  it('rejects the linked-residents list for admin (home-admin-only routes unaffected)', async () => {
    await request(app.getHttpServer())
      .get('/residents/linked')
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(403);
  });

  it('lets a family member read a resident they are linked to (AC #4 positive)', async () => {
    const r1 = await seedResident(homeA, 'Linked Read Target');
    await seedLink(familyA.id, r1);

    const res = await request(app.getHttpServer())
      .get(`/residents/${r1}`)
      .set('Authorization', `Bearer ${familyAToken}`)
      .expect(200);

    const body = res.body as { id: string; name: string };
    expect(body.id).toBe(r1);
    expect(body.name).toBe('Linked Read Target');
    expect(body).not.toHaveProperty('homeId');
  });

  it('rejects a family member reading a resident they are NOT linked to — 403, never 200 (AC #4)', async () => {
    const r3 = await seedResident(homeA, 'Not Linked to Me');

    await request(app.getHttpServer())
      .get(`/residents/${r3}`)
      .set('Authorization', `Bearer ${familyAToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/residents/${r3}`)
      .set('Authorization', `Bearer ${familyBToken}`)
      .expect(403);
  });

  it('rejects a family member reading a resident after their link is removed (AC #4 immediate loss)', async () => {
    const r1 = await seedResident(homeA, 'Soon Unlinked');
    await seedLink(familyA.id, r1);

    await request(app.getHttpServer())
      .get(`/residents/${r1}`)
      .set('Authorization', `Bearer ${familyAToken}`)
      .expect(200);

    await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.familyLink.delete({
          where: { userId_residentId: { userId: familyA.id, residentId: r1 } },
        }),
    );

    await request(app.getHttpServer())
      .get(`/residents/${r1}`)
      .set('Authorization', `Bearer ${familyAToken}`)
      .expect(403);
  });

  it('leaves single-resident profile ADMIN routes untouched for family (still management-only)', async () => {
    const r1 = await seedResident(homeA, 'Admin Guard Target');
    await seedLink(familyA.id, r1);

    // Admin can still read/patch their own home's residents.
    await request(app.getHttpServer())
      .patch(`/residents/${r1}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ room: '999' })
      .expect(200);

    // But family cannot manage — only read the guarded single resident.
    await request(app.getHttpServer())
      .patch(`/residents/${r1}`)
      .set('Authorization', `Bearer ${familyAToken}`)
      .send({ room: 'HACK' })
      .expect(403);
  });
});
