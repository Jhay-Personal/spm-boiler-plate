import { afterEach, describe, expect, it, vi } from "vitest";
import { describeError, logger } from "@/lib/logger";

// The redaction list is what stops a future contributor logging a request
// body that happens to contain a password.

function captureLog(fn: () => void): Record<string, unknown> {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  fn();
  const line = spy.mock.calls[0]?.[0] as string;
  spy.mockRestore();
  return JSON.parse(line);
}

function captureError(fn: () => void): Record<string, unknown> {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  fn();
  const line = spy.mock.calls[0]?.[0] as string;
  spy.mockRestore();
  return JSON.parse(line);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("log format", () => {
  it("emits one JSON object per line", () => {
    const entry = captureLog(() => logger.info("something happened"));
    expect(entry.message).toBe("something happened");
    expect(entry.level).toBe("info");
    expect(typeof entry.timestamp).toBe("string");
    expect(new Date(entry.timestamp as string).toString()).not.toBe("Invalid Date");
  });

  it("merges context onto the entry", () => {
    const entry = captureLog(() => logger.info("user created", { userId: 7 }));
    expect(entry.userId).toBe(7);
  });

  it("sends errors to console.error so they can be routed separately", () => {
    const entry = captureError(() => logger.error("boom"));
    expect(entry.level).toBe("error");
  });

  it("sends warnings to console.warn", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logger.warn("careful", { ip: "203.0.113.5" });
    const entry = JSON.parse(spy.mock.calls[0]?.[0] as string);
    expect(entry.level).toBe("warn");
    expect(entry.ip).toBe("203.0.113.5");
  });

  it("emits debug entries on the standard channel", () => {
    const entry = captureLog(() => logger.debug("detail"));
    expect(entry.level).toBe("debug");
  });

  it("never lets logging itself throw on unserialisable context", () => {
    // A BigInt cannot be JSON.stringify'd. Since this logger is called from
    // the catch-all route wrapper, throwing here would convert a handled
    // error into an unhandled one.
    const entry = captureLog(() => logger.info("x", { count: 10n }));
    expect(entry.message).toBe("x");
    expect(entry.logError).toBe("context could not be serialised");
  });

  it("truncates rather than recursing without bound", () => {
    let deep: Record<string, unknown> = { value: "bottom" };
    for (let i = 0; i < 20; i += 1) deep = { nested: deep };
    const entry = captureLog(() => logger.info("x", { deep }));
    expect(JSON.stringify(entry)).toContain("[truncated]");
  });

  it("does not collapse two separate references to the same object", () => {
    // Only a genuine cycle should become "[circular]"; a shared sibling
    // reference is ordinary and must still be logged.
    const shared = { id: 1 };
    const entry = captureLog(() => logger.info("x", { a: shared, b: shared }));
    expect(entry.a).toEqual({ id: 1 });
    expect(entry.b).toEqual({ id: 1 });
  });
});

describe("redaction", () => {
  it.each([
    "password",
    "new_password",
    "current_password",
    "password_hash",
    "token",
    "secret",
  ])("redacts a top-level %s", (key) => {
    const entry = captureLog(() => logger.info("x", { [key]: "hunter2-in-the-clear" }));
    expect(entry[key]).toBe("[redacted]");
    expect(JSON.stringify(entry)).not.toContain("hunter2-in-the-clear");
  });

  it("redacts regardless of key casing", () => {
    const entry = captureLog(() => logger.info("x", { Password: "sensitive-value" }));
    expect(JSON.stringify(entry)).not.toContain("sensitive-value");
  });

  it("redacts inside a nested object, e.g. a spread request body", () => {
    const entry = captureLog(() =>
      logger.info("x", { body: { full_name: "Jane", password: "sensitive-value" } }),
    );
    expect(JSON.stringify(entry)).not.toContain("sensitive-value");
    expect(JSON.stringify(entry)).toContain("Jane");
  });

  it("redacts inside arrays of objects", () => {
    const entry = captureLog(() =>
      logger.info("x", { users: [{ id: 1, password: "sensitive-value" }] }),
    );
    expect(JSON.stringify(entry)).not.toContain("sensitive-value");
  });

  it("keeps non-sensitive fields intact", () => {
    const entry = captureLog(() =>
      logger.info("x", { userId: 3, ip: "203.0.113.5", roleChanged: true }),
    );
    expect(entry.userId).toBe(3);
    expect(entry.ip).toBe("203.0.113.5");
    expect(entry.roleChanged).toBe(true);
  });

  it("does not hang or throw on a circular structure", () => {
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;
    expect(() => captureLog(() => logger.info("x", { circular }))).not.toThrow();
  });

  it("survives a null value in context", () => {
    const entry = captureLog(() => logger.info("x", { photo: null }));
    expect(entry.photo).toBeNull();
  });
});

describe("describeError", () => {
  it("extracts name, message and stack from an Error", () => {
    const described = describeError(new Error("kaboom"));
    expect(described.errorName).toBe("Error");
    expect(described.errorMessage).toBe("kaboom");
    expect(typeof described.stack).toBe("string");
  });

  it("includes a driver error code when present", () => {
    const err = Object.assign(new Error("dup"), { code: "23505" });
    expect(describeError(err).errorCode).toBe("23505");
  });

  it("handles a thrown non-Error", () => {
    expect(describeError("just a string").errorMessage).toBe("just a string");
    expect(describeError(undefined).errorMessage).toBe("undefined");
  });
});
