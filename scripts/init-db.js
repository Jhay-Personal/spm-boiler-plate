/* eslint-disable */
// ---------------------------------------------------------------------------
// Initializes the admin schema and seeds the default super-admin account.
// Run with:  npm run init-db
// ---------------------------------------------------------------------------
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

// --- tiny .env loader (no dotenv dependency) --------------------------------
function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

async function main() {
  loadEnv();

  if (!process.env.DATABASE_URL) {
    console.error("✗ DATABASE_URL is not set. Copy .env.example to .env first.");
    process.exit(1);
  }

  const ssl =
    String(process.env.DATABASE_SSL).toLowerCase() === "true"
      ? { rejectUnauthorized: false }
      : false;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl });

  const email = process.env.SEED_ADMIN_EMAIL || "admin@email.com";
  const password = process.env.SEED_ADMIN_PASSWORD || "123123123";

  try {
    console.log("→ Applying schema (db/admin_schema.sql) ...");
    const sql = fs.readFileSync(
      path.join(process.cwd(), "db", "admin_schema.sql"),
      "utf8"
    );
    await pool.query(sql);

    console.log("→ Ensuring Super Admin role ...");
    const roleRes = await pool.query(
      `INSERT INTO roles (name, description, modules, is_super)
       VALUES ('Super Admin', 'Full access to every module', '[]'::jsonb, TRUE)
       ON CONFLICT (name) DO UPDATE SET is_super = TRUE
       RETURNING id`
    );
    const superRoleId = roleRes.rows[0].id;

    console.log(`→ Ensuring default admin (${email}) ...`);
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO admin_users (full_name, email, password_hash, role_id, status)
       VALUES ('Administrator', $1, $2, $3, 'active')
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             role_id       = EXCLUDED.role_id,
             status        = 'active',
             updated_at    = NOW()`,
      [email, hash, superRoleId]
    );

    // A couple of handy example roles (only if they don't exist yet).
    await pool.query(
      `INSERT INTO roles (name, description, modules, is_super)
       VALUES
         ('Content Manager', 'Manage viral posts and generated content',
          '["dashboard","viral_posts","generated_content"]'::jsonb, FALSE),
         ('Viewer', 'Read-only dashboard access',
          '["dashboard"]'::jsonb, FALSE)
       ON CONFLICT (name) DO NOTHING`
    );

    console.log("\n✓ Database ready.");
    console.log("  Login:", email);
    console.log("  Password:", password);
  } catch (err) {
    console.error("\n✗ init-db failed:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
