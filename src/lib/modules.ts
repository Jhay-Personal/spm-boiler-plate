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

// The sidebar's sections. Declaration order is display order.
export const MODULE_CATEGORIES = [
  { key: "overview", label: "Overview" },
  { key: "administration", label: "Administration" },
  { key: "account", label: "Account" },
] as const satisfies readonly { key: string; label: string }[];

export type ModuleCategory = (typeof MODULE_CATEGORIES)[number];
export type ModuleCategoryKey = ModuleCategory["key"];

export const MODULES = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: "dashboard",
    path: "/dashboard",
    category: "overview",
  },
  {
    key: "users",
    label: "User Management",
    icon: "users",
    path: "/users",
    category: "administration",
  },
  {
    key: "roles",
    label: "Role Management",
    icon: "shield",
    path: "/roles",
    category: "administration",
  },
  {
    key: "profile",
    label: "Profile Management",
    icon: "settings",
    path: "/profile",
    category: "account",
  },
  // `as const` keeps the literal types (ModuleKey stays a union of the four
  // keys, which every guard depends on); `satisfies` checks each icon against
  // the registry and each category against MODULE_CATEGORIES, so a typo fails
  // the build instead of rendering a blank or an orphaned module.
] as const satisfies readonly {
  key: string;
  label: string;
  icon: IconName;
  path: string;
  category: ModuleCategoryKey;
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

export type ModuleGroup = {
  key: ModuleCategoryKey;
  label: string;
  modules: ModuleDefinition[];
};

// Groups a module list into the sidebar's sections, in declared order.
//
// The input is already filtered to what the signed-in role may see, so a
// category with no surviving members is dropped rather than rendered empty —
// an empty "Administration" heading would advertise the shape of the module
// catalog to someone who was not granted it.
export function groupedModules(
  list: readonly ModuleDefinition[],
): ModuleGroup[] {
  return MODULE_CATEGORIES.map((category) => ({
    key: category.key,
    label: category.label,
    modules: list.filter((m) => m.category === category.key),
  })).filter((group) => group.modules.length > 0);
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
