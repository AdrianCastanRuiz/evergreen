import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

// Real IANA zones only — rejects typos/garbage at the API boundary instead of
// storing an unusable timezone a client would fail to parse later.
const IANA_TIME_ZONES = Intl.supportedValuesOf('timeZone');

export class CreateHomeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsString()
  @IsIn(IANA_TIME_ZONES)
  timezone!: string;
}
