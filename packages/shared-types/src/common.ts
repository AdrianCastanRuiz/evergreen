// Error envelope and pagination shapes used by every endpoint
// (Consistency Conventions in ARCHITECTURE-SPINE.md).

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export type Role = "family" | "staff" | "admin" | "super_admin";
