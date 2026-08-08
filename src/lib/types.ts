import type { ModuleKey } from "./modules";

// ---------------------------------------------------------------------------
// API envelope
//
// Every endpoint answers with exactly one of these two shapes. Declared here
// rather than in `src/lib/api.ts` so client components can import the types
// without pulling in the server-only helpers alongside them.
// ---------------------------------------------------------------------------

export type ApiError = { code: string; message: string };

export type ApiEnvelope<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: ApiError };

export type UserStatus = "active" | "disabled";

export type Role = {
  id: number;
  name: string;
  description: string | null;
  modules: ModuleKey[];
  is_super: boolean;
};

/** A role as listed in Role Management, with its assigned-user count. */
export type RoleSummary = Role & {
  user_count: number;
  created_at: string;
};

/** The signed-in user, as resolved from the session cookie on every request. */
export type CurrentUser = {
  id: number;
  full_name: string;
  email: string | null;
  mobile: string | null;
  photo_url: string | null;
  status: UserStatus;
  role: Role | null;
};

/** A user as listed in User Management. Never includes the password hash. */
export type UserSummary = {
  id: number;
  full_name: string;
  email: string | null;
  mobile: string | null;
  photo_url: string | null;
  status: UserStatus;
  role_id: number | null;
  role_name: string | null;
  created_at: string;
};

export type DashboardStats = {
  totalUsers: number;
  activeUsers: number;
  disabledUsers: number;
  totalRoles: number;
  superRoles: number;
  recentUsers: UserSummary[];
};

/**
 * The session JWT payload. Deliberately minimal: it carries an id and a token
 * version, and every other fact about the user (role, status, name) is
 * re-read from the database on each request so that changes take effect
 * immediately rather than at the next login.
 */
export type SessionPayload = {
  uid: number;
  tv: number;
};
