import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  // RFC 5321 max mailbox length.
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // Bounded so an oversized body can't reach bcrypt.compare (bcrypt itself
  // silently truncates at 72 bytes — this just keeps the request small).
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
