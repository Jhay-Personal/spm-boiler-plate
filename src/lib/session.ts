import { SignJWT, jwtVerify } from "jose";
import { authSecret, isProduction } from "./env";
import type { SessionPayload } from "./types";

// Edge-safe session helpers (no database, no bcrypt) so they can be used from
// `src/proxy.ts` as well as from API routes.

export const SESSION_COOKIE = "admin_session";
const ALG = "HS256";
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

function secretKey(): Uint8Array {
  return new TextEncoder().encode(authSecret());
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ uid: payload.uid, tv: payload.tv })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySession(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: [ALG],
    });
    const uid = payload.uid;
    const tv = payload.tv;
    if (typeof uid !== "number" || typeof tv !== "number") return null;
    return { uid, tv };
  } catch {
    // Expired, tampered with, or signed by a different secret — all of which
    // mean "no session" as far as callers are concerned.
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
  secure: isProduction,
} as const;

/** Attributes used when clearing the cookie; must match those used to set it. */
export const clearCookieOptions = {
  ...cookieOptions,
  maxAge: 0,
} as const;
