import { Pool } from "pg";

// A single shared connection pool across hot reloads in dev.
const globalForPg = globalThis;

function makePool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and configure it."
    );
  }
  const ssl =
    String(process.env.DATABASE_SSL).toLowerCase() === "true"
      ? { rejectUnauthorized: false }
      : false;
  return new Pool({ connectionString, ssl, max: 10 });
}

// Lazily create the pool on first use so `next build` (which imports route
// modules to collect metadata) doesn't require DATABASE_URL at build time.
export function getPool() {
  if (!globalForPg.__2niPool) {
    globalForPg.__2niPool = makePool();
  }
  return globalForPg.__2niPool;
}

export function query(text, params) {
  return getPool().query(text, params);
}

// Returns the first row or null.
export async function one(text, params) {
  const { rows } = await getPool().query(text, params);
  return rows[0] || null;
}

// Check whether a table exists in the current database (public schema).
export async function tableExists(name) {
  const { rows } = await getPool().query(
    `SELECT to_regclass($1) AS reg`,
    [`public.${name}`]
  );
  return Boolean(rows[0] && rows[0].reg);
}
