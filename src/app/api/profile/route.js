import { NextResponse } from "next/server";
import { query, one } from "@/lib/db";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/profile — the logged-in user's own profile.
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ user: me });
}

// PUT /api/profile — update own basic info / photo and optionally the password.
export async function PUT(request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const full_name = (body.full_name || "").trim();
    const email = (body.email || "").trim() || null;
    const mobile = (body.mobile || "").trim() || null;
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

    // Optional password change.
    const wantsPwChange = body.new_password || body.current_password;
    if (wantsPwChange) {
      if (!body.new_password || body.new_password.length < 6) {
        return NextResponse.json(
          { error: "New password must be at least 6 characters." },
          { status: 400 }
        );
      }
      const row = await one(
        `SELECT password_hash FROM admin_users WHERE id = $1`,
        [me.id]
      );
      const ok = await verifyPassword(
        body.current_password || "",
        row.password_hash
      );
      if (!ok) {
        return NextResponse.json(
          { error: "Your current password is incorrect." },
          { status: 400 }
        );
      }
      const hash = await hashPassword(body.new_password);
      await query(
        `UPDATE admin_users SET password_hash=$1, updated_at=NOW() WHERE id=$2`,
        [hash, me.id]
      );
    }

    if (photo_url !== undefined) {
      await query(
        `UPDATE admin_users
            SET full_name=$1, email=$2, mobile=$3, photo_url=$4, updated_at=NOW()
          WHERE id=$5`,
        [full_name, email, mobile, photo_url, me.id]
      );
    } else {
      await query(
        `UPDATE admin_users
            SET full_name=$1, email=$2, mobile=$3, updated_at=NOW()
          WHERE id=$4`,
        [full_name, email, mobile, me.id]
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
    console.error("update profile error", err);
    return NextResponse.json(
      { error: "Could not update profile." },
      { status: 500 }
    );
  }
}
