import { NextResponse } from "next/server";
import { query, one } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/users/:id
export async function GET(_request, { params }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await one(
    `SELECT id, full_name, email, mobile, photo_url, status, role_id, created_at
       FROM admin_users WHERE id = $1`,
    [params.id]
  );
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ user });
}

// PUT /api/users/:id — update basic info, role, photo, status.
export async function PUT(request, { params }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const full_name = (body.full_name || "").trim();
    const email = (body.email || "").trim() || null;
    const mobile = (body.mobile || "").trim() || null;
    const role_id = body.role_id || null;
    const status = body.status === "disabled" ? "disabled" : "active";
    const photo_url =
      body.photo_url !== undefined
        ? (body.photo_url || "").trim() || null
        : undefined;

    if (!full_name) {
      return NextResponse.json(
        { error: "Full name is required." },
        { status: 400 }
      );
    }
    if (!email && !mobile) {
      return NextResponse.json(
        { error: "Provide at least an email or a mobile number." },
        { status: 400 }
      );
    }

    if (photo_url !== undefined) {
      await query(
        `UPDATE admin_users
            SET full_name=$1, email=$2, mobile=$3, role_id=$4, status=$5,
                photo_url=$6, updated_at=NOW()
          WHERE id=$7`,
        [full_name, email, mobile, role_id, status, photo_url, params.id]
      );
    } else {
      await query(
        `UPDATE admin_users
            SET full_name=$1, email=$2, mobile=$3, role_id=$4, status=$5,
                updated_at=NOW()
          WHERE id=$6`,
        [full_name, email, mobile, role_id, status, params.id]
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err.code === "23505") {
      return NextResponse.json(
        { error: "That email or mobile number is already in use." },
        { status: 409 }
      );
    }
    console.error("update user error", err);
    return NextResponse.json(
      { error: "Could not update user." },
      { status: 500 }
    );
  }
}

// DELETE /api/users/:id
export async function DELETE(_request, { params }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (String(me.id) === String(params.id)) {
    return NextResponse.json(
      { error: "You cannot delete your own account." },
      { status: 400 }
    );
  }

  await query(`DELETE FROM admin_users WHERE id = $1`, [params.id]);
  return NextResponse.json({ ok: true });
}
