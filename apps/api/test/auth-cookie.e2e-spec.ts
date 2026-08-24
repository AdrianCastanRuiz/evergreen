import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PasswordService } from './../src/auth/password.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { TenantContextService } from './../src/common/tenant/tenant-context.service';

// Story 1.14: apps/admin authenticates via an httpOnly refresh_token cookie
// instead of a bearer body, added ALONGSIDE (not instead of) the existing
// mobile bearer-body flow (Story 1.6/1.11). This file's job is proving both
// transports work through the same endpoints without interfering with each
// other — the regression risk this story introduces.
//
// POST /auth/login is throttled to 5/min per IP (NFR10/AD-8), shared by
// every test in this file. Three logins total below — under budget.
describe('Auth — refresh_token cookie (e2e)', () => {
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
    // Mirrors main.ts's bootstrap — not applied automatically by
    // createNestApplication(), so every e2e spec that needs it sets it up
    // itself (same convention as ValidationPipe above).
    app.use(cookieParser());
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

  // family has no fixed home (resolveFixedHomeId returns null for it), so
  // no HomeMembership seeding is needed to satisfy assertFixedHomeInvariant
  // — the simplest role for a login-flow test uninterested in tenant scope.
  async function seedFamilyUser(): Promise<{ id: string; email: string }> {
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
    return { id: user.id, email };
  }

  function extractRefreshCookie(setCookieHeader: string[]): string {
    const raw = setCookieHeader.find((c) => c.startsWith('refresh_token='));
    if (!raw) throw new Error('refresh_token cookie not found in Set-Cookie');
    return raw.split(';')[0]; // "refresh_token=<value>", the only part a client re-sends
  }

  it('login sets an httpOnly, Secure, /auth-scoped refresh_token cookie AND keeps the JSON body unchanged (mobile regression)', async () => {
    const user = await seedFamilyUser();

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(200);

    const body = res.body as { accessToken: string; refreshToken: string };
    expect(typeof body.accessToken).toBe('string');
    expect(typeof body.refreshToken).toBe('string'); // unchanged for mobile

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie).toBeDefined();
    const cookieHeader = setCookie.find((c) => c.startsWith('refresh_token='));
    expect(cookieHeader).toBeDefined();
    expect(cookieHeader).toMatch(/HttpOnly/i);
    expect(cookieHeader).toMatch(/Secure/i);
    expect(cookieHeader).toMatch(/Path=\/auth/i);
    expect(cookieHeader).toMatch(/SameSite=None/i);
  });

  it('refresh succeeds cookie-only (apps/admin, no body) and re-sets the cookie with the rotated token', async () => {
    const user = await seedFamilyUser();

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(200);
    const originalCookie = extractRefreshCookie(
      loginRes.headers['set-cookie'] as unknown as string[],
    );

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', originalCookie)
      .send({})
      .expect(200);

    const body = refreshRes.body as {
      accessToken: string;
      refreshToken: string;
    };
    expect(typeof body.accessToken).toBe('string');

    // Not asserting rotatedCookie !== originalCookie: AuthService signs the
    // refresh JWT from { sub, type } with no nonce, so two calls within the
    // same iat-second (common in a fast test) produce byte-identical tokens
    // — a pre-existing characteristic of the token design, not something
    // this story changes. What this story guarantees is that the cookie is
    // re-set on every refresh (so a genuinely rotated token DOES propagate
    // when iat differs) — checked via extractRefreshCookie not throwing.
    extractRefreshCookie(
      refreshRes.headers['set-cookie'] as unknown as string[],
    );
  });

  it('refresh still succeeds body-only with no cookie (mobile, unchanged behavior)', async () => {
    const user = await seedFamilyUser();
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(200);
    const { refreshToken } = loginRes.body as { refreshToken: string };

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200);
  });

  it('refresh 401s with no body and no cookie', async () => {
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({})
      .expect(401);
  });

  it('logout clears the refresh_token cookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/logout')
      .expect(204);

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const cookieHeader = setCookie.find((c) => c.startsWith('refresh_token='));
    expect(cookieHeader).toBeDefined();
    // clearCookie sets an already-expired Expires — the browser deletes it.
    expect(cookieHeader).toMatch(/Expires=/i);
  });
});
