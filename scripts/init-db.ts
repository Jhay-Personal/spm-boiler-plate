// ---------------------------------------------------------------------------
// Applies the admin schema and ensures the initial super-admin account exists.
//
//   npm run init-db
//
// Safe to run repeatedly, and safe to run on every container start: it never
// overwrites an existing account's password. That matters — an earlier version
// of this script used ON CONFLICT DO UPDATE on password_hash, which silently
// reverted the administrator's chosen password to the seed value on each
// restart.
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { Pool, type PoolConfig } from "pg";

const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 12;

/** Minimal .env loader so the script needs no dotenv dependency. */
function loadEnv(): void {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  for (const rawLine of fs.readFileSync(envPath, "utf8").split("\n")) {
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

function fatal(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  loadEnv();

  if (!process.env.DATABASE_URL) {
    fatal("DATABASE_URL is not set. Copy .env.example to .env first.");
  }

  // No fallback credentials. A seed account whose password is baked into the
  // source is a published credential, not a default.
  const email = process.env.SEED_ADMIN_EMAIL?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email) {
    fatal("SEED_ADMIN_EMAIL is not set. Choose the first admin's email address.");
  }
  if (!password) {
    fatal(
      "SEED_ADMIN_PASSWORD is not set. Generate one with: openssl rand -base64 24",
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    fatal(`SEED_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const config: PoolConfig = { connectionString: process.env.DATABASE_URL };
  if (String(process.env.DATABASE_SSL).toLowerCase() === "true") {
    const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");
    // Verify the chain — see the matching note in src/lib/db.ts.
    config.ssl = ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
  }

  const pool = new Pool(config);

  try {
    console.log("→ Applying schema (db/admin_schema.sql) …");
    const sql = fs.readFileSync(
      path.join(process.cwd(), "db", "admin_schema.sql"),
      "utf8",
    );
    await pool.query(sql);

    console.log("→ Ensuring the Super Admin group …");
    const roleResult = await pool.query<{ id: number }>(
      `INSERT INTO roles (name, description, modules, is_super)
       VALUES ('Super Admin', 'Full access to every module', '[]'::jsonb, TRUE)
       ON CONFLICT (name) DO UPDATE SET is_super = TRUE
       RETURNING id`,
    );
    const superRoleId = roleResult.rows[0]?.id;
    if (superRoleId === undefined) fatal("Could not resolve the Super Admin role.");

    console.log(`→ Ensuring the initial admin (${email}) …`);
    const hash = await bcrypt.hash(password, BCRYPT_COST);
    const inserted = await pool.query(
      `INSERT INTO admin_users (full_name, email, password_hash, role_id, status)
       VALUES ('Administrator', $1, $2, $3, 'active')
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [email, hash, superRoleId],
    );

    // Example non-super group, so Role Management isn't empty on first run.
    await pool.query(
      `INSERT INTO roles (name, description, modules, is_super)
       VALUES ('Viewer', 'Read-only dashboard access', '["dashboard"]'::jsonb, FALSE)
       ON CONFLICT (name) DO NOTHING`,
    );

    console.log("\n✓ Database ready.");
    if (inserted.rowCount) {
      console.log(`  Created the initial admin: ${email}`);
      console.log("  Sign in with the password from SEED_ADMIN_PASSWORD.");
    } else {
      console.log(`  Admin ${email} already exists — password left unchanged.`);
    }
    // The password itself is deliberately never printed: on the Docker path
    // this script runs on every start, and its output goes to the container
    // log and onward to any log aggregator.
  } catch (err) {
    console.error(
      "\n✗ init-db failed:",
      err instanceof Error ? err.message : String(err),
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
