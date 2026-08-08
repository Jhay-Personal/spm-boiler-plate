import { describe, expect, it } from "vitest";
import {
  createUserSchema,
  privilegedUserFieldsSchema,
  resetPasswordSchema,
  updateUserSchema,
} from "@/features/users/schema";
import { roleInputSchema } from "@/features/roles/schema";
import { updateProfileSchema } from "@/features/profile/schema";
import { loginSchema } from "@/features/auth/schema";

// The feature schemas compose the shared field rules. They also encode the
// privilege split: which fields an ordinary `users` admin may send, and which
// are super-admin-only. That split is a security boundary, not a UI detail.

const validUser = {
  full_name: "Jane Dela Cruz",
  email: "jane@example.com",
  mobile: "",
  password: "LongEnoughPassword1",
  role_id: "",
  photo_url: "",
};

describe("createUserSchema", () => {
  it("accepts a well-formed new user", () => {
    const parsed = createUserSchema.parse(validUser);
    expect(parsed.email).toBe("jane@example.com");
    expect(parsed.mobile).toBeNull();
    expect(parsed.role_id).toBeNull();
    expect(parsed.photo_url).toBeNull();
  });

  it("accepts a mobile-only account", () => {
    const parsed = createUserSchema.parse({
      ...validUser,
      email: "",
      mobile: "09171234567",
    });
    expect(parsed.email).toBeNull();
    expect(parsed.mobile).toBe("09171234567");
  });

  it("requires at least one way to sign in", () => {
    // Without this the row would violate the CHECK constraint and surface as
    // an opaque 500 instead of a readable message.
    const result = createUserSchema.safeParse({ ...validUser, email: "", mobile: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("email address or a mobile");
    }
  });

  it("requires a password", () => {
    expect(createUserSchema.safeParse({ ...validUser, password: "" }).success).toBe(false);
  });

  it("coerces a role_id chosen from a <select>", () => {
    expect(createUserSchema.parse({ ...validUser, role_id: "4" }).role_id).toBe(4);
  });
});

describe("updateUserSchema", () => {
  it("accepts an edit without a password", () => {
    const parsed = updateUserSchema.parse({
      full_name: "Jane Dela Cruz",
      email: "jane@example.com",
      mobile: "",
    });
    expect(parsed.full_name).toBe("Jane Dela Cruz");
  });

  it("still requires an email or a mobile", () => {
    expect(
      updateUserSchema.safeParse({ full_name: "Jane", email: "", mobile: "" }).success,
    ).toBe(false);
  });

  it("does NOT accept role_id or status", () => {
    // The whole point of the split: these must not ride along on the
    // unprivileged path, or any `users` admin could promote themselves.
    const parsed = updateUserSchema.parse({
      full_name: "Jane",
      email: "jane@example.com",
      mobile: "",
      role_id: 1,
      status: "disabled",
    }) as Record<string, unknown>;
    expect(parsed.role_id).toBeUndefined();
    expect(parsed.status).toBeUndefined();
  });

  it("distinguishes an omitted photo from a cleared one", () => {
    // Omitted means "leave the photo alone"; empty string means "remove it".
    const omitted = updateUserSchema.parse({
      full_name: "Jane",
      email: "jane@example.com",
      mobile: "",
    });
    expect(omitted.photo_url).toBeUndefined();

    const cleared = updateUserSchema.parse({
      full_name: "Jane",
      email: "jane@example.com",
      mobile: "",
      photo_url: "",
    });
    expect(cleared.photo_url).toBeNull();
  });
});

describe("privilegedUserFieldsSchema", () => {
  it("reads role_id and status when present", () => {
    const parsed = privilegedUserFieldsSchema.parse({ role_id: "2", status: "disabled" });
    expect(parsed).toEqual({ role_id: 2, status: "disabled" });
  });

  it("leaves both undefined when the caller sent neither", () => {
    // The route uses `undefined` to mean "no change requested", which is what
    // keeps an ordinary edit from silently resetting somebody's role.
    expect(privilegedUserFieldsSchema.parse({ full_name: "Jane" })).toEqual({});
  });

  it("rejects an invalid status", () => {
    expect(privilegedUserFieldsSchema.safeParse({ status: "superuser" }).success).toBe(
      false,
    );
  });
});

describe("resetPasswordSchema", () => {
  it("enforces the password policy", () => {
    expect(resetPasswordSchema.safeParse({ password: "short" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ password: "LongEnoughPassword1" }).success).toBe(
      true,
    );
  });
});

describe("roleInputSchema", () => {
  it("accepts a group with modules", () => {
    const parsed = roleInputSchema.parse({
      name: "  Support  ",
      description: "Handles tickets",
      modules: ["dashboard", "users"],
    });
    expect(parsed.name).toBe("Support");
    expect(parsed.modules).toEqual(["dashboard", "users"]);
  });

  it("normalises an empty description to null", () => {
    expect(
      roleInputSchema.parse({ name: "Support", description: "", modules: [] }).description,
    ).toBeNull();
  });

  it("drops module keys that are not in the registry", () => {
    expect(
      roleInputSchema.parse({
        name: "Support",
        description: "",
        modules: ["dashboard", "made_up", "viral_posts"],
      }).modules,
    ).toEqual(["dashboard"]);
  });

  it("requires a name", () => {
    expect(
      roleInputSchema.safeParse({ name: "   ", description: "", modules: [] }).success,
    ).toBe(false);
  });

  it("has no way to request is_super", () => {
    const parsed = roleInputSchema.parse({
      name: "Sneaky",
      description: "",
      modules: [],
      is_super: true,
    }) as Record<string, unknown>;
    expect(parsed.is_super).toBeUndefined();
  });
});

describe("updateProfileSchema", () => {
  const base = { full_name: "Jane", email: "jane@example.com", mobile: "" };

  it("accepts a details-only update", () => {
    const parsed = updateProfileSchema.parse(base);
    expect(parsed.new_password).toBeUndefined();
  });

  it("accepts a password change with the current password", () => {
    const parsed = updateProfileSchema.parse({
      ...base,
      current_password: "OldPassword12345",
      new_password: "NewPassword12345",
    });
    expect(parsed.new_password).toBe("NewPassword12345");
  });

  it("requires the current password when setting a new one", () => {
    const result = updateProfileSchema.safeParse({
      ...base,
      new_password: "NewPassword12345",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("current password");
    }
  });

  it("enforces the length policy on the new password", () => {
    const result = updateProfileSchema.safeParse({
      ...base,
      current_password: "OldPassword12345",
      new_password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a current password with no new one", () => {
    // Ambiguous intent — surfacing it beats silently ignoring the field.
    const result = updateProfileSchema.safeParse({
      ...base,
      current_password: "OldPassword12345",
    });
    expect(result.success).toBe(false);
  });

  it("still requires an email or a mobile", () => {
    expect(
      updateProfileSchema.safeParse({ full_name: "Jane", email: "", mobile: "" }).success,
    ).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts an identifier and a password", () => {
    expect(loginSchema.parse({ identifier: " jane@example.com ", password: "x" })).toEqual(
      { identifier: "jane@example.com", password: "x" },
    );
  });

  it("does not apply the length policy to the submitted password", () => {
    // Rejecting a short password at sign-in would tell an attacker their
    // guess was too short to be this account's password.
    expect(loginSchema.safeParse({ identifier: "a@b.com", password: "x" }).success).toBe(
      true,
    );
  });

  it("requires both fields", () => {
    expect(loginSchema.safeParse({ identifier: "", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ identifier: "a@b.com", password: "" }).success).toBe(
      false,
    );
  });
});
