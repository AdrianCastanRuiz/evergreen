import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { Roles } from '../common/auth/roles.decorator';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSuperAdminDto } from './dto/create-super-admin.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import type { PendingUserResponse } from './users.service';
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
}
