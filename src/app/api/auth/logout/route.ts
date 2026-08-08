import { SESSION_COOKIE, clearCookieOptions } from "@/lib/session";
import { ok, route } from "@/lib/api";

export const runtime = "nodejs";

export const POST = route("POST /api/auth/logout", async () => {
  const response = ok({ signedOut: true });
  // Cleared with the same attributes it was set with — a cookie whose path,
  // sameSite or secure flag differs is a *different* cookie to the browser and
  // the original would survive.
  response.cookies.set(SESSION_COOKIE, "", clearCookieOptions);
  return response;
});
