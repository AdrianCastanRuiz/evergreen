import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Trim, TrimEmail } from '../../common/decorators/trim.decorator';

export class InviteHomeAdminDto {
  @TrimEmail()
  email!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;
}
