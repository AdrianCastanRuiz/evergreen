import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ConfirmPasswordResetDto {
  // The raw token from the emailed link's `?token=` query param — opaque to
  // the API boundary, only its presence is validated here; PasswordResetService
  // does the actual hash-and-match lookup. Real tokens are ~43 chars
  // (base64url of 32 random bytes) — 512 is generous headroom, just enough
  // to keep an oversized body from reaching the hashing step for nothing.
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  token!: string;

  // Bounds mirror LoginDto.password (8-char floor as a minimal strength
  // baseline; ceiling keeps an oversized body from reaching bcrypt, which
  // itself silently truncates at 72 bytes). The \S requirement rejects an
  // all-whitespace string that would otherwise clear MinLength(8).
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/\S/, { message: 'newPassword must not be blank' })
  newPassword!: string;
}
