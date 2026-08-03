import type { Role } from '../../../generated/prisma';

// Both token kinds share JWT_SECRET (one source of truth, AD-8) — the
// `type` discriminator is what stops a refresh token from being replayed as
// a Bearer access token (checked by TenantContextMiddleware) or vice versa
// (checked by AuthService.refresh).
export interface AccessTokenPayload {
  sub: string;
  role: Role;
  type: 'access';
  // Present only for staff/admin/super_admin — their home is fixed at login
  // (AD-1 rule 6). Absent for family, who never carry a home_id in the JWT
  // (AD-18).
  homeId?: string;
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
}
