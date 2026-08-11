# Admin Portal

A TypeScript starting point for internal admin tools: session sign-in, **server-enforced** role-based module access, user management, profile management, and a light/dark/system theme.

Built on Next.js 16 (App Router) + React 19 + PostgreSQL. No ORM — plain parameterized SQL.

---

## Quick start

```bash
cp .env.example .env
# Fill in AUTH_SECRET, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD.
#   openssl rand -base64 48   → AUTH_SECRET
#   openssl rand -base64 24   → SEED_ADMIN_PASSWORD

npm install
npm run init-db     # applies db/admin_schema.sql, creates the first admin
npm run dev         # http://localhost:3000
```

There are **no default credentials.** `init-db` refuses to run until you choose them, and re-running it never overwrites an existing account's password.

### With Docker

```bash
cp .env.example .env    # POSTGRES_PASSWORD, AUTH_SECRET, SEED_ADMIN_* required
docker compose up --build
```

Compose names any missing required variable and refuses to start rather than falling back to a default.

---

## Modules

| Module | Key | What it does |
|---|---|---|
| Dashboard | `dashboard` | Account and access-group figures |
| User Management | `users` | Create accounts, assign roles, reset passwords |
| Role Management | `roles` | Create groups and pick the modules each may use |
| Profile Management | `profile` | Own details, photo, and password |

Sign-in accepts **either** an email address or a mobile number, plus a password.

`profile` is always available to any signed-in user. The rest are granted per role.

---

## Access control

This is the part most worth understanding before you build on it. See [docs/rbac.md](docs/rbac.md) for the full picture.

The short version:

- A **role** is a named group holding a list of module keys, plus an `is_super` all-access flag.
- Filtering the sidebar is **not** access control. Every API route calls `requireModule()` / `requireSuper()`, and every page calls `requirePageModule()`, from [`src/lib/guard.ts`](src/lib/guard.ts).
- Adding a module to [`src/lib/modules.ts`](src/lib/modules.ts) makes it *grantable*. It is not *protected* until its route and page call a guard.
- `src/proxy.ts` (Next 16 middleware) is **not** the security boundary — it only checks whether a session cookie exists, to redirect signed-out browsers, and emits the per-request CSP nonce. All real checks happen in the handlers, so a middleware bypass costs nothing.

Operations that can escalate privilege or take over an account require `is_super`:

| Action | Required |
|---|---|
| Assign or change a user's `role_id` | super admin, and never on yourself |
| Enable/disable an account | super admin, and never on yourself |
| Reset another user's password | super admin |
| Edit or delete a super admin account | super admin |

---

## API

Every endpoint returns the same envelope:

```jsonc
{ "success": true,  "data": { }, "error": null }
{ "success": false, "data": null, "error": { "code": "FORBIDDEN", "message": "…" } }
```

Payloads are validated with Zod on the server, using the **same schemas** the client forms use (`src/features/*/schema.ts`), so rules are written once.

| Method | Path | Guard |
|---|---|---|
| POST | `/api/auth/login` | public, rate-limited |
| POST | `/api/auth/logout` | session |
| GET | `/api/dashboard` | `dashboard` |
| GET, POST | `/api/users` | `users` (+ super to assign a role) |
| GET, PUT, DELETE | `/api/users/:id` | `users` (+ super for role/status) |
| POST | `/api/users/:id/reset-password` | **super only** |
| GET, POST | `/api/roles` | `roles` |
| GET, PUT, DELETE | `/api/roles/:id` | `roles` |
| GET, PUT | `/api/profile` | session (own record only) |
| POST | `/api/upload` | session |
| GET | `/api/uploads/:name` | session |

---

## Security model

What is enforced, and where:

- **Sessions** — HS256 JWT in an `httpOnly`, `sameSite=lax`, `secure`-in-production cookie, 8 hour lifetime. The token carries only a user id and a `token_version`; role, status and profile are re-read from the database on every request, so a change takes effect immediately rather than at next sign-in.
- **Session revocation** — incrementing `admin_users.token_version` invalidates every outstanding token for that user. Done automatically on password change, admin password reset, and account disable.
- **Passwords** — bcrypt, cost 12, 12-character minimum.
- **Login** — rate limited per IP *and* per identifier; generic failure message; a dummy bcrypt comparison on the "no such user" path so response time doesn't reveal which identifiers exist.
- **SQL** — every query parameterized (`$1`, `$2`, …). No string interpolation anywhere.
- **Uploads** — the file type is decided by **magic bytes**, never by the client's `Content-Type` or the original filename. Stored under `UPLOAD_DIR` with a random UUID name, *outside* `public/` (files under `public/` are served statically before any auth check can run), and served by an authenticated route that pins an explicit `Content-Type` and sends `X-Content-Type-Options: nosniff`.
- **Headers** — HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and `Permissions-Policy` from `next.config.ts`; a per-request nonce-based CSP from `src/proxy.ts`.
- **Database TLS** — when `DATABASE_SSL=true` the certificate chain **is** verified. Optionally pin a CA with `DATABASE_CA_CERT`.
- **Logging** — structured JSON (`timestamp`, `level`, `message`, context) with an automatic redaction list, so passwords and tokens cannot be logged by accident.
- **Secrets** — no fallback defaults; no `NEXT_PUBLIC_*` variables exist. Missing configuration is a startup failure.

### Known gaps

Deliberate, and worth knowing before you deploy this:

- **Rate limiting is per-process, in memory.** Correct for a single instance; behind a load balancer each instance keeps its own counters. Swap `hit()` in [`src/lib/rate-limit.ts`](src/lib/rate-limit.ts) for a Redis `INCR` with the same signature.
- **CSRF protection relies on `SameSite=Lax`** plus the JSON content-type requirement. There is no CSRF token. Adequate today; revisit before serving the app from a shared parent domain.
- **`x-forwarded-for` is trusted** for the IP rate-limit key. Spoofing it does not buy unlimited guesses — the per-identifier limit is independent — but put a proxy that overwrites the header in front of this.
- **No audit log table.** Privileged actions are logged to stdout, not recorded in the database.
- **No visual-regression tests.** The browser suite asserts on behaviour — focus containment, layout mode, theme attributes — not on pixels. A restyle that keeps the behaviour intact will not be caught here.

---

## Testing

```bash
npm run test          # unit tests — fast, no database needed
npm run test:api      # integration tests — needs Postgres + a build
npm run test:e2e      # browser tests — needs Postgres + a build + Chromium
npm run verify        # typecheck → lint → unit → build → integration → browser
```

**Unit tests** ([tests/unit/](tests/unit/)) cover the pure logic the security model rests on: module/role resolution in `allowedModules` and `canAccess`, every Zod field schema, magic-byte image sniffing and stored-filename validation, the rate-limiter windows, and the logger's redaction rules. They need no services and run on a clean checkout.

**Integration tests** ([tests/api/](tests/api/)) drive a real `next start` server against a real PostgreSQL database over HTTP — no mocks. Mocking the database or the request pipeline would mean testing the mocks rather than the guards, and the guards are the point. The harness ([tests/api/setup/globalSetup.ts](tests/api/setup/globalSetup.ts)) drops the admin tables, re-seeds, boots the server on port 3311, and tears it down afterwards.

They need a database and a build:

```bash
docker run -d --name admin-portal-db \
  -e POSTGRES_PASSWORD=devpassword -e POSTGRES_DB=admin_portal \
  -p 55432:5432 postgres:16-alpine

cp .env.example .env   # DATABASE_URL and AUTH_SECRET must be set
npm run build
npm run test:api
```

What the integration suite asserts, grouped by the failure each part prevents:

| File | Covers |
|---|---|
| [rbac.test.ts](tests/api/rbac.test.ts) | Every escalation path: self-promotion via `role_id`, disabling peers, resetting another user's password, editing a super admin, plus the page-level redirects — and that a legitimate role still works. |
| [auth.test.ts](tests/api/auth.test.ts) | Sign-in, cookie attributes, user-enumeration parity, forged / tampered / `alg:none` tokens, and all four session-revocation paths. |
| [uploads.test.ts](tests/api/uploads.test.ts) | Magic-byte sniffing vs. spoofed `Content-Type` and filenames, size and traversal limits, authenticated serving, and `photo_url` restriction. |
| [contract.test.ts](tests/api/contract.test.ts) | Response envelope, validation and conflict handling, security headers, CSP nonce freshness and coverage, and both rate limiters. |

**Browser tests** ([tests/e2e/](tests/e2e/)) drive Chromium against the same kind of real server. They cover only what genuinely needs a browser, and deliberately do not repeat what the API suite already proves:

| File | Covers |
|---|---|
| [validation.spec.ts](tests/e2e/validation.spec.ts) | Every failing field reported on one submit, the first focused, messages clearing as they are fixed — and that a server-side conflict still opens the modal instead. |
| [modal.spec.ts](tests/e2e/modal.spec.ts) | Tab and Shift+Tab held inside the dialog, focus returned to the trigger on close, and a text selection dragged out of the dialog *not* discarding the form. |
| [toast.spec.ts](tests/e2e/toast.spec.ts) | A confirmation appearing, dismissing itself, and dismissing by hand. |
| [mobile.spec.ts](tests/e2e/mobile.spec.ts) | The drawer opening and closing, and tables reading as cards with no sideways scroll. |
| [theme.spec.ts](tests/e2e/theme.spec.ts) | All three modes surviving a reload — which is also the only automated check that the pre-paint theme script still carries its CSP nonce. |
| [auth.spec.ts](tests/e2e/auth.spec.ts) | Sign-in, rejection, and the signed-out redirect, through a real browser. |

The two integration suites share one harness ([tests/support/server.ts](tests/support/server.ts)) and both drop `admin_users` and `roles`. They use different ports (3311 and 3312), but **must not run concurrently against the same database** — set `E2E_DATABASE_URL` to separate them, or rely on `npm run verify` running them in sequence.

Each `TestClient` sends a distinct `x-forwarded-for`, so it models a separate browser. That is what lets the throttling tests prove the per-identifier limit holds even when an attacker rotates source IPs.

[CI](.github/workflows/ci.yml) runs the whole `verify` chain on every push and pull request, with Postgres as a service container.

---

## Project layout

Grouped by feature rather than by file type.

```
src/
├── app/                     thin route entry points only
│   ├── (main)/              authenticated shell — dashboard, users, roles, profile
│   ├── api/                 route handlers
│   ├── login/
│   └── layout.tsx           theme script + providers
├── components/
│   ├── AppShell.tsx         sidebar, topbar, mobile drawer
│   └── ui/                  Modal, Avatar, PhotoUploader, ErrorDialogProvider
├── features/
│   ├── auth/                login form + schema
│   ├── dashboard/           client view + queries
│   ├── users/               client view + schema + queries
│   ├── roles/               client view + schema + queries
│   ├── profile/             client view + schema
│   └── theme/               provider, toggle, no-flash script
├── lib/
│   ├── guard.ts             requireUser / requireModule / requireSuper
│   ├── modules.ts           module catalog — the RBAC source of truth
│   ├── api.ts               response envelope + route() error wrapper
│   ├── api-client.ts        browser-side fetch wrapper
│   ├── auth.ts, session.ts  password hashing, JWT, current user
│   ├── db.ts                pg pool + typed query helpers
│   ├── validation.ts        shared Zod field schemas
│   ├── uploads.ts           magic-byte sniffing, safe path resolution
│   ├── rate-limit.ts, logger.ts, env.ts, types.ts
└── proxy.ts                 CSP nonce + signed-out redirect (NOT authz)
```

Each feature's `queries.ts` is shared by its page (server render) and its API route (client refresh), so the two cannot drift apart.

---

## Theming

Three modes — light, dark, and system — from the toggle in the topbar and on the login page.

- Colours are `oklch()`, derived from three seeds declared once on `:root`.
- **To rebrand, change `--accent-h`.** One number, both themes, everything downstream — buttons, links, focus rings, the active nav item, the brand mark.
- `--neutral-c` controls how much of the accent hue bleeds into the greys; set it to `0` for neutral greys. Neutrals follow their own `--neutral-h`, so a warm accent can keep cool greys.
- Run `npm run test:e2e` afterwards. `contrast.spec.ts` fails the build if a palette edit drops a pair below WCAG AA. (Rotating the hue alone is safe by construction — oklch holds lightness constant across hues.)
- The preference is stored in `localStorage` under `admin-portal-theme`.
- An inline script in the root layout applies it **before first paint**, so there is no white flash on load. It carries the CSP nonce.
- "System" stores no `data-theme` attribute at all, leaving the `prefers-color-scheme` media query in charge — and it tracks OS changes live via `matchMedia`.
- Every colour resolves through a CSS custom property in `src/app/globals.css`. Typography is a six-step scale; icons are a hand-authored SVG set in `src/components/icons/`, with no dependency and no emoji.

The layout is mobile-first: below 900px the sidebar becomes an off-canvas drawer, tables scroll horizontally inside their container, and inputs use a 16px font so iOS Safari doesn't zoom on focus.

---

## Adding a module

1. Add an entry to `MODULES` in [`src/lib/modules.ts`](src/lib/modules.ts).
2. Create `src/app/(main)/<path>/page.tsx` — a server component whose first line is `await requirePageModule("<key>")`.
3. Create `src/features/<name>/` for its client view, Zod schema, and queries.
4. Add API routes that start with `await requireModule("<key>")`.

The sidebar and the Role Management checkboxes pick it up automatically. Step 2 and 4 are the ones that actually protect it.

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build (type-checks as part of the build) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Unit tests (no services required) |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:coverage` | Unit tests with a coverage summary |
| `npm run test:api` | Integration tests (needs Postgres + a build) |
| `npm run test:e2e` | Browser tests (needs Postgres + a build + Chromium) |
| `npm run verify` | Everything: typecheck, lint, unit, build, integration, browser |
| `npm run init-db` | Apply schema + ensure the first admin exists (idempotent) |
