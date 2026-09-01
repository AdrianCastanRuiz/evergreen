// Story 1.12: a home admin listing/managing the staff+family users of their
// own home. Scoped deliberately to those two roles — admin/super_admin
// management stays Story 1.3/1.4's territory (see apps/api's UsersService).

import type { Role } from "./common";

export interface HomeUserSummary {
  id: string;
  email: string;
  name: string | null;
  role: Extract<Role, "staff" | "family">;
  isActive: boolean;
}

export interface UpdateUserRoleRequest {
  role: Extract<Role, "staff" | "family">;
}

// Stories 1.3/1.4/1.5: shared response shape for every pending-account
// creation endpoint (POST /homes/:id/admins, /users/super-admins,
// /users/invites). homeId is null only for Story 1.4's super_admin role,
// which has no home scope at all.
export interface PendingUserResponse {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  homeId: string | null;
}

// Story 1.4: POST /users/super-admins.
export interface CreateSuperAdminRequest {
  email: string;
}

// Story 1.5: POST /users/invites. `admin`/`super_admin` are never invitable
// through this endpoint (InviteUserDto's INVITABLE_ROLES) — the acting
// user's own home comes from their JWT server-side, never from this body.
export interface InviteUserRequest {
  email: string;
  role: Extract<Role, "staff" | "family">;
}
