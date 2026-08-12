# Module categories in the sidebar

**Date:** 2026-08-12
**Status:** Approved, not yet implemented

## Problem

`MODULES` in `src/lib/modules.ts` is a flat list, and `AppShell.tsx` renders it under
one hard-coded `Modules` heading. At four entries this reads fine; the flat list stops
scaling the moment a fifth unrelated module lands, and there is no place in the data
model to say where a new module belongs. The grouping decision would then be made ad
hoc in JSX, away from the registry every other consumer reads.

## Goal

Give each module a declared category, and render the sidebar as grouped sections.

## Non-goals

- **The Role Management checkbox grid stays flat.** It is a permissions picker, not
  navigation, and it is already scannable at four items.
- No change to how access is granted, checked, or stored. Categories are presentation
  metadata; they never gate anything.

## Design

### Data — `src/lib/modules.ts`

Add an ordered category registry. Declaration order is display order:

```ts
export const MODULE_CATEGORIES = [
  { key: "overview", label: "Overview" },
  { key: "administration", label: "Administration" },
  { key: "account", label: "Account" },
] as const satisfies readonly { key: string; label: string }[];

export type ModuleCategoryKey = (typeof MODULE_CATEGORIES)[number]["key"];
```

Each `MODULES` entry gains a `category`, and the existing `satisfies` clause gains
`category: ModuleCategoryKey` — so an unknown category fails the build exactly the way
a mistyped `icon` does today.

| Module | Category |
|---|---|
| `dashboard` | `overview` |
| `users` | `administration` |
| `roles` | `administration` |
| `profile` | `account` |

The flat `MODULES` array remains the source of truth. `ModuleKey`, `MODULE_KEYS`,
`moduleByKey`, `allowedModules`, and `canAccess` are unchanged, so every guard and the
role grid keep working untouched.

### Grouping helper

```ts
export type ModuleGroup = {
  key: ModuleCategoryKey;
  label: string;
  modules: ModuleDefinition[];
};

export function groupedModules(list: readonly ModuleDefinition[]): ModuleGroup[];
```

It walks `MODULE_CATEGORIES` in order, collects the members of `list` belonging to each,
and **omits any category with no members**.

That omission is the only real logic here. `src/app/(main)/layout.tsx:22` already
narrows `nav` to the modules the role grants, so a role holding only Profile access must
see just `ACCOUNT` — never an empty `ADMINISTRATION` heading advertising modules it
cannot reach. Rendering an empty group would leak the shape of the module catalog to
users who were not granted it.

### Rendering — `src/components/AppShell.tsx`

Replace the single `.nav-section` div and the flat `nav.map(...)` with a loop over
`groupedModules(nav)`: one `.nav-section` heading per group, followed by that group's
links. The link markup — active state, `aria-current`, `NavPending`, drawer dismissal —
is unchanged.

`.nav-section` (`src/app/globals.css:287`) is already an uppercase, muted,
`--text-micro` heading; it simply repeats now.

One CSS addition is required. `.nav` is `display: flex; flex-direction: column;
gap: 4px`, so wrapping a section's links in a `<div>` makes that wrapper a single flex
item and collapses the 4px spacing between the links inside it. A `.nav-group` rule
repeats the same three declarations on the wrapper, leaving spacing identical to today.

### Accessibility

Each group is wrapped in a `role="group"` with `aria-labelledby` pointing at its heading
id, so a screen reader announces "Administration" on entering those links rather than
reading four links as one undifferentiated list. The outer `<nav aria-label="Modules">`
stays as-is.

Heading ids are derived from the category key (`nav-cat-administration`) — stable, and
unique because category keys are unique.

### Documentation

The "Adding a module" checklist in `CLAUDE.md` gains the category to step 1: a new entry
now declares which section it appears under, and the build rejects it otherwise.

## Testing

Unit tests in `tests/unit/modules.test.ts` (pure logic, no server or browser needed):

1. `groupedModules(MODULES)` returns the three categories in declared order, with
   `users` and `roles` together under `administration`.
2. Given a filtered list of just the `profile` module, it returns exactly one group —
   `account` — proving empty categories are dropped.

Every module having a valid category is enforced by the type system, not a test.

No e2e test is added: the sidebar's existing coverage coincidentally exercises the new
render path, and asserting on heading text would only re-test a copy string.

## Files touched

| File | Change |
|---|---|
| `src/lib/modules.ts` | `MODULE_CATEGORIES`, `category` field, `groupedModules` |
| `src/components/AppShell.tsx` | render grouped sections |
| `src/app/globals.css` | add `.nav-group` |
| `tests/unit/modules.test.ts` | two grouping tests |
| `CLAUDE.md` | note that a new module declares a category |
