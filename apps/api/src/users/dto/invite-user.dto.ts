import { Transform } from 'class-transformer';
import { IsEmail, IsIn, MaxLength } from 'class-validator';
import type { Role } from '../../../generated/prisma';

// `admin`/`super_admin` are never invitable through this endpoint regardless
// of caller — rejected here at validation time, before the service layer's
// role-hierarchy check even runs (Story 1.5).
const INVITABLE_ROLES: Role[] = ['staff', 'family'];

export class InviteUserDto {
  // Trim before @IsEmail() validates — class-validator's email check
  // rejects leading/trailing whitespace outright, which would otherwise
  // 400 a padded address before UsersService's own .trim() ever runs
  // (same fix Story 1.3/1.4 had to patch in after code review — baked in
  // here from the start).
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  // RFC 5321 max mailbox length.
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsIn(INVITABLE_ROLES)
  role!: 'staff' | 'family';
}
