import { IsEmail, MaxLength } from 'class-validator';

export class InviteHomeAdminDto {
  // RFC 5321 max mailbox length.
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
