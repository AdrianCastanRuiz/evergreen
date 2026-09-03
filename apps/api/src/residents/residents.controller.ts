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
} from '@nestjs/common';
import type { Resident } from '../../generated/prisma';
import { Roles } from '../common/auth/roles.decorator';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { CreateResidentDto } from './dto/create-resident.dto';
import { LinkFamilyMemberDto } from './dto/link-family-member.dto';
import { UpdateResidentDto } from './dto/update-resident.dto';
import type { LinkedFamilyMember } from './residents.service';
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

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Resident> {
    this.assertHomeContext();
    return this.residentsService.findOne(id);
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
