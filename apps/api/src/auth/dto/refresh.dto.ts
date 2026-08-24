import { IsOptional, IsString, MaxLength } from 'class-validator';

// Optional: mobile sends it in the body (Story 1.6/1.11); apps/admin sends
// none and relies on the httpOnly refresh_token cookie instead (Story 1.14)
// — AuthController resolves whichever is present.
export class RefreshDto {
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  refreshToken?: string;
}
