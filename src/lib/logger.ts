import "server-only";

// Minimal structured logger. One JSON object per line so that log shippers
// (CloudWatch, Cloud Logging, Loki, …) can parse it without a custom grok
// rule, while staying readable in a local terminal.

export type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

/**
 * Keys whose values are never written to logs, at any depth. Guards against a
 * caller accidentally spreading a request body or a database row that happens
 * to contain credentials.
 */
const REDACTED_KEYS = new Set([
  "password",
  "new_password",
  "current_password",
  "password_hash",
  "token",
  "authorization",
  "cookie",
  "auth_secret",
  "secret",
]);

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACTED_KEYS.has(key.toLowerCase())
      ? "[redacted]"
      : scrub(val, depth + 1);
  }
  return out;
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context ? (scrub(context) as LogContext) : {}),
  };

  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * Turns an unknown thrown value into something loggable. Note that the stack
 * is recorded in the log only — it is never returned to the client.
 */
export function describeError(err: unknown): LogContext {
  if (err instanceof Error) {
    return {
      errorName: err.name,
      errorMessage: err.message,
      stack: err.stack,
      ...("code" in err ? { errorCode: (err as { code?: unknown }).code } : {}),
    };
  }
  return { errorMessage: String(err) };
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, context?: LogContext) => emit("error", message, context),
};
