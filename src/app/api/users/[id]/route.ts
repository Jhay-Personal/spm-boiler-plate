import type { NextRequest } from "next/server";
import { execute, one } from "@/lib/db";
import { revokeSessions } from "@/lib/auth";
import { isSuper, requireModule } from "@/lib/guard";
import {
  badRequest,
  forbidden,
  notFound,
  ok,
  parseId,
  parseWith,
  readJson,
  route,
} from "@/lib/api";
import { logger } from "@/lib/logger";
import {
  privilegedUserFieldsSchema,
  updateUserSchema,
} from "@/features/users/schema";
import type { UserSummary, UserStatus } from "@/lib/types";

export const runtime = "nodejs";

// Next 16: dynamic route params arrive as a Promise.
type Context = { params: Promise<{ id: string }> };

type TargetRow = {
  id: number;
  status: UserStatus;
  role_is_super: boolean | null;
};

async function loadTarget(id: number): Promise<TargetRow> {
  const row = await one<TargetRow>(
    `SELECT u.id, u.status, r.is_super AS role_is_super
       FROM admin_users u
       LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1`,
    [id],
  );
  if (!row) throw notFound("That user no longer exists.");
  return row;
}

export const GET = route(
  "GET /api/users/[id]",
  async (_request: NextRequest, context: Context) => {
    await requireModule("users");
    const id = parseId((await context.params).id);

    const user = await one<UserSummary>(
      `SELECT u.id, u.full_name, u.email, u.mobile, u.photo_url, u.status,
              u.created_at, u.role_id, r.name AS role_name
         FROM admin_users u
         LEFT JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1`,
      [id],
    );
    if (!user) throw notFound("That user no longer exists.");

    return ok({ user });
  },
);

/**
 * PUT /api/users/:id — update a user.
 *
 * Split deliberately into two tiers:
 *   • name / email / mobile / photo — anyone holding the `users` module;
 *   • role_id and status           — super admin only, and never on yourself.
 *
 * Without that split, any account that can edit users can promote itself to
 * super admin by PUTting its own id with a different role_id.
 */
export const PUT = route(
  "PUT /api/users/[id]",
  async (request: NextRequest, context: Context) => {
    const me = await requireModule("users");
    const id = parseId((await context.params).id);
    const target = await loadTarget(id);

    // One body, two schemas: the always-allowed fields and the privileged ones.
    const raw = await readJson(request);
    const input = parseWith(updateUserSchema, raw);
    const privileged = parseWith(privilegedUserFieldsSchema, raw);

    const wantsRoleChange = privileged.role_id !== undefined;
    const wantsStatusChange = privileged.status !== undefined;

    if ((wantsRoleChange || wantsStatusChange) && !isSuper(me)) {
      throw forbidden(
        "Only a super admin may change a user's role or status.",
      );
    }
    if ((wantsRoleChange || wantsStatusChange) && me.id === id) {
      throw badRequest(
        "You cannot change your own role or status. Ask another super admin.",
      );
    }
    // A non-super admin must not be able to edit a super admin at all,
    // otherwise they could change that account's email and then use the
    // password-reset flow against it.
    if (target.role_is_super && !isSuper(me)) {
      throw forbidden("Only a super admin may edit a super admin account.");
    }

    if (input.photo_url !== undefined) {
      await execute(
        `UPDATE admin_users
            SET full_name=$1, email=$2, mobile=$3, photo_url=$4, updated_at=NOW()
          WHERE id=$5`,
        [input.full_name, input.email, input.mobile, input.photo_url, id],
      );
    } else {
      await execute(
        `UPDATE admin_users
            SET full_name=$1, email=$2, mobile=$3, updated_at=NOW()
          WHERE id=$4`,
        [input.full_name, input.email, input.mobile, id],
      );
    }

    if (wantsRoleChange) {
      await execute(
        `UPDATE admin_users SET role_id=$1, updated_at=NOW() WHERE id=$2`,
        [privileged.role_id ?? null, id],
      );
    }

    if (wantsStatusChange) {
      await execute(
        `UPDATE admin_users SET status=$1, updated_at=NOW() WHERE id=$2`,
        [privileged.status, id],
      );
      // Disabling an account must end its active sessions immediately, not at
      // the next token expiry.
      if (privileged.status === "disabled") await revokeSessions(id);
    }

    logger.info("user updated", {
      actorId: me.id,
      userId: id,
      roleChanged: wantsRoleChange,
      statusChanged: wantsStatusChange,
    });
    return ok({ id });
  },
);

export const DELETE = route(
  "DELETE /api/users/[id]",
  async (_request: NextRequest, context: Context) => {
    const me = await requireModule("users");
    const id = parseId((await context.params).id);

    if (me.id === id) {
      throw badRequest("You cannot delete your own account.");
    }

    const target = await loadTarget(id);
    if (target.role_is_super && !isSuper(me)) {
      throw forbidden("Only a super admin may delete a super admin account.");
    }

    await execute(`DELETE FROM admin_users WHERE id = $1`, [id]);

    logger.info("user deleted", { actorId: me.id, userId: id });
    return ok({ id });
  },
);
