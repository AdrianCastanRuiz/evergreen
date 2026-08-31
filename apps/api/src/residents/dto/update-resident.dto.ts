import {
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateResidentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  room?: string;

  // null clears a previously-set dob; undefined leaves it untouched
  // (Review Finding, patch) — @IsOptional() already skips validation for
  // both null and undefined (class-validator's IsOptional.js constraint).
  @IsOptional()
  @IsISO8601({ strict: true })
  dob?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  profilePhotoPublicId?: string;
}
