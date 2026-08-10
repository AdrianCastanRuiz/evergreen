import type { Role } from "./common";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  homeId: string | null;
}

// GET /auth/me — used by the splash-screen auth-state resolution (FR8).
export interface MeResponse {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  isActive: boolean;
  homeId: string | null;
}

// POST /auth/refresh — mints a fresh token pair from the bearer refresh token.
export interface RefreshRequest {
  refreshToken: string;
}

// POST /auth/password-reset — 204 regardless of whether the email exists
// (no account enumeration, NFR9/AD-8).
export interface RequestPasswordResetRequest {
  email: string;
}

// POST /auth/password-reset/confirm — returns { success: true }, never a
// token pair; the client navigates to login after a successful confirm.
export interface ConfirmPasswordResetRequest {
  token: string;
  newPassword: string;
}
