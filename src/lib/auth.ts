import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { execute, one } from "./db";
import { SESSION_COOKIE, verifySession } from "./session";
import type { CurrentUser, Role, UserStatus } from "./types";
import { isModuleKey, type ModuleKey } from "./modules";

const BCRYPT_COST = 12;

/**
 * A valid bcrypt hash of a value nobody knows, used to equalise the cost of
 * "no such user" and "wrong password" on the login path. Without it, the
 * missing-user branch returns measurably faster and leaks which identifiers
 * are real.
 */
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.5aVGiG9L5jZKcJ2Q9c7iZ1a0M6PsPjK";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(
  plain: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash) {
    // Still spend the time, then fail.
    await bcrypt.compare(plain, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(plain, hash);
}

/** Burns roughly one bcrypt comparison so a miss costs what a hit costs. */
export async function burnPasswordComparison(plain: string): Promise<void> {
  await bcrypt.compare(plain, DUMMY_HASH);
}

type CurrentUserRow = {
  id: number;
  full_name: string;
  email: string | null;
  mobile: string | null;
  photo_url: string | null;
  status: UserStatus;
  token_version: number;
  role_id: number | null;
  role_name: string | null;
  role_description: string | null;
  role_modules: unknown;
  role_is_super: boolean | null;
};

function toModuleKeys(raw: unknown): ModuleKey[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isModuleKey);
}

/**
 * Resolves the signed-in user from the session cookie.
 *
 * Everything except the id is read fresh from the database on every request,
 * so disabling a user, changing their role, or revoking their sessions takes
 * effect immediately instead of at their next sign-in.
 *
 * Returns null when there is no session, the user no longer exists, the
 * account is disabled, or the token was issued before a session revocation.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySession(token);
  if (!payload) return null;

  const row = await one<CurrentUserRow>(
    `SELECT u.id, u.full_name, u.email, u.mobile, u.photo_url, u.status,
            u.token_version, u.role_id,
            r.name        AS role_name,
            r.description AS role_description,
            r.modules     AS role_modules,
            r.is_super    AS role_is_super
       FROM admin_users u
       LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1`,
    [payload.uid],
  );

  if (!row) return null;
  if (row.status !== "active") return null;
  // Password change / forced sign-out bumps token_version, invalidating every
  // token minted before it.
  if (row.token_version !== payload.tv) return null;

  const role: Role | null =
    row.role_id !== null
      ? {
          id: row.role_id,
          name: row.role_name ?? "",
          description: row.role_description,
          modules: toModuleKeys(row.role_modules),
          is_super: row.role_is_super ?? false,
        }
      : null;

  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    mobile: row.mobile,
    photo_url: row.photo_url,
    status: row.status,
    role,
  };
}

/** Increments a user's token version, invalidating all of their existing sessions. */
export async function revokeSessions(userId: number): Promise<void> {
  await execute(
    `UPDATE admin_users SET token_version = token_version + 1, updated_at = NOW()
      WHERE id = $1`,
    [userId],
  );
}
