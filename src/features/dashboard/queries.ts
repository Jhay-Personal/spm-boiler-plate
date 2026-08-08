import "server-only";
import { one, query } from "@/lib/db";
import type { DashboardStats, UserSummary } from "@/lib/types";

type CountsRow = {
  total_users: number;
  active_users: number;
  disabled_users: number;
};

type RoleCountsRow = {
  total_roles: number;
  super_roles: number;
};

/**
 * Shared by the dashboard page (server render) and GET /api/dashboard
 * (client refresh), so both can never drift apart.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const counts = await one<CountsRow>(
    `SELECT COUNT(*)::int                                    AS total_users,
            COUNT(*) FILTER (WHERE status = 'active')::int   AS active_users,
            COUNT(*) FILTER (WHERE status = 'disabled')::int AS disabled_users
       FROM admin_users`,
  );

  const roleCounts = await one<RoleCountsRow>(
    `SELECT COUNT(*)::int                         AS total_roles,
            COUNT(*) FILTER (WHERE is_super)::int AS super_roles
       FROM roles`,
  );

  const recentUsers = await query<UserSummary>(
    `SELECT u.id, u.full_name, u.email, u.mobile, u.photo_url, u.status,
            u.created_at, u.role_id, r.name AS role_name
       FROM admin_users u
       LEFT JOIN roles r ON r.id = u.role_id
      ORDER BY u.created_at DESC, u.id DESC
      LIMIT 6`,
  );

  return {
    totalUsers: counts?.total_users ?? 0,
    activeUsers: counts?.active_users ?? 0,
    disabledUsers: counts?.disabled_users ?? 0,
    totalRoles: roleCounts?.total_roles ?? 0,
    superRoles: roleCounts?.super_roles ?? 0,
    recentUsers,
  };
}
