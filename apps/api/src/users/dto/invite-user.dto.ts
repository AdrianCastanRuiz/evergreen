import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { Role } from '../../../generated/prisma';
import { Trim, TrimEmail } from '../../common/decorators/trim.decorator';

// `admin`/`super_admin` are never invitable through this endpoint regardless
// of caller — rejected here at validation time, before the service layer's
// role-hierarchy check even runs (Story 1.5).
const INVITABLE_ROLES: Role[] = ['staff', 'family'];

export class InviteUserDto {
  @TrimEmail()
  email!: string;

  @IsIn(INVITABLE_ROLES)
  role!: 'staff' | 'family';

  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  // Story 2.2 (AC #1): only meaningful when role === 'family' — a no-op,
  // not an error, when inviting 'staff' (UsersService.inviteUser ignores it
  // for that branch rather than rejecting the request).
  @IsOptional()
  @IsUUID()
  residentId?: string;
}
