import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

// Next 16 middleware ("proxy"). Two jobs, and deliberately only two:
//
//   1. Emit a per-request CSP nonce (a static next.config header cannot).
//   2. Bounce obviously-signed-out browsers to /login so they don't render a
//      page shell they will only be redirected away from.
//
// IMPORTANT — this is NOT the access control boundary.
//
// It checks only that a session cookie is *present*; it does not verify the
// signature and it knows nothing about roles. Real authentication and
// authorization happen inside every page and API route, via requireUser() /
// requireModule() / requirePageModule() in src/lib/guard.ts.
//
// That split is intentional. Middleware-only authorization has been a
// repeated source of framework-level bypasses (a spoofed internal header was
// enough to skip it entirely in CVE-2025-29927), and it cannot express
// per-module rules anyway. Treating this file as a UX optimisation means a
// bypass here costs nothing: the handler still refuses.

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function buildCsp(nonce: string, isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    // 'strict-dynamic' lets the nonced Next bootstrap script load its own
    // chunks without us having to enumerate them. Dev additionally needs
    // 'unsafe-eval' for React Fast Refresh.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval'" : ""}`.trim(),
    // Next injects small inline <style> blocks for its CSS; there is no nonce
    // hook for those, so inline styles stay permitted.
    "style-src 'self' 'unsafe-inline'",
    // blob: covers the local preview shown while a photo is uploading.
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    isDev ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ];
  return directives.join("; ");
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const isDev = process.env.NODE_ENV !== "production";

  // Web Crypto is available in both the edge and node runtimes.
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const csp = buildCsp(nonce, isDev);

  // Pass the nonce down to the root layout so the inline theme script can
  // carry it. Forwarding it as a request header is the only way a server
  // component can read a value produced here.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  let response: NextResponse;

  if (!hasSessionCookie && !isPublic(pathname)) {
    if (pathname.startsWith("/api/")) {
      response = NextResponse.json(
        {
          success: false,
          data: null,
          error: { code: "UNAUTHORIZED", message: "You are not signed in." },
        },
        { status: 401 },
      );
    } else {
      response = NextResponse.redirect(new URL("/login", request.url));
    }
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Run on everything except Next's own static output and the app icons —
  // browsers fetch those without a session and a redirect to /login would
  // just be a broken image.
  //
  // Uploaded photos are NOT exempt: they are no longer served from /public,
  // they go through the authenticated /api/uploads route.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon).*)"],
};
