import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Trim, TrimEmail } from '../../common/decorators/trim.decorator';

export class UpdateMeDto {
  // Trim before @MinLength(1) validates — same reasoning as email below: a
  // whitespace-only value would otherwise pass MinLength(1) and get
  // persisted as-is (code-review finding).
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @TrimEmail()
  email?: string;
}
