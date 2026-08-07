import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { Home } from '../../generated/prisma';
import { Roles } from '../common/auth/roles.decorator';
import { BypassTenantScope } from '../common/tenant/bypass-tenant-scope.decorator';
import type { PendingUserResponse } from '../users/users.service';
import { UsersService } from '../users/users.service';
import { CreateHomeDto } from './dto/create-home.dto';
import { InviteHomeAdminDto } from './dto/invite-home-admin.dto';
import { UpdateHomeDto } from './dto/update-home.dto';
import { HomesService } from './homes.service';

// Home is the tenant root, not a tenant-scoped table (AD-1) — every route
// here is gated purely by role, never by home_id (FR47, NFR11, AD-12).
@Controller('homes')
@Roles('super_admin')
export class HomesController {
  constructor(
    private readonly homesService: HomesService,
    private readonly usersService: UsersService,
  ) {}

  @Post()
  create(@Body() dto: CreateHomeDto): Promise<Home> {
    return this.homesService.create(dto);
  }

  @Get()
  findAll(): Promise<Home[]> {
    return this.homesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Home> {
    return this.homesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateHomeDto): Promise<Home> {
    return this.homesService.update(id, dto);
  }

  // Story 1.3 (FR48): assigns a home admin to this home by inviting them via
  // email. Creates a HomeMembership, which is tenant-scoped (AD-1) — a
  // super_admin's JWT carries no home_id (deferred-work.md), so without this
  // decorator the tenant-scoping Prisma extension would hard-error rather
  // than silently scope to the wrong home. @Roles('super_admin') above is
  // what actually authorizes this — the bypass only skips auto-scoping, it
  // is not a second auth check.
  @BypassTenantScope()
  @Post(':id/admins')
  @HttpCode(HttpStatus.CREATED)
  async inviteAdmin(
    @Param('id') id: string,
    @Body() dto: InviteHomeAdminDto,
  ): Promise<PendingUserResponse> {
    const home = await this.homesService.findOne(id);
    return this.usersService.createPendingHomeAdmin(id, dto.email, home.name);
  }
}
