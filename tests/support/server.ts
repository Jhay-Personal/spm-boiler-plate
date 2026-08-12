import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

// Shared by both integration harnesses: the vitest API suite and the Playwright
// E2E suite. Deliberately end-to-end — these suites exist to exercise the real
// request pipeline, and mocking it would mean testing the mocks.
//
// DESTRUCTIVE. `startTestServer` drops `admin_users` and `roles` from whatever
// database it is pointed at, so the two suites must never run concurrently
// against the same one. `npm run verify` runs them in sequence for this reason,
// and the E2E suite honours E2E_DATABASE_URL so they can be separated outright.

/** Fixed credentials for the seeded super admin used by both suites. */
export const TEST_ADMIN_EMAIL = "test-admin@example.test";
export const TEST_ADMIN_PASSWORD = "TestAdminPassword123";

let server: ChildProcess | undefined;

export function loadDotEnv(): void {
  const envPath = path.join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function waitForServer(baseUrl: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/login`);
      if (res.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server did not become ready at ${baseUrl} within ${timeoutMs}ms`);
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit", shell: false });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)),
    );
    child.on("error", reject);
  });
}

export type StartOptions = {
  port: number;
  /** Directory under ./data for this suite's uploads, so the two never share. */
  uploadDirName: string;
  /**
   * Name of the environment variable holding this suite's database URL, e.g.
   * "TEST_DATABASE_URL". Falls back to DATABASE_URL when that variable is unset.
   *
   * Deliberately the variable NAME rather than its value: callers run before
   * loadDotEnv() below, so reading process.env in the caller would see nothing
   * from .env and silently fall back to the developer's own database — which
   * this function then wipes.
   */
  databaseUrlVar?: string;
};

/** Resets the database, seeds the admin, boots `next start`, returns the base URL. */
export async function startTestServer(options: StartOptions): Promise<string> {
  loadDotEnv();

  const databaseUrl =
    (options.databaseUrlVar ? process.env[options.databaseUrlVar] : undefined) ??
    process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set. The integration tests need a real PostgreSQL database.\n" +
        "  See the 'Testing' section of the README for a one-line Docker command.",
    );
  }
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
    throw new Error(
      "AUTH_SECRET must be set (32+ characters) to run the integration tests.",
    );
  }

  const uploadDir = path.join(process.cwd(), "data", options.uploadDirName);
  rmSync(uploadDir, { recursive: true, force: true });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: databaseUrl,
    UPLOAD_DIR: uploadDir,
    SEED_ADMIN_EMAIL: TEST_ADMIN_EMAIL,
    SEED_ADMIN_PASSWORD: TEST_ADMIN_PASSWORD,
  };

  // Start from a known state: drop the admin tables so the seed is
  // deterministic and a previous run cannot influence this one.
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP TABLE IF EXISTS admin_users CASCADE");
    await pool.query("DROP TABLE IF EXISTS roles CASCADE");
  } finally {
    await pool.end();
  }

  await run("npm", ["run", "init-db"], env);

  if (!existsSync(path.join(process.cwd(), ".next"))) {
    throw new Error(
      "No production build found. Run `npm run build` before the integration tests.",
    );
  }

  server = spawn(
    "npx",
    ["next", "start", "-p", String(options.port), "-H", "127.0.0.1"],
    { env, stdio: "ignore", shell: false, detached: false },
  );
  server.on("error", (err) => {
    throw err;
  });

  const baseUrl = `http://127.0.0.1:${options.port}`;
  await waitForServer(baseUrl);
  return baseUrl;
}

export async function stopTestServer(uploadDirName: string): Promise<void> {
  if (server && !server.killed) {
    server.kill("SIGTERM");
    // Give it a moment to release the port before the next run.
    await new Promise((r) => setTimeout(r, 500));
    if (!server.killed) server.kill("SIGKILL");
  }
  server = undefined;
  rmSync(path.join(process.cwd(), "data", uploadDirName), {
    recursive: true,
    force: true,
  });
}
