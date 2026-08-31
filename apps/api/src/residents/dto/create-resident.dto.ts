import {
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateResidentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  room?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  dob?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  profilePhotoPublicId?: string;
}
