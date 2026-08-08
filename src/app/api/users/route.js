import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser, hashPassword } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/users — list all admin users with their role.
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await query(
    `SELECT u.id, u.full_name, u.email, u.mobile, u.photo_url, u.status,
            u.created_at, u.role_id, r.name AS role_name
       FROM admin_users u
       LEFT JOIN roles r ON r.id = u.role_id
      ORDER BY u.created_at DESC, u.id DESC`
  );
  return NextResponse.json({ users: rows });
}

// POST /api/users — create a new admin user.
export async function POST(request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const full_name = (body.full_name || "").trim();
    const email = (body.email || "").trim() || null;
    const mobile = (body.mobile || "").trim() || null;
    const password = body.password || "";
    const role_id = body.role_id || null;
    const photo_url = (body.photo_url || "").trim() || null;

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
    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    const hash = await hashPassword(password);
    const { rows } = await query(
      `INSERT INTO admin_users
         (full_name, email, mobile, password_hash, role_id, photo_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       RETURNING id`,
      [full_name, email, mobile, hash, role_id, photo_url]
    );

    return NextResponse.json({ ok: true, id: rows[0].id });
  } catch (err) {
    if (err.code === "23505") {
      return NextResponse.json(
        { error: "That email or mobile number is already in use." },
        { status: 409 }
      );
    }
    console.error("create user error", err);
    return NextResponse.json(
      { error: "Could not create user." },
      { status: 500 }
    );
  }
}
