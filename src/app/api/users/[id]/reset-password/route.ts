import type { NextRequest } from "next/server";
import { execute, one } from "@/lib/db";
import { hashPassword, revokeSessions } from "@/lib/auth";
import { requireSuper } from "@/lib/guard";
import { notFound, ok, parseId, parseJson, route } from "@/lib/api";
import { logger } from "@/lib/logger";
import { resetPasswordSchema } from "@/features/users/schema";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/users/:id/reset-password
 *
 * Super admin only. Setting another account's password without proving
 * anything about that account IS account takeover, so this is the single
 * most privileged operation in the app — it must never be reachable by
 * merely holding the `users` module.
 *
 * Users changing their OWN password go through PUT /api/profile, which
 * requires the current password.
 */
export const POST = route(
  "POST /api/users/[id]/reset-password",
  async (request: NextRequest, context: Context) => {
    const me = await requireSuper();
    const id = parseId((await context.params).id);
    const { password } = await parseJson(request, resetPasswordSchema);

    const exists = await one<{ id: number }>(
      `SELECT id FROM admin_users WHERE id = $1`,
      [id],
    );
    if (!exists) throw notFound("That user no longer exists.");

    const hash = await hashPassword(password);
    await execute(
      `UPDATE admin_users SET password_hash=$1, updated_at=NOW() WHERE id=$2`,
      [hash, id],
    );
    // Any session opened with the old password stops working immediately.
    await revokeSessions(id);

    logger.info("password reset by admin", { actorId: me.id, userId: id });
    return ok({ id });
  },
);
