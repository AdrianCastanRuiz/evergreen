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
  UseGuards,
} from '@nestjs/common';
import type { Resident } from '../../generated/prisma';
import { FamilyResidentGuard } from '../common/auth/family-resident.guard';
import { Roles } from '../common/auth/roles.decorator';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { CreateResidentDto } from './dto/create-resident.dto';
import { LinkFamilyMemberDto } from './dto/link-family-member.dto';
import { UpdateResidentDto } from './dto/update-resident.dto';
import type { LinkedFamilyMember, LinkedResident } from './residents.service';
import { ResidentsService } from './residents.service';

// Story 2.1 (AC #1, #2, #4, #5): home admin manages resident profiles
// within their own home. `Resident` is already tenant-scoped
// (TENANT_SCOPED_MODELS), so every service call below is auto-scoped to
// the caller's home_id by the tenant-scoping Prisma extension — no
// @BypassTenantScope() anywhere here, and no manual home_id passed down
// (unlike UsersController, which queries via HomeMembership).
@Controller('residents')
@Roles('admin')
export class ResidentsController {
  constructor(
    private readonly residentsService: ResidentsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateResidentDto): Promise<Resident> {
    this.assertHomeContext();
    return this.residentsService.create(dto);
  }

  @Get()
  findAll(): Promise<Resident[]> {
    this.assertHomeContext();
    return this.residentsService.findAll();
  }

  @Get('linked')
  @Roles('family')
  listLinked(): Promise<LinkedResident[]> {
    const userId = this.tenantContext.getUserId();
    // No assertHomeContext(): family callers carry no homeId (AD-18); the
    // linked-residents endpoint is self-scoped to the caller by userId, so a
    // missing home context is expected and harmless here.
    if (!userId) throw new ForbiddenException();
    return this.residentsService.findLinkedForUser(userId);
  }

  // Story 2.1: single resident. Story 2.3 (AC #4): opened to `family` and
  // guarded by FamilyResidentGuard (AD-11) — a family caller may only reach
  // a resident they hold a live FamilyLink to, in a home they still belong
  // to. The route param is named `residentId` (not `id`) so the guard can
  // read it off the request — FamilyResidentGuard expects params.residentId.
  // For admin/staff the guard is a no-op (already scoped by @Roles +
  // home_id); we branch on role only to pick the right service path, because
  // a family caller's homeId is null and cannot go through the tenant-scoped
  // findOne().
  @Get(':residentId')
  @Roles('admin', 'family')
  @UseGuards(FamilyResidentGuard)
  findOne(
    @Param('residentId', ParseUUIDPipe) residentId: string,
  ): Promise<Resident | LinkedResident> {
    if (this.tenantContext.getStore()?.role === 'family') {
      return this.residentsService.findOneForFamily(residentId);
    }
    this.assertHomeContext();
    return this.residentsService.findOne(residentId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateResidentDto,
  ): Promise<Resident> {
    this.assertHomeContext();
    return this.residentsService.update(id, dto);
  }

  // Story 2.2 (AC #2): link an already-active family member of this home to
  // an additional resident. Follows HomesController's precedent for a
  // resource owning a sub-action on another (POST /homes/:id/admins) rather
  // than a top-level /family-links resource.
  @Post(':residentId/family-links')
  @HttpCode(HttpStatus.CREATED)
  linkFamilyMember(
    @Param('residentId', ParseUUIDPipe) residentId: string,
    @Body() dto: LinkFamilyMemberDto,
  ): Promise<void> {
    this.assertHomeContext();
    return this.residentsService.linkFamilyMember(residentId, dto.userId);
  }

  // Story 2.2 (Task 4): lists this resident's linked family members, for the
  // admin UI's "remove a link" surface.
  @Get(':residentId/family-links')
  listFamilyLinks(
    @Param('residentId', ParseUUIDPipe) residentId: string,
  ): Promise<LinkedFamilyMember[]> {
    this.assertHomeContext();
    return this.residentsService.listFamilyLinks(residentId);
  }

  // Story 2.2 (AC #5): removes a FamilyLink — the linked family member loses
  // access to this resident's data on their very next request, enforced by
  // FamilyResidentGuard (AD-11), not just hidden in this UI.
  @Delete(':residentId/family-links/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  unlinkFamilyMember(
    @Param('residentId', ParseUUIDPipe) residentId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    this.assertHomeContext();
    return this.residentsService.unlinkFamilyMember(residentId, userId);
  }

  // this.tenantContext.getStore()?.homeId is guaranteed non-null past the
  // guards for an 'admin' caller (same invariant UsersController
  // documents) — this only guards against a guard-ordering bug turning
  // into the tenant-scoping extension's raw Error (500) instead of a
  // clean 403.
  private assertHomeContext(): void {
    if (!this.tenantContext.getStore()?.homeId) {
      throw new ForbiddenException();
    }
  }
}
