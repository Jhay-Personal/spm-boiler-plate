import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { MODULE_KEYS } from "@/lib/modules";

export const runtime = "nodejs";

// GET /api/roles — list roles with how many users are assigned to each.
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await query(
    `SELECT r.id, r.name, r.description, r.modules, r.is_super, r.created_at,
            COUNT(u.id)::int AS user_count
       FROM roles r
       LEFT JOIN admin_users u ON u.role_id = r.id
      GROUP BY r.id
      ORDER BY r.is_super DESC, r.name ASC`
  );
  return NextResponse.json({ roles: rows });
}

// POST /api/roles — create a group (role) with a selected list of modules.
export async function POST(request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const name = (body.name || "").trim();
    const description = (body.description || "").trim() || null;
    const modules = Array.isArray(body.modules)
      ? body.modules.filter((m) => MODULE_KEYS.includes(m))
      : [];

    if (!name) {
      return NextResponse.json(
        { error: "Group name is required." },
        { status: 400 }
      );
    }

    const { rows } = await query(
      `INSERT INTO roles (name, description, modules, is_super)
       VALUES ($1, $2, $3::jsonb, FALSE)
       RETURNING id`,
      [name, description, JSON.stringify(modules)]
    );
    return NextResponse.json({ ok: true, id: rows[0].id });
  } catch (err) {
    if (err.code === "23505") {
      return NextResponse.json(
        { error: "A group with that name already exists." },
        { status: 409 }
      );
    }
    console.error("create role error", err);
    return NextResponse.json(
      { error: "Could not create group." },
      { status: 500 }
    );
  }
}
