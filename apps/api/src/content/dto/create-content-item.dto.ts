import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ContentType } from '../../../generated/prisma';

// Story 3.1 (AC #1, #2, #3): `type` is a Prisma enum, never a free string —
// extending the set of content types requires a migration (AD-5).
// `attachmentUrl` is genuinely a URL (unlike Resident.profilePhotoPublicId,
// a Cloudinary public id), so @IsUrl() is the correct validator here.
export class CreateContentItemDto {
  @IsEnum(ContentType)
  type!: ContentType;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  attachmentUrl?: string;
}
