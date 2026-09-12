import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { ContentItem } from '../../generated/prisma';
import { Roles } from '../common/auth/roles.decorator';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { ContentService, PaginatedContentItems } from './content.service';
import { CreateContentItemDto } from './dto/create-content-item.dto';
import { QueryContentDto } from './dto/query-content.dto';
import { UpdateContentItemDto } from './dto/update-content-item.dto';

// Story 3.1 (AC #9): `@Roles('admin', 'staff')` at class level, NOT
// admin-only — this differs from ResidentsController on purpose. The
// already-shipped sidebar-nav.tsx "Content" entry carries
// roles: ["admin", "staff"] (this story wires its `to`), and AC #9 itself
// only rejects `family`. See the story's Dev Notes for the full rationale.
// `ContentItem` is already tenant-scoped (TENANT_SCOPED_MODELS), so every
// service call is auto-scoped to the caller's home_id — no @BypassTenantScope().
@Controller('content')
@Roles('admin', 'staff')
export class ContentController {
  constructor(
    private readonly contentService: ContentService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateContentItemDto): Promise<ContentItem> {
    this.assertHomeContext();
    return this.contentService.create(dto);
  }

  // Story 3.2 (AC #1-#4, #7, #8): opened to `family` at the method level,
  // overriding the class-level `@Roles('admin', 'staff')` — same
  // method-overrides-class shape ResidentsController's own `findOne` uses to
  // open a single route to family while the rest of the controller stays
  // admin/staff-only. Every write route below is untouched and stays
  // admin/staff-only via the class decorator. Publish-status filtering for a
  // family caller happens in ContentService, not here (see its Dev Notes) —
  // this method still needs assertHomeContext() because a family caller's
  // homeId now comes from X-Active-Home-Id (Story 3.2 Task 4), not the JWT,
  // and an invalid/missing header leaves homeId null.
  @Get()
  @Roles('admin', 'staff', 'family')
  findAll(@Query() query: QueryContentDto): Promise<PaginatedContentItems> {
    this.assertHomeContext();
    return this.contentService.findAll(query);
  }

  @Get(':id')
  @Roles('admin', 'staff', 'family')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ContentItem> {
    this.assertHomeContext();
    return this.contentService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContentItemDto,
  ): Promise<ContentItem> {
    this.assertHomeContext();
    return this.contentService.update(id, dto);
  }

  @Post(':id/publish')
  publish(@Param('id', ParseUUIDPipe) id: string): Promise<ContentItem> {
    this.assertHomeContext();
    return this.contentService.publish(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    this.assertHomeContext();
    return this.contentService.remove(id);
  }

  // Same guard-ordering safety net as ResidentsController.assertHomeContext —
  // homeId is guaranteed non-null past the guards for admin/staff, this only
  // turns a guard-ordering bug into a clean 403 instead of a raw 500.
  private assertHomeContext(): void {
    if (!this.tenantContext.getStore()?.homeId) {
      throw new ForbiddenException();
    }
  }
}
