import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';

export class InviteHomeAdminDto {
  // Trim before @IsEmail() validates — class-validator's email check
  // rejects leading/trailing whitespace outright, which would otherwise
  // 400 a padded address before HomesService's own .trim() ever runs
  // (code-review finding, same fix as CreateSuperAdminDto).
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  // RFC 5321 max mailbox length.
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
