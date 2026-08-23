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
