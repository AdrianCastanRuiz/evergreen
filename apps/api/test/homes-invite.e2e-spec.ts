import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PasswordService } from './../src/auth/password.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { TenantContextService } from './../src/common/tenant/tenant-context.service';

// Story 1.3 code-review follow-up (Acceptance Auditor + Critical Risk #3):
// this is the first automated regression coverage for @BypassTenantScope()
// against a real tenant-scoped write (HomeMembership.create). Prior to this,
// that interaction was only checked via a one-off manual E2E transcript —
// Story 1.6's history shows this class of Prisma-tenant-context bug does not
// reliably surface in mocked unit tests, so this exercises the real Nest app
// + real Postgres, exactly like production.
describe('Homes — invite admin (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tenantContext: TenantContextService;

  const seededUserIds: string[] = [];
  const seededHomeIds: string[] = [];

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
  });

  afterAll(async () => {
    // Bypass mode to clean up regardless of RLS — mirrors how the app
    // itself performs legitimate cross-home operations (AD-1).
    await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () => {
        await prisma.client.passwordResetToken.deleteMany({
          where: { userId: { in: seededUserIds } },
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

  it('creates a HomeMembership with the correct home_id when a super_admin invites a home admin', async () => {
    const passwordService = app.get(PasswordService);
    const passwordHash = await passwordService.hash('E2E-test-pass-123');

    const superAdmin = await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.user.create({
          data: {
            email: `super-admin-${Date.now()}@e2e.evergreen.test`,
            passwordHash,
            role: 'super_admin',
            isActive: true,
          },
        }),
    );
    seededUserIds.push(superAdmin.id);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: superAdmin.email, password: 'E2E-test-pass-123' })
      .expect(200);
    const accessToken = (loginRes.body as { accessToken: string }).accessToken;

    const homeRes = await request(app.getHttpServer())
      .post('/homes')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `E2E Home ${Date.now()}`, timezone: 'Europe/Madrid' })
      .expect(201);
    const homeId = (homeRes.body as { id: string }).id;
    seededHomeIds.push(homeId);

    const inviteEmail = `new-admin-${Date.now()}@e2e.evergreen.test`;
    const inviteRes = await request(app.getHttpServer())
      .post(`/homes/${homeId}/admins`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: inviteEmail })
      .expect(201);

    const invitedUserId = (inviteRes.body as { id: string }).id;
    seededUserIds.push(invitedUserId);
    expect(inviteRes.body).toEqual({
      id: invitedUserId,
      email: inviteEmail,
      role: 'admin',
      isActive: false,
      homeId,
    });
    expect(inviteRes.body).not.toHaveProperty('passwordHash');

    // The actual regression this test guards: read the HomeMembership row
    // back through the real tenant-scoping extension (bypass mode, same as
    // production's cross-home reads) and confirm home_id landed correctly —
    // this is exactly what @BypassTenantScope() + the extension's bypass
    // branch are responsible for getting right.
    //
    // The query MUST be awaited *inside* the run() callback (not just
    // returned) — Prisma's `.findFirst()` returns a lazy PrismaPromise, and
    // `AsyncLocalStorage.run()` only keeps its store active for async work
    // actually spawned during the callback's execution. Returning the
    // unresolved PrismaPromise and awaiting it outside `run()` lets the
    // context exit before the extension's `$allOperations` hook (which
    // reads `tenantContext.getStore()`) ever runs, and the query fails with
    // "no home_id in request context" — reproduced while writing this test.
    const membership = await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.homeMembership.findFirst({
          where: { userId: invitedUserId },
        }),
    );
    expect(membership?.homeId).toBe(homeId);
    expect(membership?.role).toBe('admin');

    const resetToken = await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.passwordResetToken.findFirst({
          where: { userId: invitedUserId },
        }),
    );
    expect(resetToken).not.toBeNull();
    expect(resetToken?.usedAt).toBeNull();
    expect(resetToken?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  // Code-review finding: class-validator's @IsEmail() rejects leading/
  // trailing whitespace outright, which would 400 before HomesService's own
  // .trim() ever ran. InviteHomeAdminDto now trims via @Transform before
  // validation (same fix already applied to CreateSuperAdminDto in Story
  // 1.4) — this is the real HTTP-path proof that fix works, since a unit
  // test calling the service directly bypasses the DTO entirely.
  it('accepts a whitespace-padded email (trimmed by the DTO before validation)', async () => {
    const passwordService = app.get(PasswordService);
    const passwordHash = await passwordService.hash('E2E-test-pass-123');

    const superAdmin = await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.user.create({
          data: {
            email: `super-admin-${Date.now()}@e2e.evergreen.test`,
            passwordHash,
            role: 'super_admin',
            isActive: true,
          },
        }),
    );
    seededUserIds.push(superAdmin.id);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: superAdmin.email, password: 'E2E-test-pass-123' })
      .expect(200);
    const accessToken = (loginRes.body as { accessToken: string }).accessToken;

    const homeRes = await request(app.getHttpServer())
      .post('/homes')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `E2E Home ${Date.now()}`, timezone: 'Europe/Madrid' })
      .expect(201);
    const homeId = (homeRes.body as { id: string }).id;
    seededHomeIds.push(homeId);

    const rawEmail = `padded-admin-${Date.now()}@e2e.evergreen.test`;
    const inviteRes = await request(app.getHttpServer())
      .post(`/homes/${homeId}/admins`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: `  ${rawEmail}  ` })
      .expect(201);

    const invitedUserId = (inviteRes.body as { id: string }).id;
    seededUserIds.push(invitedUserId);
    expect((inviteRes.body as { email: string }).email).toBe(rawEmail);
  });

  // Code-review finding (Acceptance Auditor): the original manual E2E
  // transcript verified "no bearer token -> 401" (authentication) and
  // mislabeled it as covering AC #4, which is actually about authorization
  // ("authenticated but not super_admin -> 403"). This test covers the
  // scenario AC #4 actually describes.
  it('rejects an authenticated non-super_admin with 403', async () => {
    const passwordService = app.get(PasswordService);
    const passwordHash = await passwordService.hash('E2E-test-pass-123');

    const home = await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.home.create({
          data: {
            name: `E2E Staff Home ${Date.now()}`,
            timezone: 'Europe/Madrid',
          },
        }),
    );
    seededHomeIds.push(home.id);

    const staff = await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.user.create({
          data: {
            email: `staff-${Date.now()}@e2e.evergreen.test`,
            passwordHash,
            role: 'staff',
            isActive: true,
          },
        }),
    );
    seededUserIds.push(staff.id);

    await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.homeMembership.create({
          data: { userId: staff.id, homeId: home.id, role: 'staff' },
        }),
    );

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: staff.email, password: 'E2E-test-pass-123' })
      .expect(200);
    const staffAccessToken = (loginRes.body as { accessToken: string })
      .accessToken;

    await request(app.getHttpServer())
      .post(`/homes/${home.id}/admins`)
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .send({ email: `blocked-${Date.now()}@e2e.evergreen.test` })
      .expect(403);
  });

  // deferred-work.md: a non-UUID :id used to reach an unguarded Postgres
  // cast (findUnique({ where: { id } })) and surface a raw 500 instead of a
  // clean client error. ParseUUIDPipe on the :id param now rejects it at
  // the routing layer, before any Prisma call.
  it('rejects a non-UUID :id with 400 instead of a raw 500', async () => {
    const passwordService = app.get(PasswordService);
    const passwordHash = await passwordService.hash('E2E-test-pass-123');

    const superAdmin = await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.user.create({
          data: {
            email: `super-admin-${Date.now()}@e2e.evergreen.test`,
            passwordHash,
            role: 'super_admin',
            isActive: true,
          },
        }),
    );
    seededUserIds.push(superAdmin.id);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: superAdmin.email, password: 'E2E-test-pass-123' })
      .expect(200);
    const accessToken = (loginRes.body as { accessToken: string }).accessToken;

    await request(app.getHttpServer())
      .get('/homes/not-a-uuid')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .patch('/homes/not-a-uuid')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ address: 'New address' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/homes/not-a-uuid/admins')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: `blocked-${Date.now()}@e2e.evergreen.test` })
      .expect(400);
  });
});
