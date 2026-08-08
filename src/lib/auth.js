import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { one } from "./db";
import { SESSION_COOKIE, verifySession } from "./session";

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

// Loads the full user (joined with their role) referenced by the session
// cookie. Returns null if not logged in or the user no longer exists / is
// inactive.
export async function getCurrentUser() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySession(token);
  if (!payload?.uid) return null;

  const user = await one(
    `SELECT u.id, u.full_name, u.email, u.mobile, u.photo_url, u.status,
            u.role_id, r.name AS role_name, r.modules AS role_modules,
            r.is_super AS role_is_super
       FROM admin_users u
       LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1`,
    [payload.uid]
  );
  if (!user || user.status !== "active") return null;

  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    mobile: user.mobile,
    photo_url: user.photo_url,
    status: user.status,
    role: user.role_id
      ? {
          id: user.role_id,
          name: user.role_name,
          modules: user.role_modules || [],
          is_super: user.role_is_super || false,
        }
      : null,
  };
}

// Helper for API routes: returns { user } or throws a Response-like 401.
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  return user;
}
