import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Integration tests: a real `next start` server against a real PostgreSQL
// database, driven over HTTP. See tests/api/setup/globalSetup.ts.
//
// Requires DATABASE_URL and AUTH_SECRET, and a prior `npm run build`.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/api/**/*.test.ts"],
    globalSetup: ["./tests/api/setup/globalSetup.ts"],
    // The suite shares one server and one database, and several tests assert
    // on global state (rate-limit counters, the user list). Running files
    // sequentially keeps them honest and independent of scheduling.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
