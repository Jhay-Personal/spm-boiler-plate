import type { NextRequest } from "next/server";
import { execute, one } from "@/lib/db";
import { requireModule } from "@/lib/guard";
import { badRequest, notFound, ok, parseId, parseJson, route } from "@/lib/api";
import { logger } from "@/lib/logger";
import { roleInputSchema } from "@/features/roles/schema";
import type { RoleSummary } from "@/lib/types";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export const GET = route(
  "GET /api/roles/[id]",
  async (_request: NextRequest, context: Context) => {
    await requireModule("roles");
    const id = parseId((await context.params).id);

    const role = await one<RoleSummary>(
      `SELECT r.id, r.name, r.description, r.modules, r.is_super, r.created_at,
              COUNT(u.id)::int AS user_count
         FROM roles r
         LEFT JOIN admin_users u ON u.role_id = r.id
        WHERE r.id = $1
        GROUP BY r.id`,
      [id],
    );
    if (!role) throw notFound("That group no longer exists.");

    return ok({ role });
  },
);

/** PUT /api/roles/:id — rename, re-describe, or change the module selection. */
export const PUT = route(
  "PUT /api/roles/[id]",
  async (request: NextRequest, context: Context) => {
    const me = await requireModule("roles");
    const id = parseId((await context.params).id);
    const input = await parseJson(request, roleInputSchema);

    const existing = await one<{ is_super: boolean }>(
      `SELECT is_super FROM roles WHERE id = $1`,
      [id],
    );
    if (!existing) throw notFound("That group no longer exists.");

    if (existing.is_super) {
      // The all-access group keeps its access; only its label is editable.
      // Allowing its module list to be narrowed could lock every admin out.
      await execute(
        `UPDATE roles SET name=$1, description=$2, updated_at=NOW() WHERE id=$3`,
        [input.name, input.description, id],
      );
    } else {
      await execute(
        `UPDATE roles
            SET name=$1, description=$2, modules=$3::jsonb, updated_at=NOW()
          WHERE id=$4`,
        [input.name, input.description, JSON.stringify(input.modules), id],
      );
    }

    logger.info("role updated", {
      actorId: me.id,
      roleId: id,
      modules: input.modules,
    });
    return ok({ id });
  },
);

export const DELETE = route(
  "DELETE /api/roles/[id]",
  async (_request: NextRequest, context: Context) => {
    const me = await requireModule("roles");
    const id = parseId((await context.params).id);

    const role = await one<{ is_super: boolean }>(
      `SELECT is_super FROM roles WHERE id = $1`,
      [id],
    );
    if (!role) throw notFound("That group no longer exists.");
    if (role.is_super) {
      throw badRequest("The Super Admin group cannot be deleted.");
    }

    const inUse = await one<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM admin_users WHERE role_id = $1`,
      [id],
    );
    if ((inUse?.c ?? 0) > 0) {
      throw badRequest(
        `This group is assigned to ${inUse?.c} user(s). Reassign them first.`,
      );
    }

    await execute(`DELETE FROM roles WHERE id = $1`, [id]);

    logger.info("role deleted", { actorId: me.id, roleId: id });
    return ok({ id });
  },
);
