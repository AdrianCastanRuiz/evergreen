import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../common/auth/roles.decorator';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSuperAdminDto } from './dto/create-super-admin.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import type { HomeUserSummary, PendingUserResponse } from './users.service';
import { UsersService } from './users.service';

// Story 1.4 (FR49): platform-level user management, not scoped to any home
// (unlike HomesController's /homes/:id/admins). No @BypassTenantScope() on
// any route here yet — this story never touches a tenant-scoped model.
@Controller('users')
@Roles('super_admin')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly tenantContext: TenantContextService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('super-admins')
  @HttpCode(HttpStatus.CREATED)
  createSuperAdmin(
    @Body() dto: CreateSuperAdminDto,
  ): Promise<PendingUserResponse> {
    return this.usersService.createSuperAdmin(dto.email);
  }

  // Story 1.5 (FR11): a home admin/staff invites a staff or family member
  // into their OWN home. Handler-level @Roles() below overrides this
  // controller's class-level @Roles('super_admin') (RolesGuard reads
  // handler metadata first via Reflector.getAllAndOverride). The acting
  // user's role/homeId come from the tenant context (populated from their
  // own JWT), never from the request body — there is nothing for the
  // caller to spoof here.
  @Roles('admin', 'staff')
  @Post('invites')
  @HttpCode(HttpStatus.CREATED)
  async inviteUser(@Body() dto: InviteUserDto): Promise<PendingUserResponse> {
    const store = this.tenantContext.getStore();
    // Guaranteed non-null past JwtAuthGuard/RolesGuard for an admin/staff
    // caller — admin/staff always carry a homeId in their access token
    // (token-payload.ts). A missing store/role/homeId here would mean a
    // guard-ordering bug, not a legitimate request state.
    if (!store?.role || !store.homeId) {
      throw new ForbiddenException();
    }

    const home = await this.prisma.client.home.findUnique({
      where: { id: store.homeId },
    });
    if (!home) throw new NotFoundException('Home not found');

    return this.usersService.inviteUser(
      store.role,
      store.homeId,
      home.name,
      dto.email,
      dto.role,
    );
  }

  // Story 1.12 (AC #1): home admin lists the staff+family users of their
  // own home.
  @Roles('admin')
  @Get()
  async listUsers(): Promise<HomeUserSummary[]> {
    const store = this.tenantContext.getStore();
    if (!store?.homeId) {
      throw new ForbiddenException();
    }
    return this.usersService.listHomeUsers(store.homeId);
  }

  // Story 1.12 (AC #2, #3, #4): home admin changes a staff/family user's
  // role within their own home. Actor identity/home come from the tenant
  // context (their own JWT), never the request body/params.
  @Roles('admin')
  @Patch(':id/role')
  async updateUserRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
  ): Promise<HomeUserSummary> {
    const store = this.tenantContext.getStore();
    if (!store?.userId || !store.homeId) {
      throw new ForbiddenException();
    }
    return this.usersService.updateUserRole(
      store.userId,
      store.homeId,
      id,
      dto.role,
    );
  }

  // Story 1.12 (AC #5): home admin revokes a staff/family user's access to
  // their own home.
  @Roles('admin')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAccess(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    const store = this.tenantContext.getStore();
    if (!store?.userId || !store.homeId) {
      throw new ForbiddenException();
    }
    return this.usersService.revokeAccess(store.userId, store.homeId, id);
  }
}
