import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientIp, hit, reset } from "@/lib/rate-limit";

// The login limiter is the only thing standing between a published admin
// email and unlimited password guesses.

describe("hit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows attempts up to the limit and blocks the next one", () => {
    const key = `k-${Math.random()}`;
    for (let i = 0; i < 5; i += 1) {
      expect(hit(key, 5, 60_000).allowed).toBe(true);
    }
    expect(hit(key, 5, 60_000).allowed).toBe(false);
  });

  it("reports how long to wait", () => {
    const key = `k-${Math.random()}`;
    for (let i = 0; i < 3; i += 1) hit(key, 3, 60_000);
    const blocked = hit(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.retryAfter).toBeLessThanOrEqual(60);
  });

  it("reports retryAfter 0 while still allowed", () => {
    expect(hit(`k-${Math.random()}`, 3, 60_000).retryAfter).toBe(0);
  });

  it("keeps separate counters per key", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    for (let i = 0; i < 3; i += 1) hit(a, 3, 60_000);
    expect(hit(a, 3, 60_000).allowed).toBe(false);
    // Throttling one account must not throttle everybody else.
    expect(hit(b, 3, 60_000).allowed).toBe(true);
  });

  it("lets attempts through again once the window has passed", () => {
    const key = `k-${Math.random()}`;
    for (let i = 0; i < 3; i += 1) hit(key, 3, 60_000);
    expect(hit(key, 3, 60_000).allowed).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(hit(key, 3, 60_000).allowed).toBe(true);
  });

  it("does not reset the window early on a partially elapsed window", () => {
    const key = `k-${Math.random()}`;
    for (let i = 0; i < 3; i += 1) hit(key, 3, 60_000);
    vi.advanceTimersByTime(30_000);
    expect(hit(key, 3, 60_000).allowed).toBe(false);
  });

  it("stays blocked while attempts keep arriving inside the window", () => {
    const key = `k-${Math.random()}`;
    for (let i = 0; i < 3; i += 1) hit(key, 3, 60_000);
    for (let i = 0; i < 20; i += 1) {
      vi.advanceTimersByTime(1_000);
      expect(hit(key, 3, 60_000).allowed).toBe(false);
    }
  });
});

describe("memory bound", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sweeps expired entries so the map cannot grow without bound", () => {
    // Every distinct identifier and IP creates a bucket. Without the sweep,
    // a long-running process under a spray attack would leak memory forever.
    const prefix = `sweep-${Math.random()}`;
    for (let i = 0; i < 10_050; i += 1) {
      hit(`${prefix}-${i}`, 1, 1_000);
    }
    vi.advanceTimersByTime(2_000);

    // The next call crosses the cleanup threshold and must not throw.
    expect(() => hit(`${prefix}-trigger`, 1, 1_000)).not.toThrow();
    // Expired keys behave as brand new ones.
    expect(hit(`${prefix}-0`, 1, 1_000).allowed).toBe(true);
  });
});

describe("reset", () => {
  it("clears a key, as happens after a successful sign-in", () => {
    const key = `k-${Math.random()}`;
    for (let i = 0; i < 3; i += 1) hit(key, 3, 60_000);
    expect(hit(key, 3, 60_000).allowed).toBe(false);
    reset(key);
    expect(hit(key, 3, 60_000).allowed).toBe(true);
  });

  it("is harmless on a key that was never used", () => {
    expect(() => reset("never-seen")).not.toThrow();
  });
});

describe("clientIp", () => {
  const req = (headers: Record<string, string>) =>
    new Request("http://localhost/api/auth/login", { headers });

  it("reads the first entry of x-forwarded-for", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe(
      "203.0.113.5",
    );
  });

  it("trims whitespace", () => {
    expect(clientIp(req({ "x-forwarded-for": "  203.0.113.5  " }))).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip", () => {
    expect(clientIp(req({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
  });

  it("prefers x-forwarded-for over x-real-ip", () => {
    expect(
      clientIp(req({ "x-forwarded-for": "203.0.113.5", "x-real-ip": "198.51.100.7" })),
    ).toBe("203.0.113.5");
  });

  it("returns a stable placeholder when no header is present", () => {
    // Never returns empty: an empty key would merge every anonymous caller
    // into one bucket by accident rather than by design.
    expect(clientIp(req({}))).toBe("unknown");
  });

  it("does not crash on a malformed header", () => {
    expect(() => clientIp(req({ "x-forwarded-for": ",,," }))).not.toThrow();
    expect(clientIp(req({ "x-forwarded-for": ",,," }))).toBe("unknown");
  });
});
