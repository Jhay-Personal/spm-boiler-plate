import type { NextRequest } from "next/server";
import { one } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { isSuper, requireModule } from "@/lib/guard";
import { forbidden, ok, parseJson, route } from "@/lib/api";
import { logger } from "@/lib/logger";
import { createUserSchema } from "@/features/users/schema";
import { listUsers } from "@/features/users/queries";

export const runtime = "nodejs";

/** GET /api/users — list admin users with their role. Never returns password hashes. */
export const GET = route("GET /api/users", async () => {
  await requireModule("users");
  return ok({ users: await listUsers() });
});

/** POST /api/users — create an admin user. */
export const POST = route("POST /api/users", async (request: NextRequest) => {
  const me = await requireModule("users");
  const input = await parseJson(request, createUserSchema);

  // Assigning a role hands out access, so it is a super-admin action even
  // though creating an account is not.
  if (input.role_id !== null && !isSuper(me)) {
    throw forbidden("Only a super admin may assign a role to a user.");
  }

  const hash = await hashPassword(input.password);
  const created = await one<{ id: number }>(
    `INSERT INTO admin_users
       (full_name, email, mobile, password_hash, role_id, photo_url, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'active')
     RETURNING id`,
    [
      input.full_name,
      input.email,
      input.mobile,
      hash,
      input.role_id,
      input.photo_url,
    ],
  );

  logger.info("user created", { actorId: me.id, userId: created?.id });
  return ok({ id: created?.id ?? null }, 201);
});
