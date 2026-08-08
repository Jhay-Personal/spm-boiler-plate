import { NextResponse } from "next/server";
import { query, one } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { MODULE_KEYS } from "@/lib/modules";

export const runtime = "nodejs";

export async function GET(_request, { params }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await one(`SELECT * FROM roles WHERE id = $1`, [params.id]);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ role });
}

// PUT /api/roles/:id — rename / re-describe / change module selection.
export async function PUT(request, { params }) {
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

    const existing = await one(`SELECT is_super FROM roles WHERE id = $1`, [
      params.id,
    ]);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Super Admin keeps all-access; only its name/description are editable.
    if (existing.is_super) {
      await query(
        `UPDATE roles SET name=$1, description=$2, updated_at=NOW() WHERE id=$3`,
        [name, description, params.id]
      );
    } else {
      await query(
        `UPDATE roles
            SET name=$1, description=$2, modules=$3::jsonb, updated_at=NOW()
          WHERE id=$4`,
        [name, description, JSON.stringify(modules), params.id]
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err.code === "23505") {
      return NextResponse.json(
        { error: "A group with that name already exists." },
        { status: 409 }
      );
    }
    console.error("update role error", err);
    return NextResponse.json(
      { error: "Could not update group." },
      { status: 500 }
    );
  }
}

// DELETE /api/roles/:id — refuse if it's the super role or still in use.
export async function DELETE(_request, { params }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await one(`SELECT is_super FROM roles WHERE id = $1`, [
    params.id,
  ]);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role.is_super) {
    return NextResponse.json(
      { error: "The Super Admin group cannot be deleted." },
      { status: 400 }
    );
  }

  const inUse = await one(
    `SELECT COUNT(*)::int AS c FROM admin_users WHERE role_id = $1`,
    [params.id]
  );
  if (inUse.c > 0) {
    return NextResponse.json(
      { error: `This group is assigned to ${inUse.c} user(s). Reassign them first.` },
      { status: 400 }
    );
  }

  await query(`DELETE FROM roles WHERE id = $1`, [params.id]);
  return NextResponse.json({ ok: true });
}
