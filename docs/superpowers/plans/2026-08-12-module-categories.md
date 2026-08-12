# Module Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every module a declared category and render the sidebar as grouped sections instead of one flat list.

**Architecture:** `MODULES` in `src/lib/modules.ts` stays a flat `as const` array — every access guard depends on the `ModuleKey` union it produces. Each entry gains a `category` field validated by the existing `satisfies` clause, and a new `groupedModules()` helper turns a (possibly RBAC-filtered) module list into ordered, non-empty groups. `AppShell` renders those groups. Nothing about access control changes.

**Tech Stack:** TypeScript, Next.js 16 App Router, React 19, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-12-module-categories-design.md`

## Global Constraints

- Node >= 22.
- No emoji in `src/`. Icons come from `src/components/icons/index.tsx`.
- Never hard-code a colour below the token blocks in `globals.css`; never add a `font-size` in px.
- `src/lib/modules.ts` is inside the unit-test coverage scope in `vitest.config.ts`, held to 90% statements/lines/functions and 85% branches. New exported logic there needs unit tests or the suite fails.
- Category keys and labels are fixed by the spec: `overview` → "Overview", `administration` → "Administration", `account` → "Account".
- Module assignment is fixed by the spec: `dashboard` → `overview`; `users` and `roles` → `administration`; `profile` → `account`.

---

### Task 1: Category registry and grouping helper

**Files:**
- Modify: `src/lib/modules.ts`
- Test: `tests/unit/modules.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `MODULE_CATEGORIES`, `ModuleCategoryKey`, `ModuleGroup`, and `groupedModules(list: readonly ModuleDefinition[]): ModuleGroup[]`. Task 2 imports `groupedModules` and reads `group.key`, `group.label`, `group.modules`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/modules.test.ts`:

```ts
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
    expect(administration?.modules.map((m) => m.key)).toEqual([
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
    expect(groups[0].key).toBe("account");
    expect(groups[0].modules.map((m) => m.key)).toEqual(["profile"]);
  });

  it("returns no groups for an empty list", () => {
    expect(groupedModules([])).toEqual([]);
  });
});
```

Extend the existing import block at the top of the same file so it reads:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/modules.test.ts -t "groupedModules"`
Expected: FAIL — `groupedModules` is not exported from `@/lib/modules`.

- [ ] **Step 3: Add the category registry**

In `src/lib/modules.ts`, insert directly above the `export const MODULES` block (after the existing explanatory comment):

```ts
// The sidebar's sections. Declaration order is display order.
export const MODULE_CATEGORIES = [
  { key: "overview", label: "Overview" },
  { key: "administration", label: "Administration" },
  { key: "account", label: "Account" },
] as const satisfies readonly { key: string; label: string }[];

export type ModuleCategory = (typeof MODULE_CATEGORIES)[number];
export type ModuleCategoryKey = ModuleCategory["key"];
```

- [ ] **Step 4: Add `category` to every module and to the `satisfies` clause**

Replace the whole `export const MODULES = [...]` declaration with:

```ts
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
```

- [ ] **Step 5: Add the grouping helper**

Append to `src/lib/modules.ts`, below `moduleByKey`:

```ts
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
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/modules.test.ts`
Expected: PASS — the three new tests plus every pre-existing one in the file.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors. `ModuleKey` must still be the four-key union — if a guard elsewhere starts erroring, the `as const` was lost in Step 4.

- [ ] **Step 8: Commit**

```bash
git add src/lib/modules.ts tests/unit/modules.test.ts
git commit -m "Give every module a category"
```

---

### Task 2: Render the sidebar as grouped sections

**Files:**
- Modify: `src/components/AppShell.tsx:73-96`
- Modify: `src/app/globals.css` (add `.nav-group`, after the `.nav-section` rule at line 287)
- Modify: `CLAUDE.md:103`

**Interfaces:**
- Consumes: `groupedModules` and `ModuleGroup` from Task 1.
- Produces: no new exports. `AppShell`'s `nav: ModuleDefinition[]` prop is unchanged, so `src/app/(main)/layout.tsx` needs no edit.

- [ ] **Step 1: Add the group wrapper style**

`.nav` is `display: flex; flex-direction: column; gap: 4px`. Wrapping each section's links in a `<div>` would collapse the 4px gap between links inside that wrapper, because only the wrapper is a flex item. The wrapper repeats the layout so spacing is unchanged.

Insert into `src/app/globals.css` immediately after the closing brace of `.nav-section` (line 293):

```css
.nav-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
```

- [ ] **Step 2: Import the helper in AppShell**

In `src/components/AppShell.tsx`, extend the existing `@/lib/modules` import to include `groupedModules` alongside the `ModuleDefinition` type import already present.

- [ ] **Step 3: Render the groups**

Replace lines 73-96 of `src/components/AppShell.tsx` — the `<nav>` element and everything inside it — with:

```tsx
        <nav className="nav" aria-label="Modules">
          {groupedModules(nav).map((group) => (
            <div
              key={group.key}
              className="nav-group"
              role="group"
              aria-labelledby={`nav-cat-${group.key}`}
            >
              <div className="nav-section" id={`nav-cat-${group.key}`}>
                {group.label}
              </div>
              {group.modules.map((m) => {
                const active =
                  pathname === m.path || pathname.startsWith(m.path + "/");
                return (
                  <Link
                    key={m.key}
                    href={m.path}
                    className={"nav-link" + (active ? " active" : "")}
                    aria-current={active ? "page" : undefined}
                    // Dismiss the drawer on navigation, otherwise the new page
                    // renders behind it on a phone.
                    onClick={() => setDrawerOpen(false)}
                  >
                    <span className="nav-ico" aria-hidden="true">
                      <Icon name={m.icon} size={18} />
                    </span>
                    <span className="nav-label">{m.label}</span>
                    <NavPending />
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
```

The link markup is byte-for-byte what was there before — active state, `aria-current`, `NavPending`, drawer dismissal. Only the surrounding loop changed.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 5: Update the "Adding a module" checklist**

In `CLAUDE.md`, replace line 103:

```markdown
1. Add an entry to `MODULES` in `src/lib/modules.ts`, including its `category` — one of the keys in `MODULE_CATEGORIES`, which decides the sidebar section it appears under. The build rejects an entry without a valid one.
```

- [ ] **Step 6: Verify in a browser**

Run: `npm run build && npm run test:e2e`

Expected: PASS. `tests/e2e/mobile.spec.ts` drives the sidebar via `#app-sidebar` and `getByRole("link", { name: "User Management" })` — both survive the regrouping, so a failure here means the nav markup broke.

Then check it by eye — with `npm run dev` running, sign in and confirm the sidebar reads OVERVIEW / Dashboard, ADMINISTRATION / User Management + Role Management, ACCOUNT / Profile Management, with the link spacing unchanged from before.

- [ ] **Step 7: Commit**

```bash
git add src/components/AppShell.tsx src/app/globals.css CLAUDE.md
git commit -m "Group the sidebar modules into sections"
```
