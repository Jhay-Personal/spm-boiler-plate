import { describe, expect, it } from "vitest";
import {
  ALWAYS_ALLOWED,
  MODULES,
  MODULE_KEYS,
  allowedModules,
  canAccess,
  groupedModules,
  isModuleKey,
  moduleByKey,
  type ModuleKey,
  type RoleLike,
} from "@/lib/modules";

// The module registry is the source of truth for the whole access-control
// system. If these break, the guards built on top of them are meaningless.

const role = (modules: ModuleKey[], is_super = false): RoleLike => ({
  modules,
  is_super,
});

describe("module registry", () => {
  it("exposes a key for every module, with no duplicates", () => {
    expect(MODULE_KEYS.length).toBe(MODULES.length);
    expect(new Set(MODULE_KEYS).size).toBe(MODULE_KEYS.length);
  });

  it("gives every module a unique path", () => {
    const paths = MODULES.map((m) => m.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("does not contain the removed pipeline modules", () => {
    expect(MODULE_KEYS).not.toContain("viral_posts");
    expect(MODULE_KEYS).not.toContain("generated_content");
  });

  it("looks modules up by key", () => {
    expect(moduleByKey("users")?.label).toBe("User Management");
  });
});

describe("isModuleKey", () => {
  it.each(MODULE_KEYS)("accepts the real key %s", (key) => {
    expect(isModuleKey(key)).toBe(true);
  });

  it.each([
    ["an unknown string", "not_a_module"],
    ["a removed module", "viral_posts"],
    ["an empty string", ""],
    ["a number", 1],
    ["null", null],
    ["undefined", undefined],
    ["an object", { key: "users" }],
    ["an array", ["users"]],
  ])("rejects %s", (_label, value) => {
    expect(isModuleKey(value)).toBe(false);
  });

  it("is not fooled by inherited Object properties", () => {
    // A guard implemented with `key in someObject` would say true here.
    expect(isModuleKey("toString")).toBe(false);
    expect(isModuleKey("constructor")).toBe(false);
  });
});

describe("allowedModules", () => {
  it("gives a user with no role only the always-allowed modules", () => {
    expect(allowedModules(null)).toEqual([...ALWAYS_ALLOWED]);
  });

  it("gives a super role every module", () => {
    expect(allowedModules(role([], true)).sort()).toEqual([...MODULE_KEYS].sort());
  });

  it("ignores a super role's stored module list entirely", () => {
    // A super role with an empty list must still see everything, or narrowing
    // that list would lock every administrator out.
    expect(allowedModules(role([], true))).toContain("users");
    expect(allowedModules(role(["dashboard"], true))).toContain("roles");
  });

  it("returns the granted modules plus the always-allowed ones", () => {
    expect(allowedModules(role(["dashboard"])).sort()).toEqual(
      ["dashboard", "profile"].sort(),
    );
  });

  it("does not duplicate a module that is both granted and always-allowed", () => {
    const result = allowedModules(role(["profile", "dashboard"]));
    expect(result.filter((m) => m === "profile")).toHaveLength(1);
  });

  it("tolerates a malformed modules value from the database", () => {
    // roles.modules is JSONB; nothing stops a bad row existing.
    const malformed = { modules: null, is_super: false } as unknown as RoleLike;
    expect(allowedModules(malformed)).toEqual([...ALWAYS_ALLOWED]);
  });

  it("does not mutate the role it is given", () => {
    const modules: ModuleKey[] = ["dashboard"];
    allowedModules(role(modules));
    expect(modules).toEqual(["dashboard"]);
  });

  it("does not let a caller mutate ALWAYS_ALLOWED through the result", () => {
    const result = allowedModules(null);
    result.push("users");
    expect(ALWAYS_ALLOWED).toEqual(["profile"]);
  });
});

describe("canAccess", () => {
  it("permits a granted module", () => {
    expect(canAccess(role(["users"]), "users")).toBe(true);
  });

  it("denies a module the role does not grant", () => {
    expect(canAccess(role(["dashboard"]), "users")).toBe(false);
    expect(canAccess(role(["dashboard"]), "roles")).toBe(false);
  });

  it("permits everything for a super role", () => {
    for (const key of MODULE_KEYS) {
      expect(canAccess(role([], true), key)).toBe(true);
    }
  });

  it("permits profile for everyone, including a user with no role", () => {
    expect(canAccess(null, "profile")).toBe(true);
    expect(canAccess(role([]), "profile")).toBe(true);
  });

  it("denies every non-always-allowed module to a user with no role", () => {
    for (const key of MODULE_KEYS) {
      if (ALWAYS_ALLOWED.includes(key)) continue;
      expect(canAccess(null, key)).toBe(false);
    }
  });
});

describe("groupedModules", () => {
  it("returns categories in declared order, with administration holding users and roles", () => {
    const groups = groupedModules(MODULES);

    expect(groups.map((g) => g.key)).toEqual([
      "overview",
      "administration",
      "account",
    ]);
    expect(groups.map((g) => g.label)).toEqual([
      "Overview",
      "Administration",
      "Account",
    ]);

    const administration = groups.find((g) => g.key === "administration");
    expect(administration).toBeDefined();
    expect(administration!.modules.map((m) => m.key)).toEqual([
      "users",
      "roles",
    ]);
  });

  it("drops categories with no visible modules", () => {
    // What a role granted only Profile access sees. Rendering an empty
    // "Administration" heading would advertise modules it cannot reach.
    const profileOnly = MODULES.filter((m) => m.key === "profile");
    const groups = groupedModules(profileOnly);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe("account");
    expect(groups[0]!.modules.map((m) => m.key)).toEqual(["profile"]);
  });

  it("returns no groups for an empty list", () => {
    expect(groupedModules([])).toEqual([]);
  });
});
