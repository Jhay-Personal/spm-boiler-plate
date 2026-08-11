import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests: pure logic, no database, no server, no network.
// These are the fast gate — they run anywhere, including a clean CI checkout.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws by design when imported outside an RSC bundle.
      // The package ships an empty module for exactly this case, which is
      // what a React Server Components bundler resolves it to.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Scoped to the pure-logic modules these tests own, so the number means
      // something. The rest of src/lib (db, api, guard, auth, session) is
      // exercised end-to-end by `npm run test:api` against a real server —
      // counting it here would report a misleadingly low figure for code that
      // is in fact well covered, just by the other suite.
      include: [
        "src/lib/modules.ts",
        "src/lib/validation.ts",
        "src/lib/form-errors.ts",
        "src/lib/toasts.ts",
        "src/lib/uploads.ts",
        "src/lib/rate-limit.ts",
        "src/lib/logger.ts",
        "src/features/theme/theme.ts",
      ],
      reporter: ["text-summary"],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});
