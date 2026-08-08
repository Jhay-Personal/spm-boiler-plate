import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

// Boots a real server against a real database for the integration tests.
//
// Deliberately end-to-end: these tests exercise the access-control guarantees,
// and mocking the database or the request pipeline would mean testing the
// mocks instead of the guards. Everything runs against `next start` over HTTP,
// the same path a browser takes.

const PORT = Number(process.env.TEST_PORT ?? 3311);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/** Fixed credentials for the seeded super admin used by every API test. */
export const TEST_ADMIN_EMAIL = "test-admin@example.test";
export const TEST_ADMIN_PASSWORD = "TestAdminPassword123";

let server: ChildProcess | undefined;

function loadDotEnv(): void {
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

async function waitForServer(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/login`);
      if (res.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server did not become ready at ${BASE_URL} within ${timeoutMs}ms`);
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

export async function setup(): Promise<void> {
  loadDotEnv();

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. The API tests need a real PostgreSQL database.\n" +
        "  See the 'Testing' section of the README for a one-line Docker command.",
    );
  }
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
    throw new Error("AUTH_SECRET must be set (32+ characters) to run the API tests.");
  }

  const uploadDir = path.join(process.cwd(), "data", "test-uploads");
  rmSync(uploadDir, { recursive: true, force: true });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    UPLOAD_DIR: uploadDir,
    SEED_ADMIN_EMAIL: TEST_ADMIN_EMAIL,
    SEED_ADMIN_PASSWORD: TEST_ADMIN_PASSWORD,
  };

  // Start from a known state: drop the admin tables so the seed is
  // deterministic and a previous run cannot influence this one.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query("DROP TABLE IF EXISTS admin_users CASCADE");
    await pool.query("DROP TABLE IF EXISTS roles CASCADE");
  } finally {
    await pool.end();
  }

  await run("npm", ["run", "init-db"], env);

  if (!existsSync(path.join(process.cwd(), ".next"))) {
    throw new Error(
      "No production build found. Run `npm run build` before `npm run test:api`.",
    );
  }

  server = spawn(
    "npx",
    ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"],
    { env, stdio: "ignore", shell: false, detached: false },
  );
  server.on("error", (err) => {
    throw err;
  });

  await waitForServer();
  process.env.TEST_BASE_URL = BASE_URL;
}

export async function teardown(): Promise<void> {
  if (server && !server.killed) {
    server.kill("SIGTERM");
    // Give it a moment to release the port before the next run.
    await new Promise((r) => setTimeout(r, 500));
    if (!server.killed) server.kill("SIGKILL");
  }
  rmSync(path.join(process.cwd(), "data", "test-uploads"), {
    recursive: true,
    force: true,
  });
}
