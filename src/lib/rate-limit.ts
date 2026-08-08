import "server-only";

// In-memory fixed-window rate limiter.
//
// SCOPE: this is per-process state. It is the right tool for a single-instance
// deployment (the docker-compose setup in this repo) and it meaningfully stops
// online password guessing there. It is NOT sufficient behind a load balancer
// with several app instances, where each instance would keep its own counters:
// swap `hit()` for a Redis INCR with the same signature. See README.

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

// Cheap amortised cleanup so the map cannot grow without bound.
const MAX_TRACKED_KEYS = 10_000;

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the caller may try again. Zero when allowed. */
  retryAfter: number;
};

/**
 * Records one attempt against `key` and reports whether it is allowed.
 *
 * @param limit  attempts permitted per window
 * @param windowMs  window length in milliseconds
 */
export function hit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  if (buckets.size > MAX_TRACKED_KEYS) sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfter: 0 };
}

/** Clears a key's counter — called after a successful sign-in. */
export function reset(key: string): void {
  buckets.delete(key);
}

/**
 * Best-effort client IP.
 *
 * `x-forwarded-for` is client-controlled unless a trusted proxy overwrites it,
 * so this is a throttling aid, not an identity. The login limiter also keys on
 * the submitted identifier precisely so that a spoofed IP header does not buy
 * an attacker unlimited guesses against one account.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
