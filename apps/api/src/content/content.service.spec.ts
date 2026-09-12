import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../../generated/prisma';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { ContentService } from './content.service';

describe('ContentService', () => {
  let contentService: ContentService;
  let prisma: {
    client: {
      contentItem: {
        create: jest.Mock;
        findMany: jest.Mock;
        count: jest.Mock;
        findUnique: jest.Mock;
        update: jest.Mock;
        delete: jest.Mock;
      };
    };
  };

  const homeId = 'home-1';
  const userId = 'user-1';
  let callerRole: 'admin' | 'staff' | 'family' = 'admin';

  const recordNotFoundViolation = new Prisma.PrismaClientKnownRequestError(
    'not found',
    { code: 'P2025', clientVersion: 'test' },
  );

  const item = {
    id: 'content-1',
    homeId,
    type: 'news' as const,
    title: 'New Physiotherapy Sessions',
    body: 'Weekly sessions now available.',
    attachmentUrl: null,
    publishedAt: null,
    createdById: userId,
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-01'),
  };

  beforeEach(async () => {
    callerRole = 'admin';
    prisma = {
      client: {
        contentItem: {
          create: jest.fn(),
          findMany: jest.fn(),
          count: jest.fn(),
          findUnique: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: TenantContextService,
          useValue: {
            getHomeId: jest.fn().mockReturnValue(homeId),
            getUserId: jest.fn().mockReturnValue(userId),
            getStore: jest.fn(() => ({ role: callerRole })),
          },
        },
      ],
    }).compile();

    contentService = module.get(ContentService);
  });

  describe('create', () => {
    it('creates a content item scoped to the caller home and creator (AC #1)', async () => {
      prisma.client.contentItem.create.mockResolvedValue(item);

      const dto = { type: 'news' as const, title: item.title, body: item.body };
      await expect(contentService.create(dto)).resolves.toEqual(item);
      expect(prisma.client.contentItem.create).toHaveBeenCalledWith({
        data: {
          homeId,
          createdById: userId,
          type: 'news',
          title: item.title,
          body: item.body,
          attachmentUrl: undefined,
        },
      });
    });

    it('accepts an attachmentUrl for a document item (AC #2)', async () => {
      prisma.client.contentItem.create.mockResolvedValue({
        ...item,
        type: 'document',
        attachmentUrl: 'https://example.com/menu.pdf',
      });

      await contentService.create({
        type: 'document',
        title: 'Weekly menu',
        body: 'See attached',
        attachmentUrl: 'https://example.com/menu.pdf',
      });

      expect(prisma.client.contentItem.create).toHaveBeenCalledWith({
        data: {
          homeId,
          createdById: userId,
          type: 'document',
          title: 'Weekly menu',
          body: 'See attached',
          attachmentUrl: 'https://example.com/menu.pdf',
        },
      });
    });
  });

  describe('findAll', () => {
    it('returns a paginated envelope with defaults when page/pageSize are omitted', async () => {
      prisma.client.contentItem.findMany.mockResolvedValue([item]);
      prisma.client.contentItem.count.mockResolvedValue(1);

      await expect(contentService.findAll({})).resolves.toEqual({
        data: [item],
        meta: { page: 1, pageSize: 20, total: 1 },
      });
      expect(prisma.client.contentItem.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(prisma.client.contentItem.count).toHaveBeenCalledWith({
        where: {},
      });
    });

    it('filters by type and computes skip from page/pageSize', async () => {
      prisma.client.contentItem.findMany.mockResolvedValue([]);
      prisma.client.contentItem.count.mockResolvedValue(0);

      await contentService.findAll({ type: 'document', page: 2, pageSize: 10 });

      expect(prisma.client.contentItem.findMany).toHaveBeenCalledWith({
        where: { type: 'document' },
        orderBy: { createdAt: 'desc' },
        skip: 10,
        take: 10,
      });
      expect(prisma.client.contentItem.count).toHaveBeenCalledWith({
        where: { type: 'document' },
      });
    });

    it('returns an empty page for a type with no content yet (AC #7)', async () => {
      prisma.client.contentItem.findMany.mockResolvedValue([]);
      prisma.client.contentItem.count.mockResolvedValue(0);

      await expect(
        contentService.findAll({ type: 'schedule' }),
      ).resolves.toEqual({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      });
    });

    it('forces publishedAt: { not: null } for a family caller, even with a type filter (Story 3.2 AC #8)', async () => {
      callerRole = 'family';
      prisma.client.contentItem.findMany.mockResolvedValue([]);
      prisma.client.contentItem.count.mockResolvedValue(0);

      await contentService.findAll({ type: 'news' });

      expect(prisma.client.contentItem.findMany).toHaveBeenCalledWith({
        where: { type: 'news', publishedAt: { not: null } },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(prisma.client.contentItem.count).toHaveBeenCalledWith({
        where: { type: 'news', publishedAt: { not: null } },
      });
    });

    it('does NOT force publishedAt for a staff caller, even when a draft exists (Story 3.2 AC #8)', async () => {
      callerRole = 'staff';
      prisma.client.contentItem.findMany.mockResolvedValue([item]);
      prisma.client.contentItem.count.mockResolvedValue(1);

      await contentService.findAll({});

      expect(prisma.client.contentItem.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
    });

    // Review finding: the test above only exercised 'staff' under an
    // "admin/staff" title — admin's exemption was only implicitly covered
    // via an unrelated pre-existing test defaulting to 'admin'. Explicit now.
    it('does NOT force publishedAt for an admin caller either, even when a draft exists (Story 3.2 AC #8)', async () => {
      callerRole = 'admin';
      prisma.client.contentItem.findMany.mockResolvedValue([item]);
      prisma.client.contentItem.count.mockResolvedValue(1);

      await contentService.findAll({});

      expect(prisma.client.contentItem.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
    });
  });

  describe('findOne', () => {
    it('returns the item when found', async () => {
      prisma.client.contentItem.findUnique.mockResolvedValue(item);

      await expect(contentService.findOne(item.id)).resolves.toEqual(item);
    });

    it('throws NotFoundException when missing or scoped to another home (AC #8)', async () => {
      prisma.client.contentItem.findUnique.mockResolvedValue(null);

      await expect(
        contentService.findOne('other-home-item'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s a draft item for a family caller — never leaks that a draft exists (Story 3.2 AC #8)', async () => {
      callerRole = 'family';
      prisma.client.contentItem.findUnique.mockResolvedValue(item); // item.publishedAt is null

      await expect(contentService.findOne(item.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns a published item to a family caller', async () => {
      callerRole = 'family';
      const published = { ...item, publishedAt: new Date('2026-03-05') };
      prisma.client.contentItem.findUnique.mockResolvedValue(published);

      await expect(contentService.findOne(item.id)).resolves.toEqual(published);
    });
  });

  describe('update', () => {
    it('updates title/body', async () => {
      prisma.client.contentItem.findUnique.mockResolvedValue(item);
      const updated = { ...item, title: 'Updated title' };
      prisma.client.contentItem.update.mockResolvedValue(updated);

      await expect(
        contentService.update(item.id, { title: 'Updated title' }),
      ).resolves.toEqual(updated);
      expect(prisma.client.contentItem.update).toHaveBeenCalledWith({
        where: { id: item.id },
        data: {
          title: 'Updated title',
          body: undefined,
          attachmentUrl: undefined,
        },
      });
    });

    it('clears attachmentUrl when explicitly set to null, distinct from leaving it untouched', async () => {
      prisma.client.contentItem.findUnique.mockResolvedValue(item);
      prisma.client.contentItem.update.mockResolvedValue({
        ...item,
        attachmentUrl: null,
      });

      await contentService.update(item.id, { attachmentUrl: null });

      expect(prisma.client.contentItem.update).toHaveBeenCalledWith({
        where: { id: item.id },
        data: { title: undefined, body: undefined, attachmentUrl: null },
      });
    });

    it('leaves attachmentUrl untouched when the field is not sent at all', async () => {
      prisma.client.contentItem.findUnique.mockResolvedValue(item);
      prisma.client.contentItem.update.mockResolvedValue(item);

      await contentService.update(item.id, { title: 'New Name' });

      expect(prisma.client.contentItem.update).toHaveBeenCalledWith({
        where: { id: item.id },
        data: { title: 'New Name', body: undefined, attachmentUrl: undefined },
      });
    });

    it('reflects an edit to a published item immediately without touching publishedAt (AC #5)', async () => {
      const published = { ...item, publishedAt: new Date('2026-03-05') };
      prisma.client.contentItem.findUnique.mockResolvedValue(published);
      prisma.client.contentItem.update.mockResolvedValue({
        ...published,
        title: 'Edited',
      });

      await contentService.update(item.id, { title: 'Edited' });

      expect(prisma.client.contentItem.update).toHaveBeenCalledWith({
        where: { id: item.id },
        data: { title: 'Edited', body: undefined, attachmentUrl: undefined },
      });
    });

    it('throws NotFoundException when the item does not exist', async () => {
      prisma.client.contentItem.findUnique.mockResolvedValue(null);

      await expect(
        contentService.update('missing', { title: 'New Name' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.client.contentItem.update).not.toHaveBeenCalled();
    });

    it('maps a concurrent-delete race (P2025) to NotFoundException instead of a raw 500 (review finding)', async () => {
      prisma.client.contentItem.findUnique.mockResolvedValue(item);
      prisma.client.contentItem.update.mockRejectedValue(
        recordNotFoundViolation,
      );

      await expect(
        contentService.update(item.id, { title: 'New Name' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('publish', () => {
    it('sets publishedAt on a draft item (AC #4)', async () => {
      prisma.client.contentItem.findUnique.mockResolvedValue(item);
      const published = { ...item, publishedAt: new Date() };
      prisma.client.contentItem.update.mockResolvedValue(published);

      await expect(contentService.publish(item.id)).resolves.toEqual(published);
      expect(prisma.client.contentItem.update).toHaveBeenCalledWith({
        where: { id: item.id },
        data: { publishedAt: expect.any(Date) as Date },
      });
    });

    it('is a harmless no-op on an already-published item — no second write', async () => {
      const published = { ...item, publishedAt: new Date('2026-03-01') };
      prisma.client.contentItem.findUnique.mockResolvedValue(published);

      await expect(contentService.publish(item.id)).resolves.toEqual(published);
      expect(prisma.client.contentItem.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an item outside the caller home', async () => {
      prisma.client.contentItem.findUnique.mockResolvedValue(null);

      await expect(
        contentService.publish('other-home-item'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('maps a concurrent-delete race (P2025) to NotFoundException instead of a raw 500 (review finding)', async () => {
      prisma.client.contentItem.findUnique.mockResolvedValue(item);
      prisma.client.contentItem.update.mockRejectedValue(
        recordNotFoundViolation,
      );

      await expect(contentService.publish(item.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('deletes the item (AC #6)', async () => {
      prisma.client.contentItem.findUnique.mockResolvedValue(item);
      prisma.client.contentItem.delete.mockResolvedValue(item);

      await contentService.remove(item.id);

      expect(prisma.client.contentItem.delete).toHaveBeenCalledWith({
        where: { id: item.id },
      });
    });

    it('throws NotFoundException for an item outside the caller home (AC #8)', async () => {
      prisma.client.contentItem.findUnique.mockResolvedValue(null);

      await expect(
        contentService.remove('other-home-item'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.client.contentItem.delete).not.toHaveBeenCalled();
    });

    it('maps a concurrent-delete race (P2025) to NotFoundException instead of a raw 500 (review finding)', async () => {
      prisma.client.contentItem.findUnique.mockResolvedValue(item);
      prisma.client.contentItem.delete.mockRejectedValue(
        recordNotFoundViolation,
      );

      await expect(contentService.remove(item.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
