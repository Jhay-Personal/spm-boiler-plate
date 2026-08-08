import type { NextRequest } from "next/server";
import { execute, one } from "@/lib/db";
import {
  hashPassword,
  revokeSessions,
  verifyPassword,
} from "@/lib/auth";
import { requireUser } from "@/lib/guard";
import { badRequest, ok, parseJson, route } from "@/lib/api";
import {
  SESSION_COOKIE,
  cookieOptions,
  signSession,
} from "@/lib/session";
import { logger } from "@/lib/logger";
import { updateProfileSchema } from "@/features/profile/schema";

export const runtime = "nodejs";

/** GET /api/profile — the signed-in user's own profile. */
export const GET = route("GET /api/profile", async () => {
  const me = await requireUser();
  return ok({ user: me });
});

/**
 * PUT /api/profile — update your own details, and optionally your password.
 *
 * Only ever touches the caller's own row. There is no id parameter, so this
 * endpoint cannot be pointed at somebody else's account.
 */
export const PUT = route("PUT /api/profile", async (request: NextRequest) => {
  const me = await requireUser();
  const input = await parseJson(request, updateProfileSchema);

  const changingPassword = Boolean(input.new_password);
  let newTokenVersion: number | null = null;

  if (changingPassword) {
    const row = await one<{ password_hash: string }>(
      `SELECT password_hash FROM admin_users WHERE id = $1`,
      [me.id],
    );
    const currentOk = await verifyPassword(
      input.current_password ?? "",
      row?.password_hash,
    );
    if (!currentOk) {
      logger.warn("profile password change rejected", { userId: me.id });
      throw badRequest("Your current password is incorrect.");
    }

    const hash = await hashPassword(input.new_password as string);
    await execute(
      `UPDATE admin_users SET password_hash=$1, updated_at=NOW() WHERE id=$2`,
      [hash, me.id],
    );

    // Invalidate every session, including this one, then immediately re-issue
    // a token for the caller. Any OTHER browser holding the old password's
    // session is signed out — which is the point of changing a password you
    // think may be compromised.
    await revokeSessions(me.id);
    const updated = await one<{ token_version: number }>(
      `SELECT token_version FROM admin_users WHERE id = $1`,
      [me.id],
    );
    newTokenVersion = updated?.token_version ?? null;
  }

  if (input.photo_url !== undefined) {
    await execute(
      `UPDATE admin_users
          SET full_name=$1, email=$2, mobile=$3, photo_url=$4, updated_at=NOW()
        WHERE id=$5`,
      [input.full_name, input.email, input.mobile, input.photo_url, me.id],
    );
  } else {
    await execute(
      `UPDATE admin_users
          SET full_name=$1, email=$2, mobile=$3, updated_at=NOW()
        WHERE id=$4`,
      [input.full_name, input.email, input.mobile, me.id],
    );
  }

  logger.info("profile updated", { userId: me.id, changingPassword });

  const response = ok({ id: me.id, passwordChanged: changingPassword });
  if (newTokenVersion !== null) {
    const token = await signSession({ uid: me.id, tv: newTokenVersion });
    response.cookies.set(SESSION_COOKIE, token, cookieOptions);
  }
  return response;
});
