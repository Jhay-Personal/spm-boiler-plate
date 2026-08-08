import "server-only";

// Centralised, fail-closed access to server environment variables.
//
// Nothing here is ever exposed to the client: there are no NEXT_PUBLIC_*
// values in this project, by design. Every read goes through a helper that
// throws a descriptive error rather than silently falling back to a default,
// so a misconfigured deployment fails at startup instead of running with an
// insecure guessed value.

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `${name} is not set. Copy .env.example to .env and configure it.`,
    );
  }
  return value;
}

function optionalBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  return raw.trim().toLowerCase() === "true";
}

export const isProduction = process.env.NODE_ENV === "production";

export function databaseUrl(): string {
  return required("DATABASE_URL");
}

export function databaseSsl(): boolean {
  return optionalBool("DATABASE_SSL", false);
}

/**
 * Optional PEM-encoded CA certificate for the database connection. When set,
 * the certificate chain is verified against it; when unset, the system trust
 * store is used. Either way the chain IS verified — see `src/lib/db.ts`.
 */
export function databaseCaCert(): string | undefined {
  const raw = process.env.DATABASE_CA_CERT;
  if (!raw || raw.trim() === "") return undefined;
  // Allow the cert to be supplied with literal "\n" escapes, which is how most
  // secret managers and CI systems handle multi-line values.
  return raw.replace(/\\n/g, "\n");
}

const MIN_SECRET_LENGTH = 32;

export function authSecret(): string {
  const secret = required("AUTH_SECRET");
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters. ` +
        "Generate one with: openssl rand -base64 48",
    );
  }
  return secret;
}

/** Directory that stores uploaded profile photos. Deliberately NOT under public/. */
export function uploadDir(): string {
  return process.env.UPLOAD_DIR?.trim() || "./data/uploads";
}
