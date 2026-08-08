import type { NextConfig } from "next";

// Static security headers. The Content-Security-Policy is NOT set here — it
// carries a per-request nonce and is emitted from `src/proxy.ts` instead.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Never ship a build that does not type-check. (Next 16 removed `next lint`
  // and its config key — linting is a standalone `npm run lint` step now.)
  typescript: { ignoreBuildErrors: false },

  // Don't advertise the framework version to attackers.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
