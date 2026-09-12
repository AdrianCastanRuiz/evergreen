import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

// Story 3.1: `title`/`body` same validators as create, both optional.
// `attachmentUrl` accepts `string | null` — undefined means "not sent, leave
// untouched", null means "explicit clear" (Story 2.1's review-learned
// distinction, baked in from day one here). Deliberately excludes `type` —
// no AC requires re-typing an existing item after creation (see Dev Notes).
export class UpdateContentItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  attachmentUrl?: string | null;
}
