import "server-only";
import { query } from "@/lib/db";
import type { RoleSummary } from "@/lib/types";

/** Shared by the roles page (server render) and GET /api/roles (client refresh). */
export async function listRoles(): Promise<RoleSummary[]> {
  return query<RoleSummary>(
    `SELECT r.id, r.name, r.description, r.modules, r.is_super, r.created_at,
            COUNT(u.id)::int AS user_count
       FROM roles r
       LEFT JOIN admin_users u ON u.role_id = r.id
      GROUP BY r.id
      ORDER BY r.is_super DESC, r.name ASC`,
  );
}
