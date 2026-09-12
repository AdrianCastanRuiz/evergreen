import { Injectable, NotFoundException } from '@nestjs/common';
import type { ContentItem } from '../../generated/prisma';
import { Prisma } from '../../generated/prisma';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContentItemDto } from './dto/create-content-item.dto';
import { QueryContentDto } from './dto/query-content.dto';
import { UpdateContentItemDto } from './dto/update-content-item.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

// Story 3.1: mirrors packages/shared-types/src/common.ts's PaginatedResponse<T>
// — declared locally rather than imported, same "mirrored, not shared"
// convention every other apps/api response type already follows (e.g.
// ResidentsService's LinkedResident), so the API never depends on the
// shared-types package at runtime.
export interface PaginatedContentItems {
  data: ContentItem[];
  meta: { page: number; pageSize: number; total: number };
}

// Story 3.1: `ContentItem` is already in TENANT_SCOPED_MODELS
// (apps/api/src/prisma/tenant-scoped-models.ts), so every call below is
// auto-scoped to the caller's home_id by the tenant-scoping Prisma
// extension — no manual home_id filtering, same shape as ResidentsService.
@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  create(dto: CreateContentItemDto): Promise<ContentItem> {
    return this.prisma.client.contentItem.create({
      data: {
        // Required by Prisma's generated (Unchecked)CreateInput type for a
        // relation scalar; the tenant-scoping extension overwrites this with
        // the same value at runtime regardless (same redundant-but-explicit
        // convention as ResidentsService.create). Safe non-null read:
        // ContentController calls assertHomeContext() before every method.
        homeId: this.tenantContext.getHomeId()!,
        createdById: this.tenantContext.getUserId()!,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        attachmentUrl: dto.attachmentUrl,
      },
    });
  }

  async findAll(query: QueryContentDto): Promise<PaginatedContentItems> {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where: Prisma.ContentItemWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      // Story 3.2 (AC #8): never trust a query param to hide drafts from
      // family — this is authorization-shaping business logic, not the
      // tenant-scoping extension's job (that only handles home_id). Forced
      // regardless of anything the caller sends; admin/staff see both.
      ...(this.isFamilyCaller() ? { publishedAt: { not: null } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.client.contentItem.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.client.contentItem.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  async findOne(id: string): Promise<ContentItem> {
    const item = await this.prisma.client.contentItem.findUnique({
      where: { id },
    });
    // Auto-scoped by the tenant extension — a content id from another home
    // resolves to null here, never another home's row (AC #8).
    if (!item) throw new NotFoundException('Content item not found');
    // Story 3.2 (AC #8): a family caller reading a draft by id gets the same
    // 404 as a missing/cross-home item — never a 200 with a hidden draft,
    // which would leak that a draft exists at all.
    if (this.isFamilyCaller() && !item.publishedAt) {
      throw new NotFoundException('Content item not found');
    }
    return item;
  }

  private isFamilyCaller(): boolean {
    return this.tenantContext.getStore()?.role === 'family';
  }

  async update(id: string, dto: UpdateContentItemDto): Promise<ContentItem> {
    await this.findOne(id);
    try {
      return await this.prisma.client.contentItem.update({
        where: { id },
        data: {
          title: dto.title,
          body: dto.body,
          // Distinguishes "field not sent" (undefined — leave alone) from
          // "clear this field" (null — explicit), same convention as
          // ResidentsService.update's dob handling.
          attachmentUrl: dto.attachmentUrl,
        },
      });
    } catch (error) {
      // Review finding: a concurrent delete between the findOne check above
      // and this update would otherwise surface as a raw 500 (Prisma P2025)
      // instead of the clean 404 every other cross-home/missing-row case
      // in this module already returns.
      throw this.mapRecordNotFoundViolation(error);
    }
  }

  // Story 3.1 (AC #4): publish is a dedicated action, not a PATCH field —
  // sets publishedAt only when currently null. Calling it again on an
  // already-published item is a harmless no-op (never a surprising
  // timestamp jump from an accidental double-click).
  async publish(id: string): Promise<ContentItem> {
    const item = await this.findOne(id);
    if (item.publishedAt) return item;
    try {
      return await this.prisma.client.contentItem.update({
        where: { id },
        data: { publishedAt: new Date() },
      });
    } catch (error) {
      throw this.mapRecordNotFoundViolation(error);
    }
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    try {
      await this.prisma.client.contentItem.delete({ where: { id } });
    } catch (error) {
      throw this.mapRecordNotFoundViolation(error);
    }
  }

  // Review finding: shared by update/publish/remove — maps a concurrent
  // delete racing the findOne-then-mutate window to the same 404 every
  // other missing-row case already returns, same shape as
  // ResidentsService.mapRecordNotFoundViolation.
  private mapRecordNotFoundViolation(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      return new NotFoundException('Content item not found');
    }
    return error;
  }
}
