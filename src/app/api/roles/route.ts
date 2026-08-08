import type { NextRequest } from "next/server";
import { one } from "@/lib/db";
import { requireModule } from "@/lib/guard";
import { ok, parseJson, route } from "@/lib/api";
import { logger } from "@/lib/logger";
import { roleInputSchema } from "@/features/roles/schema";
import { listRoles } from "@/features/roles/queries";

export const runtime = "nodejs";

/** GET /api/roles — list groups with how many users each is assigned to. */
export const GET = route("GET /api/roles", async () => {
  await requireModule("roles");
  return ok({ roles: await listRoles() });
});

/** POST /api/roles — create a group with a selected list of modules. */
export const POST = route("POST /api/roles", async (request: NextRequest) => {
  const me = await requireModule("roles");
  const input = await parseJson(request, roleInputSchema);

  // is_super is hard-coded FALSE: an all-access group can only be created by
  // the seed script, never through the API.
  const created = await one<{ id: number }>(
    `INSERT INTO roles (name, description, modules, is_super)
     VALUES ($1, $2, $3::jsonb, FALSE)
     RETURNING id`,
    [input.name, input.description, JSON.stringify(input.modules)],
  );

  logger.info("role created", {
    actorId: me.id,
    roleId: created?.id,
    modules: input.modules,
  });
  return ok({ id: created?.id ?? null }, 201);
});
