import "server-only";
import { query } from "@/lib/db";
import type { UserSummary } from "@/lib/types";

/**
 * Shared by the users page (server render) and GET /api/users (client
 * refresh after a mutation). Never selects password_hash.
 */
export async function listUsers(): Promise<UserSummary[]> {
  return query<UserSummary>(
    `SELECT u.id, u.full_name, u.email, u.mobile, u.photo_url, u.status,
            u.created_at, u.role_id, r.name AS role_name
       FROM admin_users u
       LEFT JOIN roles r ON r.id = u.role_id
      ORDER BY u.created_at DESC, u.id DESC`,
  );
}
