import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Roles } from '../common/auth/roles.decorator';
import { CreateSuperAdminDto } from './dto/create-super-admin.dto';
import type { PendingUserResponse } from './users.service';
import { UsersService } from './users.service';

// Story 1.4 (FR49): platform-level user management, not scoped to any home
// (unlike HomesController's /homes/:id/admins). No @BypassTenantScope() on
// any route here yet — this story never touches a tenant-scoped model.
@Controller('users')
@Roles('super_admin')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('super-admins')
  @HttpCode(HttpStatus.CREATED)
  createSuperAdmin(
    @Body() dto: CreateSuperAdminDto,
  ): Promise<PendingUserResponse> {
    return this.usersService.createSuperAdmin(dto.email);
  }
}
