import {
  Body,
  Controller,
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
import { UpdateResidentDto } from './dto/update-resident.dto';
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
