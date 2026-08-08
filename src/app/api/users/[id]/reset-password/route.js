import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser, hashPassword } from "@/lib/auth";

export const runtime = "nodejs";

// POST /api/users/:id/reset-password  { password }
export async function POST(request, { params }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { password } = await request.json();
    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters." },
        { status: 400 }
      );
    }
    const hash = await hashPassword(password);
    const { rowCount } = await query(
      `UPDATE admin_users SET password_hash=$1, updated_at=NOW() WHERE id=$2`,
      [hash, params.id]
    );
    if (!rowCount) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("reset password error", err);
    return NextResponse.json(
      { error: "Could not reset password." },
      { status: 500 }
    );
  }
}
