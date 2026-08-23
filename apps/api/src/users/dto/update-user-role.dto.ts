import { IsIn } from 'class-validator';
import type { Role } from '../../../generated/prisma';

// Story 1.12: a home admin may only move a user between `staff` and
// `family` within their own home — `admin`/`super_admin` stay Story
// 1.3/1.4's exclusive territory, same boundary as InviteUserDto's
// INVITABLE_ROLES.
const MANAGEABLE_ROLES: Role[] = ['staff', 'family'];

export class UpdateUserRoleDto {
  @IsIn(MANAGEABLE_ROLES)
  role!: 'staff' | 'family';
}
