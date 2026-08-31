import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const IANA_TIME_ZONES = Intl.supportedValuesOf('timeZone');

export class UpdateHomeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  // string | null (not just optional): null is an explicit "clear the
  // address" request, distinct from omitting the field entirely (leave
  // unchanged) — same distinction Story 2.1's code review required for
  // Resident.dob. @IsOptional() already skips validation for both null and
  // undefined (confirmed in Story 2.1's review), so no other decorator change
  // needed.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(IANA_TIME_ZONES)
  timezone?: string;
}
