import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateMeDto {
  // Trim before @MinLength(1) validates — same reasoning as email below: a
  // whitespace-only value would otherwise pass MinLength(1) and get
  // persisted as-is (code-review finding).
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  // Trim before @IsEmail() validates — same reasoning as
  // CreateSuperAdminDto/InviteUserDto: class-validator's email check
  // rejects leading/trailing whitespace outright.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email?: string;
}
