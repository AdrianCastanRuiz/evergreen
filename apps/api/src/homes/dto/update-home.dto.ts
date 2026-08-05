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

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @IsIn(IANA_TIME_ZONES)
  timezone?: string;
}
