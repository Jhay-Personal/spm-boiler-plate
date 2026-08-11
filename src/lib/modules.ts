import type { IconName } from "@/components/icons";

// The catalog of modules a Role can be granted access to.
//
// This is the single source of truth for three things at once:
//   1. the sidebar navigation,
//   2. the checkbox grid in Role Management,
//   3. the server-side access guards in `src/lib/guard.ts`.
//
// Adding a module here is all it takes to make it grantable — but a new module
// is NOT protected until its route calls `requireModule()`. See docs/rbac.md.

export const MODULES = [
  { key: "dashboard", label: "Dashboard", icon: "dashboard", path: "/dashboard" },
  { key: "users", label: "User Management", icon: "users", path: "/users" },
  { key: "roles", label: "Role Management", icon: "shield", path: "/roles" },
  { key: "profile", label: "Profile Management", icon: "settings", path: "/profile" },
  // `as const` keeps the literal types (ModuleKey stays a union of the four
  // keys, which every guard depends on); `satisfies` checks each icon against
  // the registry, so a typo fails the build instead of rendering a blank.
] as const satisfies readonly {
  key: string;
  label: string;
  icon: IconName;
  path: string;
}[];

export type ModuleDefinition = (typeof MODULES)[number];
export type ModuleKey = ModuleDefinition["key"];

export const MODULE_KEYS: readonly ModuleKey[] = MODULES.map((m) => m.key);

export function isModuleKey(value: unknown): value is ModuleKey {
  return (
    typeof value === "string" && (MODULE_KEYS as readonly string[]).includes(value)
  );
}

export function moduleByKey(key: ModuleKey): ModuleDefinition | undefined {
  return MODULES.find((m) => m.key === key);
}

// Profile is always available to any signed-in user (everyone may edit their
// own profile), regardless of what their role grants.
export const ALWAYS_ALLOWED: readonly ModuleKey[] = ["profile"];

export type RoleLike = {
  modules: readonly ModuleKey[];
  is_super: boolean;
} | null;

export function allowedModules(role: RoleLike): ModuleKey[] {
  if (!role) return [...ALWAYS_ALLOWED];
  // A role flagged as super admin (all-access) sees every module.
  if (role.is_super) return [...MODULE_KEYS];
  const granted = Array.isArray(role.modules) ? role.modules : [];
  return Array.from(new Set([...granted, ...ALWAYS_ALLOWED]));
}

export function canAccess(role: RoleLike, moduleKey: ModuleKey): boolean {
  return allowedModules(role).includes(moduleKey);
}
