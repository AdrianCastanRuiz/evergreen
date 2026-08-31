// Story 1.2: a super admin creates and manages care homes on the platform.
// `Home` is the tenant root, not a tenant-scoped model itself (AD-1) — it
// carries no home_id of its own.

export interface Home {
  id: string;
  name: string;
  address: string | null;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateHomeRequest {
  name: string;
  address?: string;
  timezone: string;
}

export interface UpdateHomeRequest {
  name?: string;
  address?: string;
  timezone?: string;
}
