import type { NextRequest } from "next/server";
import { one } from "@/lib/db";
import { burnPasswordComparison, verifyPassword } from "@/lib/auth";
import { SESSION_COOKIE, cookieOptions, signSession } from "@/lib/session";
import { HttpError, ok, parseJson, route } from "@/lib/api";
import { clientIp, hit, reset } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { loginSchema } from "@/features/auth/schema";
import type { UserStatus } from "@/lib/types";

export const runtime = "nodejs";

// Two independent limits. The per-identifier limit is the important one: it
// survives an attacker rotating source IPs or spoofing x-forwarded-for, and it
// is what actually caps guesses against a specific account.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_IP = 20;
const MAX_ATTEMPTS_PER_IDENTIFIER = 8;

type LoginRow = {
  id: number;
  password_hash: string;
  status: UserStatus;
  token_version: number;
};

export const POST = route("POST /api/auth/login", async (request: NextRequest) => {
  const ip = clientIp(request);
  const { identifier, password } = await parseJson(request, loginSchema);
  const identifierKey = identifier.toLowerCase();

  const ipLimit = hit(`login:ip:${ip}`, MAX_ATTEMPTS_PER_IP, WINDOW_MS);
  const idLimit = hit(
    `login:id:${identifierKey}`,
    MAX_ATTEMPTS_PER_IDENTIFIER,
    WINDOW_MS,
  );

  if (!ipLimit.allowed || !idLimit.allowed) {
    const retryAfter = Math.max(ipLimit.retryAfter, idLimit.retryAfter);
    logger.warn("login throttled", { ip, retryAfter });
    throw new HttpError(
      429,
      "TOO_MANY_ATTEMPTS",
      `Too many sign-in attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
    );
  }

  const user = await one<LoginRow>(
    `SELECT id, password_hash, status, token_version
       FROM admin_users
      WHERE lower(email) = lower($1) OR mobile = $1
      LIMIT 1`,
    [identifier],
  );

  // The same generic message and the same amount of work for every failure
  // mode, so neither the wording nor the response time reveals whether the
  // identifier exists or the account is disabled.
  const invalid = new HttpError(
    401,
    "INVALID_CREDENTIALS",
    "Invalid email/mobile or password.",
  );

  if (!user) {
    await burnPasswordComparison(password);
    logger.warn("login failed: unknown identifier", { ip });
    throw invalid;
  }

  const passwordOk = await verifyPassword(password, user.password_hash);
  if (!passwordOk) {
    logger.warn("login failed: bad password", { ip, userId: user.id });
    throw invalid;
  }

  if (user.status !== "active") {
    logger.warn("login failed: account disabled", { ip, userId: user.id });
    throw invalid;
  }

  const token = await signSession({ uid: user.id, tv: user.token_version });

  reset(`login:id:${identifierKey}`);
  reset(`login:ip:${ip}`);
  logger.info("login succeeded", { ip, userId: user.id });

  const response = ok({ id: user.id });
  response.cookies.set(SESSION_COOKIE, token, cookieOptions);
  return response;
});
