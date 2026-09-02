import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';

// Trims a string before any other validator on the property runs — without
// this, class-validator's checks (@IsEmail, @MinLength, ...) see the raw,
// possibly-padded input and reject it outright instead of letting the
// trimmed value through (code-review finding, originally patched separately
// in CreateSuperAdminDto/InviteHomeAdminDto/InviteUserDto).
export function Trim(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
}

// Trim() + @IsEmail() + the RFC 5321 max mailbox length, for the common
// "email field" case shared by CreateSuperAdminDto, InviteHomeAdminDto,
// InviteUserDto and UpdateMeDto. Combine with @IsOptional() at the call
// site for optional fields — decorator order there still matters, so
// @IsOptional() stays separate rather than baked in here.
export function TrimEmail(): PropertyDecorator {
  return applyDecorators(Trim(), IsEmail(), MaxLength(254));
}
