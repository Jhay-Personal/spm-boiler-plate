import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "./auth";
import { forbidden, unauthorized } from "./api";
import { canAccess, type ModuleKey } from "./modules";
import type { CurrentUser } from "./types";

// Server-side access control.
//
// The role a user is assigned decides which modules they may use. That
// decision MUST be made here, on the server, on every request — filtering the
// sidebar is a convenience for the user, not a security boundary. An attacker
// does not use the sidebar; they call the endpoint directly.
//
// Rule of thumb: every API handler starts with `requireModule(...)` or
// `requireSuper()`, and every page under src/app/(main) starts with
// `requirePageModule(...)`. See docs/rbac.md.

/** Throws 401 unless a valid session resolves to an active user. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

/** Throws 401 when signed out, 403 when the user's role lacks `moduleKey`. */
export async function requireModule(moduleKey: ModuleKey): Promise<CurrentUser> {
  const user = await requireUser();
  if (!canAccess(user.role, moduleKey)) {
    throw forbidden(`You do not have access to the ${moduleKey} module.`);
  }
  return user;
}

/**
 * Throws unless the caller holds an all-access (super admin) role.
 *
 * Reserved for operations that can escalate privilege or take over an
 * account: assigning roles, enabling/disabling users, and resetting another
 * user's password.
 */
export async function requireSuper(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.role?.is_super) {
    throw forbidden("Only a super admin may perform this action.");
  }
  return user;
}

/** True when the caller holds an all-access role. */
export function isSuper(user: CurrentUser): boolean {
  return user.role?.is_super === true;
}

/**
 * Page-level equivalent of `requireModule`, for server components under
 * src/app/(main). Redirects rather than throwing, because a browser
 * navigating to a page it may not see should land somewhere useful.
 */
export async function requirePageModule(
  moduleKey: ModuleKey,
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user.role, moduleKey)) redirect("/dashboard?denied=" + moduleKey);
  return user;
}
