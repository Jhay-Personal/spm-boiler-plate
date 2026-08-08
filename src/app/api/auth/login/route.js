import { NextResponse } from "next/server";
import { one } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { signSession, SESSION_COOKIE, cookieOptions } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { identifier, password } = await request.json();
    if (!identifier || !password) {
      return NextResponse.json(
        { error: "Enter your email/mobile and password." },
        { status: 400 }
      );
    }

    const id = String(identifier).trim();
    // Match by email (case-insensitive) or mobile number.
    const user = await one(
      `SELECT id, full_name, password_hash, status
         FROM admin_users
        WHERE lower(email) = lower($1) OR mobile = $1
        LIMIT 1`,
      [id]
    );

    if (!user || user.status !== "active") {
      return NextResponse.json(
        { error: "Invalid credentials." },
        { status: 401 }
      );
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return NextResponse.json(
        { error: "Invalid credentials." },
        { status: 401 }
      );
    }

    const token = await signSession({ uid: user.id });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, cookieOptions);
    return res;
  } catch (err) {
    console.error("login error", err);
    return NextResponse.json(
      { error: "Login failed. Check the server database connection." },
      { status: 500 }
    );
  }
}
