import "server-only";
import { Pool, types, type PoolConfig, type QueryResultRow } from "pg";
import { databaseCaCert, databaseSsl, databaseUrl } from "./env";

// ---------------------------------------------------------------------------
// Driver type parsers
//
// node-postgres returns some types as strings by default. Both defaults are
// wrong for this schema, and both fail silently rather than loudly, so they
// are corrected once here instead of at every call site.
// ---------------------------------------------------------------------------

// INT8 (BIGINT / BIGSERIAL) arrives as a string, because values above 2^53
// cannot round-trip through a JS number. Every BIGINT here is an admin-table
// primary key — user and role ids — which will never come close to that.
// Left as strings they compare falsely against numbers (`"1" === 1` is false),
// which silently breaks both the session payload and the "is this me?" checks
// that stop a user editing their own role.
types.setTypeParser(types.builtins.INT8, (value: string) => Number(value));

// TIMESTAMPTZ arrives as a Date. Dates cross the server/client boundary
// inconsistently (JSON gives an ISO string, an RSC payload gives a Date), so
// normalise to an ISO string, which is what the `created_at: string` types say.
types.setTypeParser(types.builtins.TIMESTAMPTZ, (value: string) =>
  new Date(value).toISOString(),
);

// A single shared connection pool, cached on globalThis so Next's dev-mode hot
// reload doesn't open a new pool on every edit.
const globalForPg = globalThis as typeof globalThis & {
  __adminPgPool?: Pool;
};

function makePool(): Pool {
  const config: PoolConfig = {
    connectionString: databaseUrl(),
    max: 10,
    // Fail fast rather than hanging a request forever on an unreachable host.
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  };

  if (databaseSsl()) {
    const ca = databaseCaCert();
    // `rejectUnauthorized: true` is the point of this block. Encrypting the
    // link without verifying the certificate chain leaves it open to an
    // undetectable machine-in-the-middle, which is exactly the risk on the
    // managed providers where DATABASE_SSL gets switched on.
    config.ssl = ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
  } else {
    config.ssl = false;
  }

  return new Pool(config);
}

/**
 * Lazily create the pool on first use, so `next build` — which imports route
 * modules to collect metadata — doesn't require DATABASE_URL at build time.
 */
export function getPool(): Pool {
  if (!globalForPg.__adminPgPool) {
    globalForPg.__adminPgPool = makePool();
  }
  return globalForPg.__adminPgPool;
}

/**
 * Run a parameterized query and return the rows.
 *
 * Always pass user input through `params` ($1, $2, …). Never interpolate it
 * into `text` — that is how SQL injection gets in.
 */
export async function query<T extends QueryResultRow>(
  text: string,
  params?: readonly unknown[],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params ? [...params] : undefined);
  return result.rows;
}

/** Same as `query`, but returns how many rows the statement affected. */
export async function execute(
  text: string,
  params?: readonly unknown[],
): Promise<number> {
  const result = await getPool().query(text, params ? [...params] : undefined);
  return result.rowCount ?? 0;
}

/** Returns the first row, or null when the query matched nothing. */
export async function one<T extends QueryResultRow>(
  text: string,
  params?: readonly unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Postgres unique-violation error code, used to turn 500s into clean 409s. */
export const PG_UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === PG_UNIQUE_VIOLATION
  );
}

/** The name of the constraint a Postgres error violated, when it reports one. */
export function violatedConstraint(err: unknown): string | null {
  if (typeof err !== "object" || err === null || !("constraint" in err)) {
    return null;
  }
  const constraint = (err as { constraint?: unknown }).constraint;
  return typeof constraint === "string" ? constraint : null;
}
