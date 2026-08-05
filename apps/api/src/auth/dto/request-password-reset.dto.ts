import { IsEmail, MaxLength } from 'class-validator';

export class RequestPasswordResetDto {
  // RFC 5321 max mailbox length.
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
