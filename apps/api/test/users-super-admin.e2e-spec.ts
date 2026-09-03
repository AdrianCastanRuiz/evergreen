import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PasswordService } from './../src/auth/password.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { TenantContextService } from './../src/common/tenant/tenant-context.service';

// Story 1.4: first write path that creates a User with zero HomeMembership
// rows on purpose. Written up front as part of the story (not as a code
// review follow-up, unlike Story 1.3) — exercises the real Nest app + real
// Postgres, per this codebase's precedent that mocked tests alone have
// missed real tenant-context bugs on new write paths (Stories 1.3, 1.6).
describe('Users — create super admin (e2e)', () => {
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

  it('creates a pending super_admin User with zero HomeMembership rows', async () => {
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

    const newSuperAdminEmail = `new-super-${Date.now()}@e2e.evergreen.test`;
    const createRes = await request(app.getHttpServer())
      .post('/users/super-admins')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: newSuperAdminEmail })
      .expect(201);

    const createdUserId = (createRes.body as { id: string }).id;
    seededUserIds.push(createdUserId);
    expect(createRes.body).toEqual({
      id: createdUserId,
      email: newSuperAdminEmail,
      // Pre-existing gap, unrelated to Story 2.2: this assertion predates
      // the invitee-name-capture feature (commit e1a75f9) and never picked
      // up the response's `name` field.
      name: null,
      role: 'super_admin',
      isActive: false,
      homeId: null,
    });
    expect(createRes.body).not.toHaveProperty('passwordHash');

    const membership = await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.homeMembership.findFirst({
          where: { userId: createdUserId },
        }),
    );
    expect(membership).toBeNull();

    const resetToken = await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.passwordResetToken.findFirst({
          where: { userId: createdUserId },
        }),
    );
    expect(resetToken).not.toBeNull();
    expect(resetToken?.usedAt).toBeNull();
    expect(resetToken?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  // Code-review finding: class-validator's @IsEmail() rejects leading/
  // trailing whitespace outright, which would 400 before UsersService's own
  // .trim() ever ran. CreateSuperAdminDto now trims via @Transform before
  // validation — this is the real HTTP-path proof that fix works, since the
  // unit test that calls the service directly bypasses the DTO entirely.
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

    const paddedEmail = `  padded-${Date.now()}@e2e.evergreen.test  `;
    const createRes = await request(app.getHttpServer())
      .post('/users/super-admins')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: paddedEmail })
      .expect(201);

    seededUserIds.push((createRes.body as { id: string }).id);
    expect(createRes.body).toMatchObject({ email: paddedEmail.trim() });
  });

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
      .post('/users/super-admins')
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .send({ email: `blocked-${Date.now()}@e2e.evergreen.test` })
      .expect(403);
  });
});
