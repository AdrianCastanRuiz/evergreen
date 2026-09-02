import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';

export class ConfirmOnboardingDto {
  // The invite code the invitee types into the app (FR5) — trimmed first so
  // a pasted code with surrounding whitespace still matches; opaque to the
  // API boundary. InviteCodeService does the actual hash-and-match lookup.
  // Codes are 10 unambiguous chars; 64 is generous headroom.
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  inviteCode!: string;

  // Bounds mirror ConfirmPasswordResetDto.newPassword (8-char floor as a
  // minimal strength baseline; ceiling keeps an oversized body from reaching
  // bcrypt). The \S requirement rejects an all-whitespace string that would
  // otherwise clear MinLength(8).
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/\S/, { message: 'newPassword must not be blank' })
  newPassword!: string;
}
