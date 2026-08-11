# UI/UX usability pass — design

**Date:** 2026-08-11
**Status:** approved, ready for planning
**Scope:** client-side usability only. A separate spec covers the visual pass.

---

## Problem

The portal's presentation layer is competently built — a real token system, correct
three-block theming, responsive breakpoints, `focus-visible` rings, a
`prefers-reduced-motion` guard, an off-canvas drawer, 16px inputs so iOS Safari
does not zoom. What it lacks is *interaction* quality. Six concrete defects:

1. **Validation reports one error per submit.** `LoginForm`, `UsersClient.save`,
   `ProfileClient.save` and `RolesClient` all call
   `showError(parsed.error.issues[0]?.message)`. A form with three bad fields
   takes three submits to fix, no field is marked, and nothing is focused.
2. **Success messages never clear.** Four independent `flash` string states
   render an `.alert.success` that persists until the next action.
3. **The modal does not trap focus.** Tab walks out of the dialog into the page
   behind it. Focus is not restored to the trigger on close.
4. **The modal closes on a dragged text selection.** `.modal-overlay` uses
   `onMouseDown`; selecting text inside the dialog and releasing outside it
   dismisses the dialog and discards the form.
5. **Tables only scroll sideways on mobile.** Five columns, one of which holds a
   three-button action group.
6. **No pending feedback on navigation.** Clicking a sidebar link does nothing
   visible until the server component resolves.

## Goals

Fix all six without changing a single line of server-side authorization.

## Non-goals

Visual redesign (palette, type scale, replacing emoji icons with SVG, spacing
rhythm) — that is the second spec, brainstormed separately after this lands.
Also out: table sorting, pagination, audit logging, rate limiting, CSRF.

---

## Constraints

**The error-display rule.** The global instruction "always display error messages
inside a popup modal rather than inline text" is scoped to *operation failures* —
server errors, permission denials, uniqueness conflicts, network failures. Those
keep using `useErrorDialog()` exactly as today. *Pre-submit field validation* is a
distinct concern and moves inline, under the field it belongs to. This
interpretation was confirmed during brainstorming and is the premise of the whole
spec.

**No new runtime dependencies.** The project ships zero UI libraries. A focus
trap, a toast queue, and inline errors are each small enough to own. One new
*dev* dependency: `@playwright/test`.

**No server changes.** Not one route handler, guard, permission schema, or SQL
query is edited. The sole server-touching change is message text in
`src/lib/validation.ts` (see below), which alters what an error *says*, never what
passes validation. The 338 existing tests are the regression net and must stay
green without modification.

---

## Architecture

Five new modules. Each has one purpose and a contract stated below.

| Module | Purpose | Tested by |
|---|---|---|
| `src/lib/form-errors.ts` | Pure. `ZodError` → `FieldErrors`. | unit |
| `src/lib/toasts.ts` | Pure. Toast queue reducer. | unit |
| `src/features/forms/useFormErrors.ts` | React state + focus for field errors. | Playwright |
| `src/components/ui/Field.tsx` | Label + control + hint + error, and the ARIA wiring between them. | Playwright |
| `src/components/ui/ToastProvider.tsx` | `useToast()`, mirroring `ErrorDialogProvider`. | Playwright |

The split between the `lib` modules and the React modules is deliberate: it puts
every branch worth asserting on into the existing unit suite, which needs no
services, and leaves only rendering and focus behavior to the browser suite.

### `src/lib/form-errors.ts`

```ts
export type FieldErrors = Record<string, string>;

/** Maps a ZodError to one message per field. First issue for a field wins. */
export function fieldErrorsFromZod(error: ZodError): FieldErrors;
```

Rules:

- Key is `String(issue.path[0])`. An issue with an empty path buckets to `_form`.
- The first issue seen for a key wins; later ones are discarded. Showing one
  message per field is the point.
- An `invalid_union` issue descends into its nested sub-issues and takes the
  first leaf message it finds, falling back to the union's own message. See
  "The union message defect" below for why this matters.

### `src/features/forms/useFormErrors.ts`

```ts
const { errors, validate, setFieldError, clearField, reset } = useFormErrors(formId);

validate<T>(schema: ZodType<T>, input: unknown): T | null
```

`validate` returns parsed data on success. On failure it stores the full
`FieldErrors` map, focuses the first invalid field, and returns `null` — so every
call site keeps its existing `if (!parsed) return;` shape.

"First invalid field" means **first in DOM order**, not first in Zod's issue
order. Zod reports issues in schema-declaration order, which need not match the
order the fields appear on screen; focusing by issue order would jump the user to
the second visible error. The lookup resolves every errored field's element and
picks the earliest by `compareDocumentPosition`.

`setFieldError(name, message)` exists for rules that are not in a Zod schema.
`ProfileClient` needs it: the new-password/confirm match is checked in the
component, not in `updateProfileSchema`.

`clearField(name)` is called from each input's `onChange`, so an error disappears
as the user corrects it rather than persisting until the next submit.

**Focus lookup.** `Field` derives its control id deterministically as
`` `${formId}-${name}` ``, and focusing the first invalid field is a
`document.getElementById` on that string. The alternative — a ref registry
threaded through context — is more machinery for the same result, and the
deterministic id doubles as a stable Playwright selector. Accepted tradeoff: a
string convention that `Field` and `useFormErrors` must agree on. Both take
`formId` from the same call site, and a mismatch shows up immediately as "the
field did not focus" in the E2E suite.

### `src/components/ui/Field.tsx`

```tsx
<Field name="email" label="Email" hint="Optional." error={errors.email} required>
  {(a) => (
    <input {...a} type="email" value={form.email}
      onChange={(e) => { setForm({ ...form, email: e.target.value }); clearField("email"); }} />
  )}
</Field>
```

The render prop supplies `{ id, "aria-invalid", "aria-describedby" }`. A render
prop rather than `cloneElement`: the props are typed, the input stays an ordinary
input, and nothing is injected invisibly.

`aria-describedby` points at the hint, the error, or both, in that order. When
`error` is set the field renders with a danger border and the message below it
in `--danger-text`.

### `src/lib/toasts.ts` + `ToastProvider`

Pure reducer over `{ id, message, tone }`:

- `add` appends; when the queue exceeds **3**, the oldest is dropped
- `dismiss` removes by id
- `expire` removes everything past its deadline

The provider mounts beside `ErrorDialogProvider` in the root layout and exposes
`useToast()` with `showToast(message, tone?)`. Behavior: auto-dismiss after
**5s**, paused while hovered or focused, manually dismissible, `role="status"` on
the container so it is announced once, and no entry/exit animation under
`prefers-reduced-motion`.

This replaces four separate `flash` states. Each removal is part of that screen's
migration commit.

### `Modal.tsx` changes

1. **Focus trap.** Query focusable descendants on Tab; wrap from last to first
   and first to last. Escape continues to close.
2. **Focus restore.** Capture `document.activeElement` on mount; restore it on
   unmount, so closing a dialog returns the caret to the button that opened it.
3. **`aria-labelledby`** pointing at the heading, replacing `aria-label`.
4. **Overlay close.** Close only when mousedown *and* mouseup both landed on the
   overlay. Fixes defect 4.

Existing behavior kept as-is: Escape to close, body scroll lock, and no focus
ring on the panel itself (a deliberate earlier decision, recorded in
`globals.css`).

### Mobile tables

CSS-only, opt-in via a `.table-cards` class on `.table-wrap`. Below **700px**:
`thead` is hidden, rows become bordered cards, and each `<td>` draws its label
from a `data-label` attribute via `::before`. No JavaScript and no layout
component — the markup change is one attribute per cell.

Applied to the Users and Dashboard tables — the only two tables in the app.
`RolesClient` renders a `grid cols-2` of cards, which already collapses to one
column below 960px and needs no change.

### Pending states

Sidebar links use Next 16's `useLinkStatus` to show a pending indicator on the
link being navigated to. Submit buttons already have `saving` booleans on Users
and Profile; Roles and the delete confirmations get the same treatment so no
destructive action can be double-fired.

---

## The union message defect

`emailSchema`, `mobileSchema`, `roleIdSchema` and `photoUrlSchema` are all
`z.union([z.literal(""), …])`. When both branches fail, Zod reports an
`invalid_union` issue whose own message is generic — so a malformed email can
surface as *"Invalid input"* instead of the written *"Enter a valid email
address."*

This is latent today because only `issues[0]` is ever shown and it is usually a
different field. Once messages sit under the field they describe, it is glaring.
It affects the server too: `firstZodMessage` in `src/lib/api.ts` reads the same
issue, so a 400 from the API carries the same generic text.

Fixed in two places, deliberately redundant:

1. **`src/lib/validation.ts`** — give each union an explicit error message, so
   client *and* server produce the written text. The exact parameter shape is
   confirmed against the installed Zod version as the first step of this task,
   and the accompanying unit test asserts the resulting message, so a wrong guess
   fails immediately rather than silently.
2. **`fieldErrorsFromZod`** — descend into `invalid_union` sub-issues as a
   fallback, so any union added later cannot regress the client display.

New unit tests in `tests/unit/validation.test.ts` assert the message for an
invalid email and an invalid mobile.

---

## Testing

### Unit (existing suite)

New files `tests/unit/form-errors.test.ts` and `tests/unit/toasts.test.ts`. Both
modules are added to the `coverage.include` list in `vitest.config.ts`, so the
existing 90/85/90/90 thresholds apply to them.

### End-to-end (new)

`@playwright/test`, Chromium only. Six specs, scoped to what genuinely needs a
browser — RBAC, session forgery, and upload sniffing stay with the API suite and
are not duplicated:

| Spec | Asserts |
|---|---|
| `auth.spec.ts` | Bad password opens the error modal; good password lands on the dashboard |
| `validation.spec.ts` | Empty name **and** bad email show both messages at once; the first invalid field has focus |
| `modal.spec.ts` | Tab cycles inside the dialog; Escape closes and restores focus to the trigger; a drag-select ending outside does **not** close it |
| `toast.spec.ts` | Creating a user shows a toast that auto-dismisses |
| `mobile.spec.ts` | At a phone viewport the drawer opens and closes, and the users table renders as cards |
| `theme.spec.ts` | light / dark / system each survive a reload with no flash of the wrong theme |

### Harness

`tests/api/setup/globalSetup.ts` already performs the exact boot sequence E2E
needs. Rather than fork it, its body is extracted to `tests/support/server.ts`,
parameterized by port, and consumed by both harnesses. The vitest global setup
becomes a thin caller and its observable behavior does not change.

- API suite: port 3311 (unchanged)
- E2E suite: port 3312

**Database hazard.** Both harnesses `DROP TABLE admin_users, roles` on the
database `DATABASE_URL` names. Running them concurrently corrupts both runs.
Therefore:

- `test:e2e` reads `E2E_DATABASE_URL` when set, falling back to `DATABASE_URL`
- `npm run verify` stays a strictly sequential chain, with E2E last
- The hazard is documented in `CLAUDE.md` beside the existing `test:api` warning

### Scripts and CI

```jsonc
"test:e2e": "playwright test",
"verify": "npm run typecheck && npm run lint && npm run test && npm run build && npm run test:api && npm run test:e2e"
```

CI gains `npx playwright install --with-deps chromium` before a new E2E step that
runs after the API tests.

---

## Rollout

Screen by screen. Every commit leaves `npm run verify` green.

| # | Commit | Contents |
|---|---|---|
| 1 | Primitives + Users | The five new modules, `Modal` fixes, `.table-cards`, the `validation.ts` message fix, all applied to `UsersClient` |
| 2 | Checkpoint | Re-read the primitive API against Roles, Profile and Login. One refactor permitted here, before three more screens depend on it |
| 3 | Roles | `RolesClient` migration (validation + toasts only; its card grid is already responsive) |
| 4 | Profile | `ProfileClient` migration, including the confirm-password rule via `setFieldError` |
| 5 | Login | `LoginForm` migration |
| 6 | Cleanup + E2E | Remove dead `flash` state and now-unused `.alert.success`; land the six specs; update `CLAUDE.md` and `README.md` |

Step 2 is the mitigation for the known weakness of a screen-by-screen order:
Users is the most complex screen — three modals, privilege-gated fields — and an
API shaped around it alone may not fit a two-field login form. The checkpoint
forces that question before the cost of answering it triples.

---

## Risks

| Risk | Mitigation |
|---|---|
| Primitives over-fit to Users | The step-2 checkpoint, with one refactor budgeted |
| Focus trap breaks keyboard use in a way manual testing misses | `modal.spec.ts` asserts the cycle and the restore directly |
| E2E flakes on timing and erodes trust in CI | Playwright's auto-waiting assertions only; no fixed sleeps |
| Two suites racing on one database | Separate ports, optional `E2E_DATABASE_URL`, sequential `verify`, documented in `CLAUDE.md` |
| A regression reaches authorization | No server file is edited except message text; the existing 338 tests run unmodified at every step |

## Rollback

Each screen is an independent commit. Reverting one restores that screen without
disturbing the others. Reverting commit 1 removes the primitives and requires
reverting 3–5 first.

---

## Success criteria

1. A form with three invalid fields shows three messages on one submit, with the
   first invalid field focused.
2. An invalid email reads "Enter a valid email address." on both the client and
   in the API's 400 response.
3. Server failures, permission denials and conflicts still appear in the modal.
4. Success messages self-dismiss.
5. Tab cannot leave an open dialog; closing one returns focus to its trigger.
6. Dragging a text selection out of a dialog does not close it.
7. The Users and Dashboard tables read as cards on a phone, with no sideways
   scroll.
8. `npm run verify` — typecheck, lint, 203+ unit, build, 135 API, 6 E2E — passes.
