import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PasswordService } from './../src/auth/password.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { TenantContextService } from './../src/common/tenant/tenant-context.service';

// Story 1.9 (FR4): any logged-in user views/edits their own name/email via
// PATCH /auth/me. Uses family (no fixed home, per Auth cookie e2e's own
// precedent) since this endpoint's behavior doesn't depend on tenant scope.
describe('Auth — PATCH /auth/me (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tenantContext: TenantContextService;
  let passwordService: PasswordService;

  const seededUserIds: string[] = [];
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
        await prisma.client.user.deleteMany({
          where: { id: { in: seededUserIds } },
        });
      },
    );
    await app.close();
  });

  async function seedFamilyUser(): Promise<{
    id: string;
    email: string;
    accessToken: string;
  }> {
    const passwordHash = await passwordService.hash(PASSWORD);
    const email = `family-${Date.now()}-${Math.random().toString(36).slice(2)}@e2e.evergreen.test`;
    const user = await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.user.create({
          data: { email, passwordHash, role: 'family', isActive: true },
        }),
    );
    seededUserIds.push(user.id);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    const { accessToken } = loginRes.body as { accessToken: string };

    return { id: user.id, email, accessToken };
  }

  it('updates the name only, leaving email unchanged', async () => {
    const user = await seedFamilyUser();

    const res = await request(app.getHttpServer())
      .patch('/auth/me')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'New Name' })
      .expect(200);

    const body = res.body as { name: string; email: string };
    expect(body.name).toBe('New Name');
    expect(body.email).toBe(user.email);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect((me.body as { name: string }).name).toBe('New Name');
  });

  it('updates the email, normalized (trimmed + lowercased)', async () => {
    const user = await seedFamilyUser();
    const newEmail = `  Updated-${Date.now()}@E2E.evergreen.test  `;

    const res = await request(app.getHttpServer())
      .patch('/auth/me')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ email: newEmail })
      .expect(200);

    expect((res.body as { email: string }).email).toBe(
      newEmail.trim().toLowerCase(),
    );
  });

  it('rejects a duplicate email with 409, not a generic 500', async () => {
    const userA = await seedFamilyUser();
    const userB = await seedFamilyUser();

    await request(app.getHttpServer())
      .patch('/auth/me')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ email: userA.email })
      .expect(409);
  });

  it('rejects a malformed email with 400', async () => {
    const user = await seedFamilyUser();

    await request(app.getHttpServer())
      .patch('/auth/me')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ email: 'not-an-email' })
      .expect(400);
  });

  it('rejects an unauthenticated request with 401', async () => {
    await request(app.getHttpServer())
      .patch('/auth/me')
      .send({ name: 'Nobody' })
      .expect(401);
  });
});
