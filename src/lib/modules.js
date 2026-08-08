// The catalog of modules a Role can be granted access to.
// Role Management lets an admin "create a group and select a list of modules";
// these are the selectable modules. `path` drives the sidebar navigation.
export const MODULES = [
  { key: "dashboard", label: "Dashboard", icon: "📊", path: "/dashboard" },
  { key: "users", label: "User Management", icon: "👥", path: "/users" },
  { key: "roles", label: "Role Management", icon: "🛡️", path: "/roles" },
  {
    key: "viral_posts",
    label: "Viral Posts",
    icon: "🔥",
    path: "/viral-posts",
  },
  {
    key: "generated_content",
    label: "Generated Content",
    icon: "✍️",
    path: "/generated-content",
  },
  { key: "profile", label: "Profile Management", icon: "⚙️", path: "/profile" },
];

export const MODULE_KEYS = MODULES.map((m) => m.key);

export function moduleByKey(key) {
  return MODULES.find((m) => m.key === key);
}

// Profile is always available to any logged-in user (everyone can edit their
// own profile), regardless of role grants.
export const ALWAYS_ALLOWED = ["profile"];

export function allowedModules(role) {
  if (!role) return [...ALWAYS_ALLOWED];
  // A role flagged as super admin (all-access) sees every module.
  if (role.is_super) return MODULE_KEYS;
  const granted = Array.isArray(role.modules) ? role.modules : [];
  return Array.from(new Set([...granted, ...ALWAYS_ALLOWED]));
}

export function canAccess(role, moduleKey) {
  return allowedModules(role).includes(moduleKey);
}
