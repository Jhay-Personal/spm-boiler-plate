import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  emailSchema,
  fullNameSchema,
  mobileSchema,
  moduleKeysSchema,
  passwordSchema,
  photoUrlSchema,
  roleIdSchema,
  statusSchema,
} from "@/lib/validation";

// These schemas run on both the client form and the server handler, so a gap
// here is a gap in the only input validation the application has.

describe("fullNameSchema", () => {
  it("trims surrounding whitespace", () => {
    expect(fullNameSchema.parse("  Jane Dela Cruz  ")).toBe("Jane Dela Cruz");
  });

  it.each(["", "   "])("rejects blank input %j", (value) => {
    expect(fullNameSchema.safeParse(value).success).toBe(false);
  });

  it("rejects a name longer than 120 characters", () => {
    expect(fullNameSchema.safeParse("x".repeat(121)).success).toBe(false);
    expect(fullNameSchema.safeParse("x".repeat(120)).success).toBe(true);
  });
});

describe("emailSchema", () => {
  it("lowercases so sign-in matching is predictable", () => {
    expect(emailSchema.parse("Jane@Example.COM")).toBe("jane@example.com");
  });

  it("normalises an empty string to null rather than storing ''", () => {
    // A cleared field must become NULL, or the UNIQUE constraint would treat
    // two blank emails as a collision.
    expect(emailSchema.parse("")).toBeNull();
  });

  it("accepts null", () => {
    expect(emailSchema.parse(null)).toBeNull();
  });

  it.each([
    "not-an-email",
    "missing@tld",
    "@example.com",
    "spaces in@example.com",
  ])("rejects %j", (value) => {
    expect(emailSchema.safeParse(value).success).toBe(false);
  });
});

describe("mobileSchema", () => {
  it.each(["09171234567", "+63 917 123 4567", "+1-555-0100"])(
    "accepts %j",
    (value) => {
      expect(mobileSchema.safeParse(value).success).toBe(true);
    },
  );

  it("collapses runs of whitespace", () => {
    expect(mobileSchema.parse("+63   917   1234567")).toBe("+63 917 1234567");
  });

  it("normalises an empty string to null", () => {
    expect(mobileSchema.parse("")).toBeNull();
  });

  it.each(["abc", "12", "0917;DROP TABLE users", "<script>", "091712345678901234567890"])(
    "rejects %j",
    (value) => {
      expect(mobileSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe("passwordSchema", () => {
  it(`requires at least ${MIN_PASSWORD_LENGTH} characters`, () => {
    expect(passwordSchema.safeParse("x".repeat(MIN_PASSWORD_LENGTH - 1)).success).toBe(false);
    expect(passwordSchema.safeParse("x".repeat(MIN_PASSWORD_LENGTH)).success).toBe(true);
  });

  it("rejects an absurdly long password (bcrypt DoS guard)", () => {
    expect(passwordSchema.safeParse("x".repeat(201)).success).toBe(false);
  });

  it("says how long the password must be", () => {
    const result = passwordSchema.safeParse("short");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(String(MIN_PASSWORD_LENGTH));
    }
  });
});

describe("photoUrlSchema", () => {
  it("accepts a URL produced by our own upload route", () => {
    const url = "/api/uploads/0123456789abcdef0123456789abcdef.png";
    expect(photoUrlSchema.parse(url)).toBe(url);
  });

  it("normalises an empty string to null", () => {
    expect(photoUrlSchema.parse("")).toBeNull();
  });

  it.each([
    ["an external tracker", "https://tracker.evil/pixel.png"],
    ["a protocol-relative URL", "//evil.test/x.png"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a data: URL", "data:image/png;base64,AAAA"],
    ["path traversal", "/api/uploads/../../etc/passwd"],
    ["a different local path", "/uploads/photo.png"],
    ["a nested path", "/api/uploads/sub/dir.png"],
  ])("rejects %s", (_label, value) => {
    // Accepting an arbitrary URL would let one admin deanonymise every other
    // admin who merely views the user list.
    expect(photoUrlSchema.safeParse(value).success).toBe(false);
  });
});

describe("roleIdSchema", () => {
  it("coerces a numeric string, as sent by a <select>", () => {
    expect(roleIdSchema.parse("3")).toBe(3);
  });

  it("treats an empty selection as no role", () => {
    expect(roleIdSchema.parse("")).toBeNull();
  });

  it.each(["abc", "1.5", "-1", "0", "1; DROP TABLE roles"])(
    "rejects %j before it reaches the driver",
    (value) => {
      // Previously these produced a Postgres 22P02 and a 500.
      expect(roleIdSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe("statusSchema", () => {
  it.each(["active", "disabled"])("accepts %s", (value) => {
    expect(statusSchema.safeParse(value).success).toBe(true);
  });

  it.each(["ACTIVE", "enabled", "", "admin"])("rejects %j", (value) => {
    expect(statusSchema.safeParse(value).success).toBe(false);
  });
});

describe("moduleKeysSchema", () => {
  it("keeps only keys that exist in the registry", () => {
    expect(
      moduleKeysSchema.parse(["dashboard", "not_a_module", "users", "viral_posts"]),
    ).toEqual(["dashboard", "users"]);
  });

  it("returns an empty array when nothing is recognised", () => {
    expect(moduleKeysSchema.parse(["nonsense"])).toEqual([]);
  });

  it("rejects a non-array", () => {
    expect(moduleKeysSchema.safeParse("dashboard").success).toBe(false);
  });

  it("rejects an unreasonably long list", () => {
    expect(moduleKeysSchema.safeParse(new Array(51).fill("dashboard")).success).toBe(
      false,
    );
  });
});
