# Access control

How modules, roles and guards fit together — and, more importantly, where the
boundary actually is. This is the piece most likely to be got wrong when
extending the app, because the wrong answer *looks* like it works.

---

## The pieces

### Modules

[`src/lib/modules.ts`](../src/lib/modules.ts) declares every grantable module:

```ts
export const MODULES = [
  { key: "dashboard", label: "Dashboard", icon: "dashboard", path: "/dashboard", category: "overview" },
  { key: "users",     label: "User Management", icon: "users", path: "/users", category: "administration" },
  { key: "roles",     label: "Role Management", icon: "shield", path: "/roles", category: "administration" },
  { key: "profile",   label: "Profile Management", icon: "settings", path: "/profile", category: "account" },
] as const;
```

`as const` makes `ModuleKey` a literal union, so a typo in a guard call
(`requireModule("userz")`) is a compile error rather than a permanently-denied
route.

This one array drives three things: the sidebar, the checkbox grid in Role
Management, and the guard calls. There is no second list to keep in sync.

### Roles

A row in `roles`:

| Column | Meaning |
|---|---|
| `name` | Display name, unique |
| `description` | Free text |
| `modules` | JSONB array of module keys, e.g. `["dashboard","users"]` |
| `is_super` | All-access flag |

`is_super` can only be set by `scripts/init-db.ts`. The API hard-codes `FALSE`
on insert and refuses to narrow an existing super role's module list — a
super role that could be edited down to nothing is a way to lock every
administrator out of the system.

`profile` is in `ALWAYS_ALLOWED`, so every signed-in user can edit their own
profile regardless of role. A user with no role at all still gets it.

### Users

`admin_users.role_id` points at one role, or is NULL. A user with no role can
sign in and reach only their own profile.

---

## Where enforcement lives

Four layers. **Only two of them are security.**

| Layer | File | Is it a boundary? |
|---|---|---|
| Proxy (middleware) | `src/proxy.ts` | **No** |
| Sidebar filtering | `src/app/(main)/layout.tsx` | **No** |
| Page guard | `requirePageModule()` | **Yes** |
| Route handler guard | `requireModule()` / `requireSuper()` | **Yes** |

### Why the proxy is not a boundary

`src/proxy.ts` checks only that a session cookie is *present*. It does not
verify the signature and knows nothing about roles. That is deliberate:

- Middleware-only authorization has been a repeated source of framework-level
  bypasses — in CVE-2025-29927 a spoofed internal header was enough to skip
  Next.js middleware entirely.
- It cannot express per-module rules without duplicating the role lookup on
  every request, at the edge, away from the database.

Because the proxy is only a redirect convenience, a bypass of it costs
nothing: the page or handler underneath still refuses.

### Why sidebar filtering is not a boundary

`(main)/layout.tsx` filters `MODULES` down to what the role grants. That
stops a user seeing a link they cannot use. It does nothing about typing
`/users` into the address bar, and nothing at all about `curl`.

This distinction is not hypothetical. Before the guards existed, this
application stored roles, rendered them, and enforced none of them: any
signed-in user could list every account, create accounts, reset the super
admin's password, or promote themselves by calling
`PUT /api/users/<own id>` with a different `role_id`.

---

## The guards

From [`src/lib/guard.ts`](../src/lib/guard.ts):

```ts
requireUser()              // → 401 unless signed in and active
requireModule("users")     // → 401, or 403 if the role lacks the module
requireSuper()             // → 403 unless is_super
requirePageModule("users") // page equivalent; redirects instead of throwing
```

API routes throw; the `route()` wrapper in `src/lib/api.ts` converts the
throw into the standard error envelope with the right status. Pages redirect,
because a browser that navigated somewhere it may not go should land
somewhere useful rather than see a JSON error.

Every handler is wrapped in `route()`, so a handler that forgets its own
try/catch cannot leak an internal error message — but `route()` does **not**
add a guard. That is per-handler and deliberate: a route with no guard is a
public route, and that should be a visible choice in the code.

---

## Privileged operations

Holding the `users` module is not enough for anything that can escalate
privilege or take over an account:

| Operation | Requirement | Why |
|---|---|---|
| Change a user's `role_id` | `is_super`, and target ≠ self | Otherwise anyone who can edit users promotes themselves |
| Change a user's `status` | `is_super`, and target ≠ self | Disabling peers is an availability attack; self-disable locks you out |
| Reset another user's password | `is_super` | Setting a password without proving anything about the account *is* account takeover |
| Edit or delete a super admin | `is_super` | Otherwise: change their email, then "reset" their password |
| Assign a role at user creation | `is_super` | Same escalation path as editing `role_id` |

Changing your **own** password goes through `PUT /api/profile`, which requires
the current password. That endpoint takes no id, so it cannot be aimed at
another account.

### Session revocation

`admin_users.token_version` is embedded in every issued JWT and compared on
each request. Incrementing it invalidates all of that user's outstanding
tokens at once. It is bumped automatically on:

- password change via the profile page,
- password reset by a super admin,
- an account being disabled.

Without this, resetting a compromised account's password would leave the
attacker's existing 8-hour session working.

---

## Adding a protected module

```ts
// 1. src/lib/modules.ts
{ key: "reports", label: "Reports", icon: "monitor", path: "/reports", category: "administration" }
```

```tsx
// 2. src/app/(main)/reports/page.tsx — server component
import { requirePageModule } from "@/lib/guard";
import { listReports } from "@/features/reports/queries";
import { ReportsClient } from "@/features/reports/ReportsClient";

export default async function ReportsPage() {
  await requirePageModule("reports");     // ← the page boundary
  return <ReportsClient initialReports={await listReports()} />;
}
```

```ts
// 3. src/app/api/reports/route.ts
export const GET = route("GET /api/reports", async () => {
  await requireModule("reports");         // ← the API boundary
  return ok({ reports: await listReports() });
});
```

Step 1 alone makes the module appear in the sidebar and the role checkboxes.
**It does not protect anything.** Steps 2 and 3 are what enforce it.

### Checklist for a new endpoint

- [ ] First line of the handler is a guard call.
- [ ] Wrapped in `route()` so errors return the standard envelope.
- [ ] Body parsed with a Zod schema from `src/features/*/schema.ts`.
- [ ] Dynamic `:id` segments passed through `parseId()`.
- [ ] Anything that grants access or changes a password requires `requireSuper()`.
- [ ] Privileged mutations logged with `logger.info` including `actorId`.

---

## Verifying it works

Create a role granting only `dashboard`, assign it to a test user, sign in as
them, then — with that session cookie — confirm each of these is refused:

```
GET  /api/users                          → 403
POST /api/users                          → 403
PUT  /api/users/<self> {"role_id": 1}    → 403
POST /api/users/<super>/reset-password   → 403
GET  /users                              → redirected, not rendered
```

If any of those succeeds, a guard is missing.
