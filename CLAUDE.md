# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # dev server on :3000
npm run typecheck    # tsc --noEmit
npm run lint         # eslint (Next 16 removed `next lint`; this is standalone)
npm run test         # unit tests — no services needed
npm run test:api     # integration tests — needs Postgres AND a prior `npm run build`
npm run test:e2e     # Playwright browser tests — needs Postgres AND a prior `npm run build`
npm run verify       # typecheck → lint → unit → build → integration → e2e (what CI runs)
npm run init-db      # apply db/admin_schema.sql + ensure the seed admin exists (idempotent)
```

Single test file:

```bash
npx vitest run tests/unit/uploads.test.ts
npx vitest run --config vitest.api.config.ts tests/api/rbac.test.ts   # build first
npx vitest run tests/unit/modules.test.ts -t "canAccess"              # single test by name
npx playwright test tests/e2e/modal.spec.ts                           # build first
npx playwright test tests/e2e/modal.spec.ts -g "returns focus"        # single test by name
```

Node >= 22 is required.

### Before running `npm run test:api` or `npm run test:e2e`

Both suites share one harness, `tests/support/server.ts`, which **drops `admin_users` and `roles` from whatever database it is pointed at**, re-seeds a fixture admin, then boots `next start`. Both require an existing `.next` build — they fail rather than building for you, so re-run `npm run build` after changing server code.

**Point each suite at its own database, or they will delete the admin account you sign in with:**

| Suite | Port | Database |
|---|---|---|
| `test:api` | 3311 | `TEST_DATABASE_URL`, falling back to `DATABASE_URL` |
| `test:e2e` | 3312 | `E2E_DATABASE_URL`, falling back to `DATABASE_URL` |

With both set (see `.env.example`) the suites touch neither your development data nor each other, and may run concurrently. With either unset, that suite falls back to `DATABASE_URL` and wipes your dev login on every `npm run verify` — recoverable with `npm run init-db`, which recreates the seed admin and never overwrites an existing account's password.

`npm run test:e2e` also needs the Chromium binary: `npx playwright install chromium` once per machine.

Bring up a throwaway database with:

```bash
docker run -d --name admin-portal-db \
  -e POSTGRES_PASSWORD=devpassword -e POSTGRES_DB=admin_portal \
  -p 55432:5432 postgres:16-alpine
```

## Architecture

Next.js 16 App Router + React 19 + PostgreSQL via `pg`. No ORM — hand-written parameterized SQL. Source is grouped by feature, not by file type.

### Access control is the load-bearing design

Read `docs/rbac.md` before changing anything under `src/lib/guard.ts`, `src/lib/modules.ts`, or any route handler.

- `src/lib/modules.ts` is the single source of truth feeding three consumers at once: the sidebar, the Role Management checkbox grid, and the server guards. Adding an entry makes a module *grantable* — it is not *protected* until its route and page call a guard.
- Every API handler begins with `requireModule(key)` / `requireSuper()`; every page under `src/app/(main)` begins with `requirePageModule(key)` (redirects instead of throwing). Both live in `src/lib/guard.ts`.
- `src/proxy.ts` (Next 16 middleware) is **not** a security boundary — it only checks that a session cookie exists and emits the per-request CSP nonce. Do not move authorization into it; the split is deliberate (framework middleware bypasses like CVE-2025-29927 cost nothing here).
- Sidebar filtering and hidden client controls are UX only. The API enforces the same rule independently — see `src/app/(main)/users/page.tsx` passing `canManagePrivileges` while `src/app/api/users/route.ts` re-checks `isSuper`.
- Operations that can escalate privilege (assigning `role_id`, enabling/disabling accounts, resetting another user's password, touching a super admin) require `requireSuper()` and are separated at the schema level too: `updateUserSchema` deliberately excludes `role_id`/`status`, which live in `privilegedUserFieldsSchema`.

### Request/response conventions

- Every handler is wrapped in `route(name, handler)` from `src/lib/api.ts`. It maps `HttpError` → its status, `ZodError` → 400, Postgres unique violations → 409 with a constraint-specific message, and anything else → a logged, generic 500. Don't add try/catch inside handlers for these cases.
- All responses use one envelope: `{ success, data, error }` (`ApiEnvelope` in `src/lib/types.ts`). `src/lib/api-client.ts` (`apiFetch` / `apiJson`) unwraps it in the browser and throws `ApiRequestError`.
- Throw the helpers (`unauthorized`, `forbidden`, `notFound`, `badRequest`, `conflict`) rather than constructing responses. Only `HttpError` messages reach the client verbatim.
- Parse bodies with `parseJson(request, schema)` / `parseWith`, and route params with `parseId`.

### Where code is shared, and why

- **Zod schemas** live in `src/features/<name>/schema.ts`, built from shared field schemas in `src/lib/validation.ts`, and are imported by both the client form and the server route. Validation rules are written once — don't duplicate a rule on one side.
- **Queries** live in `src/features/<name>/queries.ts` and are called by both the page's server render and the corresponding API route's client refresh, so the two cannot drift.
- **Database access** goes through `query` / `one` / `execute` in `src/lib/db.ts`. Always pass user input as `$1, $2, …` params; never interpolate into SQL. That file also installs type parsers (INT8 → number, TIMESTAMPTZ → ISO string) that the rest of the code assumes — ids compared as strings would silently break the "is this me?" self-edit guards.
- **Environment variables** are only read through `src/lib/env.ts`, which throws on missing values instead of falling back. There are no `NEXT_PUBLIC_*` variables by design; nothing from env reaches the client.

### Client-side conventions

- **Operation failures** — server errors, permission denials, uniqueness conflicts, network failures — go through `useErrorDialog()` from `src/components/ui/ErrorDialogProvider.tsx`: a modal, never `alert()`.
- **Pre-submit field validation** is a different thing and goes inline. `useFormErrors(formId)` from `src/features/forms/useFormErrors.ts` holds a `{ field: message }` map; `validate(schema, input)` returns the parsed value or `null` after marking *every* failing field and focusing the first one in DOM order. `setFieldError` covers rules not in a Zod schema (Profile's password confirmation). Render controls through `Field` from `src/components/ui/Field.tsx`, which owns the `id` / `aria-invalid` / `aria-describedby` wiring via a render prop.
- **Confirmations** use `useToast()` from `src/components/ui/ToastProvider.tsx` — auto-dismissing after 5s, paused while hovered or focused, capped at 3. There are no persistent success banners.
- The `Field`/`useFormErrors` pair warns in development when a schema rejects a field that has no control on screen (a path-less Zod issue, or a `name` that doesn't match the schema key). Both would otherwise refuse a submit with no visible reason.
- Theme: three modes (light/dark/system). "System" stores no attribute. An inline no-flash script in `src/app/layout.tsx` applies the stored preference before first paint and must carry the CSP nonce (forwarded from `src/proxy.ts` as the `x-nonce` request header).
- **Colours are `oklch()`, derived from three seeds on bare `:root`:** `--accent-h` (the rebrand knob), `--neutral-h`, and `--neutral-c` (set to `0` for pure greys — every neutral's chroma is a multiple of it). Seeds are declared once and never overridden per theme, which is what makes one edit reach both. **Rebranding is changing `--accent-h`.** Neutrals follow `--neutral-h` separately, so a red accent can keep cool greys; set `--neutral-h: var(--accent-h)` to link them.
- Because oklch holds lightness constant across hues, rotating `--accent-h` **cannot** break contrast — rebranding by hue is safe by construction. Editing a *lightness* value can, which is what `tests/e2e/contrast.spec.ts` guards.
- The dark palette is declared twice — under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, and under `:root[data-theme="dark"]` — because CSS cannot share a declaration list across a media query and an attribute selector. They must stay identical; the parity test in `contrast.spec.ts` fails if they drift.
- `--border` is decorative; **form controls use `--border-strong`**, which is held to WCAG 1.4.11's 3:1.
- Never hard-code a colour below the token blocks, and never add a `font-size` in px. The only literal left is the `16px` input size under `@media (max-width: 620px)`, which stops iOS Safari zooming on focus.
- Typography is a six-step scale — `--text-display/title/heading/body/label/micro` with matching `--track-*` values. Page headings use `.page-title`; secondary detail lines use `.meta`.
- Icons come from `src/components/icons/index.tsx`: `<Icon name="users" size={18} />`. `name` is typed, so a typo fails the build. They draw in `currentColor` and inherit their container's colour. **No emoji in `src/`.**
- Layout is mobile-first: below 900px the sidebar becomes an off-canvas drawer; inputs use 16px so iOS Safari doesn't zoom.

### Uploads

File type is decided by **magic bytes** in `src/lib/uploads.ts` — never the client `Content-Type` or filename. Files are stored under `UPLOAD_DIR` (outside `public/`, which would be served before any auth check) under a UUID name matching `/^[0-9a-f]{32}\.(png|jpg|webp|gif)$/`, and served by the authenticated `/api/uploads/:name` route. `apiFetch` intentionally omits `Content-Type` for `FormData` bodies so the browser can set the multipart boundary.

## Adding a module

1. Add an entry to `MODULES` in `src/lib/modules.ts`, including its `category` — one of the keys in `MODULE_CATEGORIES`, which decides the sidebar section it appears under. The build rejects an entry without a valid one.
2. `src/app/(main)/<path>/page.tsx` — server component whose first line is `await requirePageModule("<key>")`.
3. `src/features/<name>/` — client view, `schema.ts`, `queries.ts`.
4. API routes wrapped in `route()` and starting with `await requireModule("<key>")`.

The sidebar and role checkboxes pick it up from step 1 automatically; steps 2 and 4 are what actually protect it. `docs/rbac.md` has the full endpoint checklist.

## Testing layers

- `tests/unit/` — pure logic only (module/role resolution, Zod field schemas, magic-byte sniffing, rate-limit windows, logger redaction). Coverage thresholds apply and are scoped in `vitest.config.ts` to just those modules.
- `tests/api/` — real server, real database, over HTTP, no mocks; mocking would test the mocks instead of the guards. Runs sequentially (`fileParallelism: false`) because tests assert on shared state like rate-limit counters. Each `TestClient` sends a distinct `x-forwarded-for` to model a separate browser, which is how the per-identifier rate-limit tests stay meaningful.
- `tests/e2e/contrast.spec.ts` — asserts WCAG AA on every text/background pair in both themes, and that the two dark-mode routes compute identically. It rasterises colours through a canvas rather than parsing them, because `getComputedStyle` returns `oklch()` verbatim and canvas `fillStyle` preserves it too. **Run it after any change to a lightness value.**
- `tests/e2e/` — Playwright against a real browser, real server, real database. Covers only what needs a browser: focus trapping, inline validation, toasts, the mobile drawer, card tables, and the pre-paint theme script. It deliberately does **not** re-test RBAC, session forgery or upload sniffing — `tests/api/` owns those, and duplicating them here would only add runtime.

### Writing browser tests

Select fields by the id `Field` generates — `` `${formId}-${name}` `` — rather than by label text, so a copy change doesn't break a test. The form ids in use are `user-form`, `reset-form`, `role-form`, `profile-form` and `login`.

`ThemeToggle` renders `role="radio"` inside a `role="radiogroup"`, not buttons. Assertions about focus containment must check after **every** keypress, not once at the end: an untrapped dialog lets focus out and then wraps it back in, so a single check after N presses can pass by coincidence — see the comment in `tests/e2e/modal.spec.ts`.

Known gaps documented in the README and worth respecting rather than "fixing" unannounced: rate limiting is per-process in memory, CSRF relies on `SameSite=Lax`, `x-forwarded-for` is trusted for the IP key, there is no audit log table, and there is no visual-regression coverage.
