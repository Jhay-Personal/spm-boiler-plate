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

const MAX_DEPTH = 6;

/**
 * Recursively copies `value`, replacing sensitive keys with a placeholder.
 *
 * `seen` breaks reference cycles. Without it a cyclic object would survive
 * into JSON.stringify and throw — and because this logger is called from the
 * catch-all route wrapper, that would turn a handled error into an unhandled
 * one at exactly the wrong moment.
 */
function scrub(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (seen.has(value)) return "[circular]";

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => scrub(item, depth + 1, seen));
    }

    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED_KEYS.has(key.toLowerCase())
        ? "[redacted]"
        : scrub(val, depth + 1, seen);
    }
    return out;
  } finally {
    // Sibling references to the same object are fine — only a genuine cycle
    // (an ancestor repeating) should be collapsed.
    seen.delete(value);
  }
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context ? (scrub(context) as LogContext) : {}),
  };

  let line: string;
  try {
    line = JSON.stringify(entry);
  } catch {
    // Last resort: never let logging itself become the failure.
    line = JSON.stringify({
      timestamp: entry.timestamp,
      level,
      message,
      logError: "context could not be serialised",
    });
  }

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
