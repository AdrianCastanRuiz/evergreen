import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { ContentType } from './../generated/prisma';
import { AppModule } from './../src/app.module';
import { PasswordService } from './../src/auth/password.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { TenantContextService } from './../src/common/tenant/tenant-context.service';

// Story 3.1: home admin/staff manages content items (news/notice/
// announcement/static_page/document/schedule) scoped to their own home.
// Exercises the same non-bypass tenant-scoping branch as
// residents-manage-home.e2e-spec.ts — `ContentItem` is already tenant-scoped,
// so the cross-home case (AC #8) must resolve to a 404, never another home's
// row. This is also the first e2e spec to assert the `{ data, meta }`
// pagination envelope, since GET /content is the first endpoint to emit one.
//
// POST /auth/login is throttled to 5/min per IP (NFR10/AD-8), shared by
// every test in this file. A shared admin/staff/family login in beforeAll,
// reused across every test below, keeps this file's total login-endpoint
// calls low.
describe('Content — manage home content (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tenantContext: TenantContextService;
  let passwordService: PasswordService;

  const seededUserIds: string[] = [];
  const seededHomeIds: string[] = [];
  const seededContentIds: string[] = [];
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

    homeA = await seedHome(`E2E Content Home A ${Date.now()}`);
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
        await prisma.client.contentItem.deleteMany({
          where: { id: { in: seededContentIds } },
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

  async function seedContentItem(
    homeId: string,
    createdById: string,
    overrides: Partial<{
      type: ContentType;
      title: string;
      publishedAt: Date | null;
    }> = {},
  ): Promise<string> {
    const item = await tenantContext.run(
      { userId: null, role: 'super_admin', homeId: null, bypass: true },
      async () =>
        await prisma.client.contentItem.create({
          data: {
            homeId,
            createdById,
            type: overrides.type ?? 'news',
            title: overrides.title ?? 'Seeded item',
            body: 'Seeded body',
            publishedAt: overrides.publishedAt,
          },
        }),
    );
    seededContentIds.push(item.id);
    return item.id;
  }

  // Consumes one of this file's 5/min login-endpoint budget — call sparingly.
  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return (res.body as { accessToken: string }).accessToken;
  }

  it('returns the empty-state pagination envelope when the home has no content of a type yet (AC #7)', async () => {
    const homeEmpty = await seedHome(`E2E Content Empty Home ${Date.now()}`);
    const adminEmpty = await seedActiveUser('admin', [homeEmpty]);
    const adminEmptyToken = await login(adminEmpty.email);

    const res = await request(app.getHttpServer())
      .get('/content?type=news')
      .set('Authorization', `Bearer ${adminEmptyToken}`)
      .expect(200);

    expect(res.body).toEqual({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });
  });

  it('creates a content item scoped to the caller home admin own home (AC #1)', async () => {
    const res = await request(app.getHttpServer())
      .post('/content')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ type: 'news', title: 'Spring Fair', body: 'Join us!' })
      .expect(201);

    const created = res.body as { id: string; type: string; title: string };
    seededContentIds.push(created.id);
    expect(created.type).toBe('news');
    expect(created.title).toBe('Spring Fair');

    const listRes = await request(app.getHttpServer())
      .get('/content?type=news')
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    const ids = (listRes.body as { data: { id: string }[] }).data.map(
      (i) => i.id,
    );
    expect(ids).toContain(created.id);
  });

  it('also allows a staff caller to create content (AC #1, AC #9 differs from ResidentsController)', async () => {
    const res = await request(app.getHttpServer())
      .post('/content')
      .set('Authorization', `Bearer ${staffAToken}`)
      .send({ type: 'notice', title: 'Staff notice', body: 'From staff' })
      .expect(201);

    seededContentIds.push((res.body as { id: string }).id);
  });

  it('rejects an invalid type with 400 (AC #3)', async () => {
    await request(app.getHttpServer())
      .post('/content')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ type: 'not-a-real-type', title: 'Bad', body: 'Bad' })
      .expect(400);
  });

  it('populates and returns attachmentUrl for a document item (AC #2)', async () => {
    const res = await request(app.getHttpServer())
      .post('/content')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        type: 'document',
        title: 'Weekly Menu',
        body: 'See attached',
        attachmentUrl: 'https://example.com/menu.pdf',
      })
      .expect(201);

    const created = res.body as { id: string; attachmentUrl: string };
    seededContentIds.push(created.id);
    expect(created.attachmentUrl).toBe('https://example.com/menu.pdf');
  });

  it('publishes a draft item, then edits stay reflected without needing to re-publish (AC #4, AC #5)', async () => {
    const id = await seedContentItem(homeA, adminA.id, { title: 'Draft item' });

    const publishRes = await request(app.getHttpServer())
      .post(`/content/${id}/publish`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(201);
    expect(
      (publishRes.body as { publishedAt: string | null }).publishedAt,
    ).not.toBeNull();

    await request(app.getHttpServer())
      .patch(`/content/${id}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ title: 'Edited after publish' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/content/${id}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    const body = res.body as { title: string; publishedAt: string | null };
    expect(body.title).toBe('Edited after publish');
    expect(body.publishedAt).not.toBeNull();
  });

  it('deletes a content item and it immediately disappears (AC #6)', async () => {
    const id = await seedContentItem(homeA, adminA.id, { title: 'To delete' });

    await request(app.getHttpServer())
      .delete(`/content/${id}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/content/${id}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(404);
  });

  it('rejects reading/editing/deleting content outside the caller home with 404, never another home data (AC #8)', async () => {
    const homeB = await seedHome(`E2E Content Home B ${Date.now()}`);
    const adminB = await seedActiveUser('admin', [homeB]);
    const itemB = await seedContentItem(homeB, adminB.id, {
      title: 'Home B item',
    });

    await request(app.getHttpServer())
      .get(`/content/${itemB}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/content/${itemB}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ title: 'Hijacked' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/content/${itemB}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(404);

    const listRes = await request(app.getHttpServer())
      .get('/content')
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    const ids = (listRes.body as { data: { id: string }[] }).data.map(
      (i) => i.id,
    );
    expect(ids).not.toContain(itemB);
  });

  it('rejects a family caller — content management is admin/staff-only (AC #9)', async () => {
    const id = await seedContentItem(homeA, adminA.id, {
      title: 'Guarded item',
    });

    await request(app.getHttpServer())
      .get('/content')
      .set('Authorization', `Bearer ${familyAToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post('/content')
      .set('Authorization', `Bearer ${familyAToken}`)
      .send({ type: 'news', title: 'Nope', body: 'Nope' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/content/${id}`)
      .set('Authorization', `Bearer ${familyAToken}`)
      .send({ title: 'Nope' })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/content/${id}`)
      .set('Authorization', `Bearer ${familyAToken}`)
      .expect(403);
  });

  it('paginates results honoring page/pageSize (pagination envelope)', async () => {
    const homePage = await seedHome(`E2E Content Page Home ${Date.now()}`);
    const adminPage = await seedActiveUser('admin', [homePage]);
    const adminPageToken = await login(adminPage.email);

    for (let i = 0; i < 3; i++) {
      await seedContentItem(homePage, adminPage.id, {
        title: `Announcement ${i}`,
        type: 'announcement',
      });
    }

    const res = await request(app.getHttpServer())
      .get('/content?type=announcement&page=1&pageSize=2')
      .set('Authorization', `Bearer ${adminPageToken}`)
      .expect(200);

    const body = res.body as {
      data: { id: string }[];
      meta: { page: number; pageSize: number; total: number };
    };
    expect(body.data).toHaveLength(2);
    expect(body.meta).toEqual({ page: 1, pageSize: 2, total: 3 });
  });
});
