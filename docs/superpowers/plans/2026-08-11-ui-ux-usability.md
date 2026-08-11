# UI/UX Usability Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace one-error-at-a-time modal validation, permanent success banners, an untrapped modal and sideways-scrolling mobile tables with inline field errors, self-dismissing toasts, a proper focus trap and card-style tables — without touching any server-side authorization.

**Architecture:** Two pure modules (`src/lib/form-errors.ts`, `src/lib/toasts.ts`) hold every branch worth asserting on and are covered by the existing unit suite. Three React modules (`useFormErrors`, `Field`, `ToastProvider`) consume them and are covered by a new Playwright suite. The four feature clients then migrate one screen per commit, with a review checkpoint after the first.

**Tech Stack:** Next.js 16.3.0 (App Router), React 19, TypeScript 5.9, Zod 4.4.3, Vitest 3.2, `@playwright/test` (new devDependency, Chromium only).

**Spec:** `docs/superpowers/specs/2026-08-11-ui-ux-usability-design.md`

## Global Constraints

- **No new runtime dependencies.** `@playwright/test` is the only addition and it is a `devDependency`.
- **No server-side authorization changes.** No route handler, guard, permission schema, or SQL query is edited. The only server-reachable edit in this plan is the `roleIdSchema` message in `src/lib/validation.ts`.
- **The 338 existing tests (203 unit + 135 API) run unmodified and stay green at every task.** If one fails, the task is wrong — do not edit the test.
- **Error display split:** operation failures (server errors, permission denials, conflicts, network) keep using `useErrorDialog()` and its modal. Pre-submit field validation goes inline. Never use `alert()`.
- **Colors come from CSS custom properties in `src/app/globals.css`.** No hex values outside the three token blocks.
- **Theme tokens are declared in three blocks that must stay in sync:** bare `:root`, `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, and `:root[data-theme="dark"]`. New tokens go in all three.
- **Node >= 22.** Run `npm run verify` before every commit unless a task says otherwise.
- **Mobile-first:** inputs stay at 16px below 620px so iOS Safari does not zoom.

---

## File Structure

**Create:**

| Path | Responsibility |
|---|---|
| `src/lib/form-errors.ts` | Pure. `ZodError` → `FieldErrors`; the field-id convention. |
| `src/lib/toasts.ts` | Pure. Toast queue reducer with injected clock. |
| `src/features/forms/useFormErrors.ts` | React state, DOM-order focus, manual field errors. |
| `src/components/ui/Field.tsx` | Label + control + hint + error and their ARIA wiring. |
| `src/components/ui/ToastProvider.tsx` | `useToast()` + the live region. |
| `tests/unit/form-errors.test.ts` | Unit coverage for `form-errors.ts`. |
| `tests/unit/toasts.test.ts` | Unit coverage for `toasts.ts`. |
| `tests/support/server.ts` | Shared server boot/teardown for both integration harnesses. |
| `playwright.config.ts` | E2E config. |
| `tests/e2e/global-setup.ts`, `tests/e2e/global-teardown.ts` | E2E server lifecycle. |
| `tests/e2e/support/actions.ts` | `signIn()` helper + seeded credentials. |
| `tests/e2e/{auth,validation,modal,toast,mobile,theme}.spec.ts` | The six specs. |

**Modify:**

| Path | Change |
|---|---|
| `src/lib/validation.ts` | `roleIdSchema` message only. |
| `src/components/ui/Modal.tsx` | Focus trap, focus restore, `aria-labelledby`, overlay-close fix. |
| `src/app/layout.tsx` | Mount `ToastProvider`. |
| `src/app/globals.css` | Field-error, toast and `.table-cards` styles + two new tokens. |
| `src/features/users/UsersClient.tsx` | Full migration. |
| `src/features/roles/RolesClient.tsx` | Validation + toasts. |
| `src/features/profile/ProfileClient.tsx` | Validation + toasts, incl. non-Zod confirm rule. |
| `src/features/auth/LoginForm.tsx` | Validation. |
| `src/features/dashboard/DashboardClient.tsx` | `.table-cards` + `data-label`. |
| `src/components/AppShell.tsx` | Nav pending indicator. |
| `tests/api/setup/globalSetup.ts` | Delegate to `tests/support/server.ts`. |
| `vitest.config.ts` | Add the two new modules to `coverage.include`. |
| `package.json` | `test:e2e` script, `verify` chain, devDependency. |
| `.github/workflows/ci.yml` | Browser install + E2E step. |
| `CLAUDE.md`, `README.md` | Document the new suite and its database hazard. |

---

## Task 1: Field-error mapping + the `role_id` message

**Files:**
- Create: `src/lib/form-errors.ts`
- Create: `tests/unit/form-errors.test.ts`
- Modify: `src/lib/validation.ts` (`roleIdSchema`, lines 47-50)
- Modify: `tests/unit/validation.test.ts` (append)
- Modify: `vitest.config.ts` (`coverage.include`)

**Interfaces:**
- Consumes: nothing.
- Produces: `type FieldErrors = Record<string, string>`, `fieldErrorsFromZod(error: ZodError): FieldErrors`, `fieldElementId(formId: string, name: string): string`, `const FORM_LEVEL_KEY = "_form"`.

**Background the implementer needs:** Zod 4.4.3 reports one issue per failing field with `path: ["email"]`-style single-element paths. It picks the *plausible* branch of a union and surfaces that branch's sub-issue, so `email`, `mobile` and `photo_url` already produce their written messages. Only `roleIdSchema` degrades, because neither of its branches is plausible for a non-numeric string. Do **not** descend into an `invalid_union` issue's `errors` array — its branch messages are Zod internals (`Invalid input: expected ""`), strictly worse than the union's own message.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/form-errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  FORM_LEVEL_KEY,
  fieldElementId,
  fieldErrorsFromZod,
} from "@/lib/form-errors";

const schema = z.object({
  full_name: z.string().min(1, "Full name is required."),
  email: z.email("Enter a valid email address."),
});

function errorFrom(input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) throw new Error("expected the schema to reject this input");
  return result.error;
}

describe("fieldErrorsFromZod", () => {
  it("returns one message per failing field", () => {
    const errors = fieldErrorsFromZod(errorFrom({ full_name: "", email: "nope" }));
    expect(errors).toEqual({
      full_name: "Full name is required.",
      email: "Enter a valid email address.",
    });
  });

  it("keeps the first message when one field fails twice", () => {
    const twice = z.object({
      pin: z.string().min(4, "Too short.").regex(/^\d+$/, "Digits only."),
    });
    const result = twice.safeParse({ pin: "ab" });
    if (result.success) throw new Error("expected rejection");
    expect(fieldErrorsFromZod(result.error).pin).toBe("Too short.");
  });

  it("buckets a path-less issue under the form-level key", () => {
    const formLevel = z
      .object({ a: z.string() })
      .refine(() => false, { message: "The whole form is wrong." });
    const result = formLevel.safeParse({ a: "x" });
    if (result.success) throw new Error("expected rejection");
    expect(fieldErrorsFromZod(result.error)[FORM_LEVEL_KEY]).toBe(
      "The whole form is wrong.",
    );
  });

  it("returns an empty map for an error with no issues", () => {
    expect(fieldErrorsFromZod(new z.ZodError([]))).toEqual({});
  });
});

describe("fieldElementId", () => {
  it("joins the form id and field name", () => {
    expect(fieldElementId("user-form", "email")).toBe("user-form-email");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/form-errors.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/form-errors"`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/form-errors.ts`:

```ts
import type { ZodError } from "zod";

// Maps a ZodError onto the fields of a form, so every problem can be shown at
// once under the input it belongs to. The counterpart to this file's output is
// `Field`, which renders a message, and `useFormErrors`, which holds the map.
//
// Deliberately NOT handled here: `invalid_union` issues are left with their own
// message. Zod 4 only reports one when no branch was plausible, and the nested
// branch messages are internals ("Invalid input: expected \"\"") — worse than
// the generic text. The fix for those belongs in the schema, as a written
// message on the union itself. See roleIdSchema in ./validation.ts.

export type FieldErrors = Record<string, string>;

/** Key used for issues that belong to the form rather than to one field. */
export const FORM_LEVEL_KEY = "_form";

/** The DOM id `Field` gives its control, and `useFormErrors` focuses by. */
export function fieldElementId(formId: string, name: string): string {
  return `${formId}-${name}`;
}

/**
 * One message per field. The first issue for a field wins — showing a stack of
 * messages under one input is noise, and the first is the one the user hits.
 */
export function fieldErrorsFromZod(error: ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : FORM_LEVEL_KEY;
    if (key in errors) continue;
    errors[key] = issue.message;
  }
  return errors;
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run tests/unit/form-errors.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing test for the `role_id` message**

Append to `tests/unit/validation.test.ts`:

```ts
describe("roleIdSchema messages", () => {
  it("reports a written message for a non-numeric value", () => {
    const result = roleIdSchema.safeParse("abc");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Select a valid role group.");
    }
  });

  it("reports a written message for a non-positive value", () => {
    const result = roleIdSchema.safeParse("-1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Select a valid role group.");
    }
  });

  it("still accepts an empty string as null and a numeric id as a number", () => {
    expect(roleIdSchema.parse("")).toBeNull();
    expect(roleIdSchema.parse("3")).toBe(3);
    expect(roleIdSchema.parse(2)).toBe(2);
  });

  // These three already pass. They are pinned so a future Zod upgrade that
  // reintroduces a generic union message is caught here rather than in the UI.
  it("keeps the written messages for email, mobile and photo_url", () => {
    const email = emailSchema.safeParse("not-an-email");
    const mobile = mobileSchema.safeParse("!!!");
    const photo = photoUrlSchema.safeParse("https://evil.test/x.png");
    expect(email.success).toBe(false);
    expect(mobile.success).toBe(false);
    expect(photo.success).toBe(false);
    if (!email.success) {
      expect(email.error.issues[0]?.message).toBe("Enter a valid email address.");
    }
    if (!mobile.success) {
      expect(mobile.error.issues[0]?.message).toBe(
        "Enter a valid mobile number (digits, spaces and hyphens only).",
      );
    }
    if (!photo.success) {
      expect(photo.error.issues[0]?.message).toBe("Photo must be an uploaded file.");
    }
  });
});
```

Add `roleIdSchema`, `emailSchema`, `mobileSchema` and `photoUrlSchema` to that file's existing import from `@/lib/validation` if they are not already imported.

- [ ] **Step 6: Run it to make sure it fails**

Run: `npx vitest run tests/unit/validation.test.ts -t "roleIdSchema messages"`
Expected: FAIL — the first assertion receives `"Invalid input"`.

- [ ] **Step 7: Fix `roleIdSchema`**

In `src/lib/validation.ts`, replace the `roleIdSchema` declaration:

```ts
/**
 * A role id, or "" meaning "no role".
 *
 * The written messages are on both the union and the number branch. Zod reports
 * the union's own message when neither branch is plausible ("abc"), and the
 * branch's message when one is ("-1" coerces to a number, then fails positive).
 * Without them a bad value reaches the client as "Invalid input".
 */
export const roleIdSchema = z
  .union(
    [
      z.literal(""),
      z.coerce
        .number()
        .int("Select a valid role group.")
        .positive("Select a valid role group."),
    ],
    { error: "Select a valid role group." },
  )
  .transform((v) => (v === "" ? null : v))
  .nullable();
```

- [ ] **Step 8: Run the tests and make sure they pass**

Run: `npx vitest run tests/unit/validation.test.ts`
Expected: PASS, including the four new tests.

- [ ] **Step 9: Add the new module to the coverage scope**

In `vitest.config.ts`, add to `coverage.include`, after `"src/lib/validation.ts",`:

```ts
        "src/lib/form-errors.ts",
```

- [ ] **Step 10: Run the full verify chain**

Run: `npm run verify`
Expected: PASS. The API tests must be unaffected — `roleIdSchema` accepts and rejects exactly what it did before; only the message text changed.

- [ ] **Step 11: Commit**

```bash
git add src/lib/form-errors.ts src/lib/validation.ts tests/unit/form-errors.test.ts tests/unit/validation.test.ts vitest.config.ts
git commit -m "Add field-error mapping and a written message for role_id"
```

---

## Task 2: Toast queue reducer

**Files:**
- Create: `src/lib/toasts.ts`
- Create: `tests/unit/toasts.test.ts`
- Modify: `vitest.config.ts` (`coverage.include`)

**Interfaces:**
- Consumes: nothing.
- Produces: `type ToastTone = "success" | "info"`, `type Toast = { id: number; message: string; tone: ToastTone; expiresAt: number }`, `type ToastState = { toasts: Toast[]; nextId: number }`, `type ToastAction`, `const TOAST_LIMIT = 3`, `const TOAST_DURATION_MS = 5000`, `const initialToastState: ToastState`, `toastReducer(state: ToastState, action: ToastAction): ToastState`.

**Design note for the implementer:** the current time is passed in as `now` on the actions rather than read inside the reducer. That keeps the module pure, makes expiry testable without fake timers, and matches how `src/lib/rate-limit.ts` is already tested in this repo.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/toasts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  TOAST_DURATION_MS,
  TOAST_LIMIT,
  initialToastState,
  toastReducer,
  type ToastState,
} from "@/lib/toasts";

function add(state: ToastState, message: string, now = 1_000): ToastState {
  return toastReducer(state, { type: "add", message, tone: "success", now });
}

describe("toastReducer", () => {
  it("adds a toast with an incrementing id and a deadline", () => {
    const state = add(initialToastState, "Saved.");
    expect(state.toasts).toHaveLength(1);
    expect(state.toasts[0]).toMatchObject({
      id: 1,
      message: "Saved.",
      tone: "success",
      expiresAt: 1_000 + TOAST_DURATION_MS,
    });
    expect(add(state, "Again.").toasts[1]?.id).toBe(2);
  });

  it("drops the oldest toast once the limit is exceeded", () => {
    let state = initialToastState;
    for (let i = 1; i <= TOAST_LIMIT + 1; i += 1) state = add(state, `#${i}`);
    expect(state.toasts).toHaveLength(TOAST_LIMIT);
    expect(state.toasts[0]?.message).toBe("#2");
    expect(state.toasts.at(-1)?.message).toBe(`#${TOAST_LIMIT + 1}`);
  });

  it("dismisses by id and ignores an unknown id", () => {
    const state = add(add(initialToastState, "a"), "b");
    expect(toastReducer(state, { type: "dismiss", id: 1 }).toasts).toHaveLength(1);
    expect(toastReducer(state, { type: "dismiss", id: 99 })).toBe(state);
  });

  it("expires only toasts past their deadline", () => {
    const state = add(add(initialToastState, "old", 1_000), "new", 4_000);
    const expired = toastReducer(state, {
      type: "expire",
      now: 1_000 + TOAST_DURATION_MS + 1,
    });
    expect(expired.toasts.map((t) => t.message)).toEqual(["new"]);
  });

  it("returns the same state when nothing has expired", () => {
    const state = add(initialToastState, "still fresh", 1_000);
    expect(toastReducer(state, { type: "expire", now: 1_500 })).toBe(state);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/toasts.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/toasts"`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/toasts.ts`:

```ts
// The toast queue, as a pure reducer.
//
// `now` is supplied by the caller rather than read here, so expiry is testable
// without fake timers and the module stays free of side effects — the same
// approach src/lib/rate-limit.ts takes.

export type ToastTone = "success" | "info";

export type Toast = {
  id: number;
  message: string;
  tone: ToastTone;
  expiresAt: number;
};

export type ToastState = {
  toasts: Toast[];
  nextId: number;
};

/** Beyond this many, the oldest is dropped — a stack taller than this is noise. */
export const TOAST_LIMIT = 3;

/** How long a toast stays up when it is neither hovered nor focused. */
export const TOAST_DURATION_MS = 5_000;

export const initialToastState: ToastState = { toasts: [], nextId: 1 };

export type ToastAction =
  | { type: "add"; message: string; tone: ToastTone; now: number }
  | { type: "dismiss"; id: number }
  | { type: "expire"; now: number };

export function toastReducer(state: ToastState, action: ToastAction): ToastState {
  switch (action.type) {
    case "add": {
      const toast: Toast = {
        id: state.nextId,
        message: action.message,
        tone: action.tone,
        expiresAt: action.now + TOAST_DURATION_MS,
      };
      const toasts = [...state.toasts, toast];
      return {
        toasts: toasts.slice(Math.max(0, toasts.length - TOAST_LIMIT)),
        nextId: state.nextId + 1,
      };
    }
    case "dismiss": {
      const toasts = state.toasts.filter((t) => t.id !== action.id);
      // Same reference when nothing matched, so React can skip the re-render.
      return toasts.length === state.toasts.length ? state : { ...state, toasts };
    }
    case "expire": {
      const toasts = state.toasts.filter((t) => t.expiresAt > action.now);
      return toasts.length === state.toasts.length ? state : { ...state, toasts };
    }
  }
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run tests/unit/toasts.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add to the coverage scope**

In `vitest.config.ts`, add to `coverage.include`:

```ts
        "src/lib/toasts.ts",
```

- [ ] **Step 6: Verify and commit**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add src/lib/toasts.ts tests/unit/toasts.test.ts vitest.config.ts
git commit -m "Add a pure toast queue reducer"
```

---

## Task 3: ToastProvider and its styles

**Files:**
- Create: `src/components/ui/ToastProvider.tsx`
- Modify: `src/app/layout.tsx:47-51`
- Modify: `src/app/globals.css` (append a section; add tokens to all three blocks)

**Interfaces:**
- Consumes: `toastReducer`, `initialToastState`, `TOAST_DURATION_MS`, `type ToastTone` from `@/lib/toasts`.
- Produces: `ToastProvider({ children }: { children: ReactNode })` and `useToast(): { showToast: (message: string, tone?: ToastTone) => void }`.

- [ ] **Step 1: Create the provider**

Create `src/components/ui/ToastProvider.tsx`:

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  TOAST_DURATION_MS,
  initialToastState,
  toastReducer,
  type ToastTone,
} from "@/lib/toasts";

// Confirmations live here; failures live in ErrorDialogProvider's modal. The
// split is deliberate: a success needs to be noticed and then go away on its
// own, while a failure needs to stop the user and be acknowledged.

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(toastReducer, initialToastState);
  // Hovering or focusing the stack holds everything on screen, so a toast
  // cannot vanish from under the pointer on its way to the dismiss button.
  const [held, setHeld] = useState(false);
  const heldRef = useRef(held);
  heldRef.current = held;

  useEffect(() => {
    if (state.toasts.length === 0 || held) return;
    const timer = window.setInterval(() => {
      if (!heldRef.current) dispatch({ type: "expire", now: Date.now() });
    }, 250);
    return () => window.clearInterval(timer);
  }, [state.toasts.length, held]);

  const showToast = useCallback((message: string, tone: ToastTone = "success") => {
    dispatch({ type: "add", message, tone, now: Date.now() });
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext value={value}>
      {children}
      <div
        className="toast-region"
        role="status"
        aria-live="polite"
        onMouseEnter={() => setHeld(true)}
        onMouseLeave={() => setHeld(false)}
        onFocusCapture={() => setHeld(true)}
        onBlurCapture={() => setHeld(false)}
      >
        {state.toasts.map((toast) => (
          <div key={toast.id} className={"toast " + toast.tone} data-testid="toast">
            <span className="toast-message">{toast.message}</span>
            <button
              type="button"
              className="toast-dismiss"
              aria-label="Dismiss notification"
              onClick={() => dispatch({ type: "dismiss", id: toast.id })}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside a ToastProvider.");
  }
  return context;
}

export { TOAST_DURATION_MS };
```

- [ ] **Step 2: Mount it in the root layout**

In `src/app/layout.tsx`, add the import beside the existing one:

```tsx
import { ToastProvider } from "@/components/ui/ToastProvider";
```

and replace the body contents:

```tsx
      <body>
        <ThemeProvider>
          <ErrorDialogProvider>
            <ToastProvider>{children}</ToastProvider>
          </ErrorDialogProvider>
        </ThemeProvider>
      </body>
```

- [ ] **Step 3: Add the tokens**

In `src/app/globals.css`, add to the bare `:root` block, after `--login-glow`:

```css
  --toast-accent: #15803d;
```

Add the same property with the dark value to **both** the `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` block and the `:root[data-theme="dark"]` block, after their `--login-glow`:

```css
  --toast-accent: #86efac;
```

- [ ] **Step 4: Add the styles**

Append to `src/app/globals.css`:

```css
/* ---------- Toasts ---------- */
.toast-region {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(360px, calc(100vw - 40px));
  /* The region is always mounted so the live region is stable; without this it
     would swallow clicks on whatever sits beneath it. */
  pointer-events: none;
}

.toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 3px solid var(--toast-accent);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
  font-size: 13px;
  animation: toast-in 0.18s ease;
}

.toast.info {
  border-left-color: var(--info-text);
}

.toast-message {
  flex: 1;
  min-width: 0;
}

.toast-dismiss {
  background: transparent;
  border: none;
  color: var(--muted);
  font-size: 17px;
  line-height: 1;
  padding: 0 2px;
  cursor: pointer;
  font-family: inherit;
}

.toast-dismiss:hover {
  color: var(--text);
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (max-width: 620px) {
  .toast-region {
    left: 12px;
    right: 12px;
    bottom: 12px;
    width: auto;
  }
}
```

The existing `@media (prefers-reduced-motion: reduce)` block near the top of the file already caps every `animation-duration`, so `toast-in` needs no separate guard.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: PASS. Nothing renders a toast yet; this task only makes it available.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/ToastProvider.tsx src/app/layout.tsx src/app/globals.css
git commit -m "Add a toast provider for self-dismissing confirmations"
```

---

## Task 4: useFormErrors and Field

**Files:**
- Create: `src/features/forms/useFormErrors.ts`
- Create: `src/components/ui/Field.tsx`
- Modify: `src/app/globals.css` (append field-error styles)

**Interfaces:**
- Consumes: `fieldErrorsFromZod`, `fieldElementId`, `type FieldErrors` from `@/lib/form-errors`.
- Produces:
  - `useFormErrors(formId: string): { errors: FieldErrors; validate: <T>(schema: ZodType<T>, input: unknown) => T | null; setFieldError: (name: string, message: string) => void; clearField: (name: string) => void; reset: () => void }`
  - `Field(props: { formId: string; name: string; label: string; hint?: string; error?: string; required?: boolean; children: (control: FieldControlProps) => ReactNode })` — default export
  - `type FieldControlProps = { id: string; "aria-invalid": true | undefined; "aria-describedby": string | undefined }`

- [ ] **Step 1: Create the hook**

Create `src/features/forms/useFormErrors.ts`:

```ts
"use client";

import { useCallback, useState } from "react";
import type { ZodType } from "zod";
import {
  fieldElementId,
  fieldErrorsFromZod,
  type FieldErrors,
} from "@/lib/form-errors";

// Holds the per-field validation state for one form, and moves focus to the
// first problem so a keyboard or screen-reader user is not left guessing which
// of six fields was rejected.

/**
 * Focuses the errored field that comes first *in the document*, which is not
 * necessarily the first issue Zod reported — Zod walks the schema in
 * declaration order, and a schema's field order need not match the form's.
 * Focusing by issue order would skip the user past a visible error.
 */
function focusFirstError(formId: string, errors: FieldErrors): void {
  const elements = Object.keys(errors)
    .map((name) => document.getElementById(fieldElementId(formId, name)))
    .filter((element): element is HTMLElement => element !== null);

  if (elements.length === 0) return;

  const first = elements.reduce((earliest, element) =>
    earliest.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING
      ? element
      : earliest,
  );

  first.focus();
}

export function useFormErrors(formId: string) {
  const [errors, setErrors] = useState<FieldErrors>({});

  /** Returns the parsed value, or null after recording every field's error. */
  const validate = useCallback(
    <T,>(schema: ZodType<T>, input: unknown): T | null => {
      const result = schema.safeParse(input);
      if (result.success) {
        setErrors({});
        return result.data;
      }
      const next = fieldErrorsFromZod(result.error);
      setErrors(next);
      // After paint, so the elements being focused have rendered their errors.
      requestAnimationFrame(() => focusFirstError(formId, next));
      return null;
    },
    [formId],
  );

  /** For rules that are not in a Zod schema — see ProfileClient's password confirmation. */
  const setFieldError = useCallback(
    (name: string, message: string) => {
      setErrors((current) => ({ ...current, [name]: message }));
      requestAnimationFrame(() => focusFirstError(formId, { [name]: message }));
    },
    [formId],
  );

  /** Called from each control's onChange, so a message clears as it is fixed. */
  const clearField = useCallback((name: string) => {
    setErrors((current) => {
      if (!(name in current)) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }, []);

  const reset = useCallback(() => setErrors({}), []);

  return { errors, validate, setFieldError, clearField, reset };
}
```

- [ ] **Step 2: Create the Field component**

Create `src/components/ui/Field.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { fieldElementId } from "@/lib/form-errors";

// Owns the wiring between a label, a control, its hint and its error message,
// so no call site has to remember aria-describedby.
//
// A render prop rather than cloneElement: the props are typed, the control
// stays an ordinary <input>/<select>, and nothing is injected invisibly.

export type FieldControlProps = {
  id: string;
  "aria-invalid": true | undefined;
  "aria-describedby": string | undefined;
};

type FieldProps = {
  /** Shared with useFormErrors — together they determine the control's id. */
  formId: string;
  name: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (control: FieldControlProps) => ReactNode;
};

export default function Field({
  formId,
  name,
  label,
  hint,
  error,
  required = false,
  children,
}: FieldProps) {
  const id = fieldElementId(formId, name);
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={"field" + (error ? " has-error" : "")}>
      <label htmlFor={id}>
        {label}
        {required && " *"}
      </label>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })}
      {hint && (
        <div className="hint" id={hintId}>
          {hint}
        </div>
      )}
      {/* No role="alert" here: a form failing four fields would fire four
          announcements at once. The message is reached through the focused
          field's aria-describedby instead, which announces exactly one. */}
      {error && (
        <div className="field-error" id={errorId}>
          {error}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add the styles**

Append to `src/app/globals.css`, after the `/* ---------- Forms ---------- */` section's `.form-grid` media query:

```css
.field-error {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--danger-text);
  margin-top: 6px;
}

.field.has-error input,
.field.has-error select,
.field.has-error textarea {
  border-color: var(--danger);
}

.field.has-error input:focus,
.field.has-error select:focus,
.field.has-error textarea:focus {
  border-color: var(--danger);
  box-shadow: 0 0 0 3px var(--danger-soft);
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: PASS. No screen uses these yet.

- [ ] **Step 5: Commit**

```bash
git add src/features/forms/useFormErrors.ts src/components/ui/Field.tsx src/app/globals.css
git commit -m "Add useFormErrors and a Field wrapper for inline validation"
```

---

## Task 5: Modal focus management

**Files:**
- Modify: `src/components/ui/Modal.tsx` (whole file)
- Modify: `src/app/globals.css` (one rule)

**Interfaces:**
- Consumes: nothing new.
- Produces: unchanged public props — `{ title, onClose, children, footer?, wide?, tone? }`. Every existing call site keeps working untouched.

**What is being fixed:** Tab currently walks out of the dialog into the page behind it; focus is not returned to the trigger on close; the dialog is labelled with `aria-label` rather than pointing at its own heading; and because the overlay closes on `mousedown`, selecting text inside the dialog and releasing outside it discards the form.

- [ ] **Step 1: Rewrite the component**

Replace the contents of `src/components/ui/Modal.tsx`:

```tsx
"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

type ModalProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Visual treatment — `danger` is used by the error dialog. */
  tone?: "default" | "danger";
};

// Everything focusable that a Tab press should reach. `:not([disabled])`
// matters: a disabled "Saving…" button must not swallow the wrap-around.
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export default function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
  tone = "default",
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Which element the overlay's mousedown landed on. A drag that starts inside
  // the dialog and ends on the overlay must NOT close it — that gesture is a
  // text selection, and closing discards whatever the user has typed.
  const pressedOnOverlay = useRef(false);
  const headingId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialog?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) {
        // Nothing to move to; keep focus on the panel rather than letting it
        // escape to the page underneath.
        event.preventDefault();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      // Send the caret back where it came from, so closing a dialog does not
      // dump a keyboard user at the top of the document.
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        pressedOnOverlay.current = event.target === event.currentTarget;
      }}
      onMouseUp={(event) => {
        const shouldClose =
          pressedOnOverlay.current && event.target === event.currentTarget;
        pressedOnOverlay.current = false;
        if (shouldClose) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className={
          "modal" + (wide ? " wide" : "") + (tone === "danger" ? " danger" : "")
        }
      >
        <div className="modal-head">
          <h3 id={headingId}>{title}</h3>
          <button
            type="button"
            className="close-x"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
```

Note the removed `onMouseDown={(event) => event.stopPropagation()}` on the panel — it is no longer needed now that the overlay compares `event.target` to `event.currentTarget`, and leaving it would break the mouseup bookkeeping.

- [ ] **Step 2: Allow text selection inside the dialog to feel intentional**

In `src/app/globals.css`, in the `/* ---------- Modal ---------- */` section, add after the `.modal-overlay` rule:

```css
/* The overlay is a click target for dismissal; the panel is not. Without this,
   a drag that begins on the overlay paints a selection across the dialog. */
.modal-overlay {
  user-select: none;
}

.modal {
  user-select: text;
}
```

- [ ] **Step 3: Verify**

Run: `npm run verify`
Expected: PASS. `tests/api/contract.test.ts` and the rest are unaffected — this is a client component.

- [ ] **Step 4: Manually check the four behaviors**

Run `npm run dev`, sign in, open **User Management → Add user**, and confirm:
1. Tab from the last control (the Create button) returns to the first, and Shift+Tab from the first goes to the last.
2. Escape closes the dialog and focus returns to the "Add user" button.
3. Selecting text in a field and releasing the mouse outside the dialog does **not** close it.
4. Clicking the dark area outside the dialog still closes it.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Modal.tsx src/app/globals.css
git commit -m "Trap and restore focus in the modal; stop drag-select from closing it"
```

---

## Task 6: Card-style tables on mobile

**Files:**
- Modify: `src/app/globals.css` (append)
- Modify: `src/features/dashboard/DashboardClient.tsx:101, 113-146`

**Interfaces:**
- Consumes: nothing.
- Produces: the `.table-cards` class contract — put it on a `.table-wrap`, and give every `<td>` a `data-label` matching its column header.

- [ ] **Step 1: Add the styles**

Append to `src/app/globals.css`:

```css
/* ===========================================================================
   Card tables
   ---------------------------------------------------------------------------
   Opt in by adding `table-cards` to a `.table-wrap`. Below 700px each row
   becomes a card and each cell prints its column name from `data-label`, so a
   five-column table stops being a sideways scroll on a phone.

   Every <td> in a `.table-cards` table needs a `data-label`, except a cell
   whose meaning is obvious without one (an action row) which takes
   `class="cell-actions"`.
   ======================================================================== */
@media (max-width: 700px) {
  .table-wrap.table-cards {
    border: none;
    background: transparent;
    overflow-x: visible;
  }

  .table-cards table,
  .table-cards tbody,
  .table-cards tr,
  .table-cards td {
    display: block;
    width: 100%;
  }

  /* Kept in the accessibility tree — the headers still name the columns for a
     screen reader reading the table linearly. */
  .table-cards thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .table-cards tbody tr {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 12px;
    padding: 4px 0;
  }

  .table-cards tbody tr:hover {
    background: var(--surface);
  }

  .table-cards tbody td {
    border-bottom: none;
    padding: 9px 14px;
    display: grid;
    grid-template-columns: minmax(84px, 32%) 1fr;
    gap: 12px;
    align-items: center;
  }

  .table-cards tbody td::before {
    content: attr(data-label);
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .table-cards tbody td.cell-actions {
    display: block;
    border-top: 1px solid var(--border);
    margin-top: 4px;
    padding-top: 12px;
  }

  .table-cards tbody td.cell-actions::before {
    content: none;
  }

  .table-cards tbody td.cell-actions .btn-row {
    justify-content: flex-start;
  }

  /* The empty state spans every column, so it must not be laid out as a pair. */
  .table-cards tbody td.cell-empty {
    display: block;
  }

  .table-cards tbody td.cell-empty::before {
    content: none;
  }
}
```

- [ ] **Step 2: Apply it to the dashboard table**

In `src/features/dashboard/DashboardClient.tsx`, change the wrapper on line 101:

```tsx
          <div className="table-wrap table-cards">
```

and give each `<td>` in the `stats.recentUsers.map(...)` body a label:

```tsx
                    <td data-label="User">
```
```tsx
                    <td data-label="Role">
```
```tsx
                    <td data-label="Status">
```
```tsx
                    <td className="muted" data-label="Added">
```

- [ ] **Step 3: Verify**

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 4: Check it in a browser**

Run `npm run dev`, open the dashboard, and narrow the window below 700px. The Recently-added-users table should render as one card per user with "USER / ROLE / STATUS / ADDED" labels down the left, and the page must not scroll horizontally.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/features/dashboard/DashboardClient.tsx
git commit -m "Render tables as cards on narrow screens"
```

---

## Task 7: Migrate User Management

**Files:**
- Modify: `src/features/users/UsersClient.tsx` (whole file)

**Interfaces:**
- Consumes: `useFormErrors` from `@/features/forms/useFormErrors`, `Field` from `@/components/ui/Field`, `useToast` from `@/components/ui/ToastProvider`, the `.table-cards` contract from Task 6.
- Produces: nothing other tasks consume.

This is the reference migration. The three that follow copy its shape.

- [ ] **Step 1: Replace the imports and the flash state**

In `src/features/users/UsersClient.tsx`, add to the imports:

```tsx
import Field from "@/components/ui/Field";
import { useToast } from "@/components/ui/ToastProvider";
import { useFormErrors } from "@/features/forms/useFormErrors";
```

Delete the `const [flash, setFlash] = useState("");` line, and add below the `useErrorDialog()` line:

```tsx
  const { showToast } = useToast();
  const userForm = useFormErrors("user-form");
  const resetForm = useFormErrors("reset-form");
```

Two independent instances because the two dialogs are separate forms with separate ids.

- [ ] **Step 2: Rewrite `save()` to collect every error**

Replace the whole `save` function:

```tsx
  async function save() {
    if (!form) return;
    const isEdit = form.id !== null;

    const base = {
      full_name: form.full_name,
      email: form.email,
      mobile: form.mobile,
      photo_url: form.photo_url ?? "",
    };

    // Validated with the very same schema the server uses, and every failing
    // field is reported at once rather than one per submit.
    const parsed = isEdit
      ? userForm.validate(updateUserSchema, base)
      : userForm.validate(createUserSchema, {
          ...base,
          password: form.password,
          role_id: form.role_id,
        });

    if (!parsed) return;

    // role_id / status travel alongside, and are honoured only for super admins.
    const payload: Record<string, unknown> = { ...parsed };
    if (canManagePrivileges && isEdit) {
      payload.role_id = form.role_id === "" ? null : Number(form.role_id);
      if (form.id !== currentUserId) payload.status = form.status;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await apiJson(`/api/users/${form.id}`, "PUT", payload);
      } else {
        await apiJson("/api/users", "POST", payload);
      }
      setForm(null);
      userForm.reset();
      showToast(isEdit ? "User updated." : "User created.");
      await refresh();
    } catch (err) {
      // A failure from the server keeps the modal — a permission denial or a
      // duplicate email is not something a field outline can express.
      reportError(err, isEdit ? "Could not save user" : "Could not create user");
    } finally {
      setSaving(false);
    }
  }
```

- [ ] **Step 3: Rewrite `doReset()` and `doDelete()`**

```tsx
  async function doReset() {
    if (!resetFor) return;
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      resetForm.setFieldError(
        "password",
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
      return;
    }
    try {
      await apiJson(`/api/users/${resetFor.id}/reset-password`, "POST", {
        password: newPassword,
      });
      setResetFor(null);
      setNewPassword("");
      resetForm.reset();
      showToast("Password reset. That user's other sessions were signed out.");
    } catch (err) {
      reportError(err, "Could not reset password");
    }
  }

  async function doDelete() {
    if (!confirmDelete) return;
    try {
      await apiJson(`/api/users/${confirmDelete.id}`, "DELETE");
      setConfirmDelete(null);
      showToast("User deleted.");
      await refresh();
    } catch (err) {
      reportError(err, "Could not delete user");
    }
  }
```

`showError` is no longer used in this file — remove it from the `useErrorDialog()` destructure, leaving `const { reportError } = useErrorDialog();`.

- [ ] **Step 4: Delete the flash banner**

Remove this block from the JSX:

```tsx
      {flash && (
        <div className="alert success" role="status">
          {flash}
        </div>
      )}
```

- [ ] **Step 5: Convert the table to cards**

Change the wrapper:

```tsx
      <div className="table-wrap table-cards">
```

Give the empty-state cell its class:

```tsx
                  <td colSpan={5} className="cell-empty">
```

and label the five body cells:

```tsx
                  <td data-label="User">
```
```tsx
                  <td data-label="Contact">
```
```tsx
                  <td data-label="Role">
```
```tsx
                  <td data-label="Status">
```
```tsx
                  <td className="cell-actions">
```

- [ ] **Step 6: Convert the add/edit form fields**

Replace the five `div.field` / `label` / `input` groups inside the first `Modal` with `Field`. Full name:

```tsx
          <Field
            formId="user-form"
            name="full_name"
            label="Full name"
            required
            error={userForm.errors.full_name}
          >
            {(control) => (
              <input
                {...control}
                type="text"
                value={form.full_name}
                onChange={(event) => {
                  setForm({ ...form, full_name: event.target.value });
                  userForm.clearField("full_name");
                }}
                placeholder="Jane Dela Cruz"
              />
            )}
          </Field>
```

Email and mobile, inside the existing `div.form-grid`:

```tsx
            <Field
              formId="user-form"
              name="email"
              label="Email"
              error={userForm.errors.email}
            >
              {(control) => (
                <input
                  {...control}
                  type="email"
                  value={form.email}
                  onChange={(event) => {
                    setForm({ ...form, email: event.target.value });
                    userForm.clearField("email");
                  }}
                  placeholder="jane@email.com"
                />
              )}
            </Field>
            <Field
              formId="user-form"
              name="mobile"
              label="Mobile number"
              error={userForm.errors.mobile}
            >
              {(control) => (
                <input
                  {...control}
                  type="tel"
                  value={form.mobile}
                  onChange={(event) => {
                    setForm({ ...form, mobile: event.target.value });
                    userForm.clearField("mobile");
                  }}
                  placeholder="09XXXXXXXXX"
                />
              )}
            </Field>
```

Role group and status, in the `canManagePrivileges` branch:

```tsx
              <Field
                formId="user-form"
                name="role_id"
                label="Role group"
                error={userForm.errors.role_id}
              >
                {(control) => (
                  <select
                    {...control}
                    value={form.role_id}
                    onChange={(event) => {
                      setForm({ ...form, role_id: event.target.value });
                      userForm.clearField("role_id");
                    }}
                  >
                    <option value="">— No role —</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field
                formId="user-form"
                name="status"
                label="Status"
                error={userForm.errors.status}
                hint={
                  form.id === currentUserId
                    ? "You cannot change your own role or status."
                    : undefined
                }
              >
                {(control) => (
                  <select
                    {...control}
                    value={form.status}
                    disabled={form.id === currentUserId}
                    onChange={(event) =>
                      setForm({ ...form, status: event.target.value as UserStatus })
                    }
                  >
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                )}
              </Field>
```

Password, in the `{!form.id && ...}` branch:

```tsx
            <Field
              formId="user-form"
              name="password"
              label="Password"
              required
              error={userForm.errors.password}
              hint="The user signs in with their email or mobile plus this password."
            >
              {(control) => (
                <input
                  {...control}
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => {
                    setForm({ ...form, password: event.target.value });
                    userForm.clearField("password");
                  }}
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                />
              )}
            </Field>
```

Leave the "Profile photo" block as a plain `div.field` — `PhotoUploader` is not a labelled control and has no validation state.

- [ ] **Step 7: Convert the reset-password field**

In the second `Modal`:

```tsx
          <Field
            formId="reset-form"
            name="password"
            label="New password"
            error={resetForm.errors.password}
            hint="Share this securely. All of that user's existing sessions are signed out, and they can change it from their profile."
          >
            {(control) => (
              <input
                {...control}
                type="text"
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                  resetForm.clearField("password");
                }}
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              />
            )}
          </Field>
```

Also clear its state when the dialog closes — change both `onClose={() => setResetFor(null)}` and the Cancel button's handler to:

```tsx
onClose={() => { setResetFor(null); resetForm.reset(); }}
```

and likewise reset `userForm` in the first modal's `onClose` and Cancel handler:

```tsx
onClose={() => { setForm(null); userForm.reset(); }}
```

- [ ] **Step 8: Verify**

Run: `npm run verify`
Expected: PASS. `tests/api/rbac.test.ts` must be untouched and green — none of this changes what the API accepts.

- [ ] **Step 9: Check the behavior by hand**

Run `npm run dev`, go to User Management → Add user, and confirm:
1. Submitting an empty form shows messages under **Full name**, **Email** and **Password** simultaneously, and Full name has focus.
2. Typing into Full name clears only its message.
3. A successful create shows a toast that disappears on its own after ~5 seconds, and stays while hovered.
4. Creating a user with an email that already exists still opens the **error modal** (a server conflict, not field validation).
5. Below 700px the user list renders as cards.

- [ ] **Step 10: Commit**

```bash
git add src/features/users/UsersClient.tsx
git commit -m "Migrate User Management to inline validation, toasts and card tables"
```

---

## Task 8: Checkpoint — review the primitives against the remaining screens

**Files:** none changed unless the review finds a problem.

This task exists because the screens were migrated one at a time starting with the most complex. Users has three dialogs and privilege-gated fields; Login has two inputs. An API shaped only around Users may not fit the others. This is the one point where changing `useFormErrors` or `Field` is cheap — after Task 11, four screens depend on them.

- [ ] **Step 1: Read the three remaining screens against the new API**

Read `src/features/roles/RolesClient.tsx`, `src/features/profile/ProfileClient.tsx` and `src/features/auth/LoginForm.tsx`, and answer in writing:

1. **Roles** — the module checkboxes are a `label.check-item` group, not a single labelled control. Can `Field` wrap them, or should that block stay as a plain `div.field`? (Expected answer: stay plain. `Field` labels one control via `htmlFor`; a checkbox grid has no single control to point at.)
2. **Profile** — it has two logically separate forms (details, password) inside one `<form>`. Does one `useFormErrors("profile-form")` cover both, or does it need two instances? (Expected answer: one — the ids stay unique because the field names differ.)
3. **Profile** — the confirm-password rule is not in the Zod schema. Does `setFieldError("confirm", …)` followed by a `validate()` call preserve the manual error, or does `validate` clear it? Read `useFormErrors.validate`: on success it calls `setErrors({})`, which **wipes** a manually set error. Confirm the order of operations in Task 10 avoids this.
4. **Login** — the two fields are `identifier` and `password`, and `loginSchema` uses those exact keys. Confirm the schema's paths match the field names, since `Field name=` and the Zod path must agree.

- [ ] **Step 2: Fix anything the review turned up**

If any answer requires an API change, make it now, in `src/features/forms/useFormErrors.ts` or `src/components/ui/Field.tsx`, and update Task 7's Users screen to match. Add a unit test if the change is to pure logic.

If nothing needs changing, record that and move on — a checkpoint that finds nothing has still done its job.

- [ ] **Step 3: Verify and commit if anything changed**

Run: `npm run verify`
Expected: PASS.

```bash
# Only if step 2 changed something:
git add -A src/features/forms src/components/ui src/features/users
git commit -m "Adjust the form primitives for the remaining screens"
```

---

## Task 9: Migrate Role Management

**Files:**
- Modify: `src/features/roles/RolesClient.tsx`

**Interfaces:**
- Consumes: `useFormErrors`, `Field`, `useToast`.
- Produces: nothing.

`RolesClient` renders a `grid cols-2` of cards, not a table, and that grid already collapses to one column below 960px — so there is no `.table-cards` work here.

- [ ] **Step 1: Add the imports and state**

Add to the imports:

```tsx
import Field from "@/components/ui/Field";
import { useToast } from "@/components/ui/ToastProvider";
import { useFormErrors } from "@/features/forms/useFormErrors";
```

Delete `const [flash, setFlash] = useState("");`, change the dialog destructure to `const { reportError } = useErrorDialog();`, and add:

```tsx
  const { showToast } = useToast();
  const roleForm = useFormErrors("role-form");
```

- [ ] **Step 2: Rewrite `save()` and `doDelete()`**

```tsx
  async function save() {
    if (!form) return;
    const isEdit = form.id !== null;

    const parsed = roleForm.validate(roleInputSchema, {
      name: form.name,
      description: form.description,
      modules: form.modules,
    });
    if (!parsed) return;

    setSaving(true);
    try {
      if (isEdit) {
        await apiJson(`/api/roles/${form.id}`, "PUT", parsed);
      } else {
        await apiJson("/api/roles", "POST", parsed);
      }
      setForm(null);
      roleForm.reset();
      showToast(isEdit ? "Group updated." : "Group created.");
      await refresh();
    } catch (err) {
      reportError(err, "Could not save group");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await apiJson(`/api/roles/${confirmDelete.id}`, "DELETE");
      setConfirmDelete(null);
      showToast("Group deleted.");
      await refresh();
    } catch (err) {
      reportError(err, "Could not delete group");
    } finally {
      setDeleting(false);
    }
  }
```

Add the new state beside `saving`:

```tsx
  const [deleting, setDeleting] = useState(false);
```

and disable the delete button while it runs, so it cannot be double-fired:

```tsx
              <button
                type="button"
                className="btn danger"
                onClick={doDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete group"}
              </button>
```

- [ ] **Step 3: Delete the flash banner**

Remove:

```tsx
      {flash && (
        <div className="alert success" role="status">
          {flash}
        </div>
      )}
```

- [ ] **Step 4: Convert the two text fields**

```tsx
          <Field
            formId="role-form"
            name="name"
            label="Group name"
            required
            error={roleForm.errors.name}
          >
            {(control) => (
              <input
                {...control}
                type="text"
                value={form.name}
                onChange={(event) => {
                  setForm({ ...form, name: event.target.value });
                  roleForm.clearField("name");
                }}
                placeholder="e.g. Support Team"
              />
            )}
          </Field>
          <Field
            formId="role-form"
            name="description"
            label="Description"
            error={roleForm.errors.description}
          >
            {(control) => (
              <input
                {...control}
                type="text"
                value={form.description}
                onChange={(event) => {
                  setForm({ ...form, description: event.target.value });
                  roleForm.clearField("description");
                }}
                placeholder="What can this group do?"
              />
            )}
          </Field>
```

Leave the **Modules** block as a plain `div.field` with its existing `<label>Modules</label>` — it is a checkbox grid, not one labelled control, so `Field`'s `htmlFor` has nothing to point at. If `roleInputSchema` can reject `modules`, surface it below the grid:

```tsx
                {roleForm.errors.modules && (
                  <div className="field-error">{roleForm.errors.modules}</div>
                )}
```

- [ ] **Step 5: Reset on close**

Change the form modal's `onClose` and its Cancel handler to:

```tsx
onClose={() => { setForm(null); roleForm.reset(); }}
```

- [ ] **Step 6: Verify, check by hand, commit**

Run: `npm run verify`
Expected: PASS.

Run `npm run dev`, go to Role Management → Create group, submit it empty, and confirm the message appears under **Group name** with that field focused. Save a valid group and confirm the toast.

```bash
git add src/features/roles/RolesClient.tsx
git commit -m "Migrate Role Management to inline validation and toasts"
```

---

## Task 10: Migrate Profile Management

**Files:**
- Modify: `src/features/profile/ProfileClient.tsx`

**Interfaces:**
- Consumes: `useFormErrors`, `Field`, `useToast`.
- Produces: nothing.

**The one non-obvious part:** the new-password/confirm match is checked in the component, not in `updateProfileSchema`. `validate()` calls `setErrors({})` on success, which would wipe a manually set error — so the confirm check must run **after** `validate()` succeeds, not before.

- [ ] **Step 1: Add the imports and state**

```tsx
import Field from "@/components/ui/Field";
import { useToast } from "@/components/ui/ToastProvider";
import { useFormErrors } from "@/features/forms/useFormErrors";
```

Delete `const [flash, setFlash] = useState("");`, change the destructure to `const { reportError } = useErrorDialog();`, and add:

```tsx
  const { showToast } = useToast();
  const profileForm = useFormErrors("profile-form");
```

- [ ] **Step 2: Rewrite `save()`**

```tsx
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const wantsPasswordChange = Boolean(
      passwords.new_password || passwords.current_password,
    );

    const parsed = profileForm.validate(updateProfileSchema, {
      full_name: form.full_name,
      email: form.email,
      mobile: form.mobile,
      photo_url: form.photo_url ?? "",
      ...(wantsPasswordChange
        ? {
            current_password: passwords.current_password,
            new_password: passwords.new_password,
          }
        : {}),
    });

    if (!parsed) return;

    // Checked after validate(), not before: validate() clears the error map on
    // success, which would wipe a confirmation error set ahead of it. This rule
    // is not in updateProfileSchema because the server never receives `confirm`.
    if (wantsPasswordChange && passwords.new_password !== passwords.confirm) {
      profileForm.setFieldError(
        "confirm",
        "The new password and its confirmation do not match.",
      );
      return;
    }

    setSaving(true);
    try {
      await apiJson("/api/profile", "PUT", parsed);
      setPasswords({ current_password: "", new_password: "", confirm: "" });
      profileForm.reset();
      showToast(
        wantsPasswordChange
          ? "Profile saved. Your other sessions were signed out."
          : "Profile saved.",
      );
      // Refresh so the sidebar picks up the new name and photo.
      router.refresh();
    } catch (err) {
      reportError(err, "Could not save profile");
    } finally {
      setSaving(false);
    }
  }
```

- [ ] **Step 3: Delete the flash banner**

Remove the `{flash && (...)}` block.

- [ ] **Step 4: Convert the six fields**

Basic information:

```tsx
            <Field
              formId="profile-form"
              name="full_name"
              label="Full name"
              required
              error={profileForm.errors.full_name}
            >
              {(control) => (
                <input
                  {...control}
                  type="text"
                  value={form.full_name}
                  onChange={(event) => {
                    setForm({ ...form, full_name: event.target.value });
                    profileForm.clearField("full_name");
                  }}
                />
              )}
            </Field>
            <Field
              formId="profile-form"
              name="email"
              label="Email"
              error={profileForm.errors.email}
            >
              {(control) => (
                <input
                  {...control}
                  type="email"
                  value={form.email}
                  onChange={(event) => {
                    setForm({ ...form, email: event.target.value });
                    profileForm.clearField("email");
                  }}
                />
              )}
            </Field>
            <Field
              formId="profile-form"
              name="mobile"
              label="Mobile number"
              error={profileForm.errors.mobile}
            >
              {(control) => (
                <input
                  {...control}
                  type="tel"
                  value={form.mobile}
                  onChange={(event) => {
                    setForm({ ...form, mobile: event.target.value });
                    profileForm.clearField("mobile");
                  }}
                />
              )}
            </Field>
```

Change password:

```tsx
            <Field
              formId="profile-form"
              name="current_password"
              label="Current password"
              error={profileForm.errors.current_password}
            >
              {(control) => (
                <input
                  {...control}
                  type="password"
                  autoComplete="current-password"
                  value={passwords.current_password}
                  onChange={(event) => {
                    setPasswords({ ...passwords, current_password: event.target.value });
                    profileForm.clearField("current_password");
                  }}
                  placeholder="Leave blank to keep current"
                />
              )}
            </Field>
            <Field
              formId="profile-form"
              name="new_password"
              label="New password"
              error={profileForm.errors.new_password}
            >
              {(control) => (
                <input
                  {...control}
                  type="password"
                  autoComplete="new-password"
                  value={passwords.new_password}
                  onChange={(event) => {
                    setPasswords({ ...passwords, new_password: event.target.value });
                    profileForm.clearField("new_password");
                  }}
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                />
              )}
            </Field>
            <Field
              formId="profile-form"
              name="confirm"
              label="Confirm new password"
              error={profileForm.errors.confirm}
              hint="Only fill these in to change your password. Doing so signs out your other browsers."
            >
              {(control) => (
                <input
                  {...control}
                  type="password"
                  autoComplete="new-password"
                  value={passwords.confirm}
                  onChange={(event) => {
                    setPasswords({ ...passwords, confirm: event.target.value });
                    profileForm.clearField("confirm");
                  }}
                />
              )}
            </Field>
```

The standalone `<div className="hint">Only fill these in…</div>` after the third password input is now the `hint` on the confirm field — delete the loose one.

- [ ] **Step 5: Verify, check by hand, commit**

Run: `npm run verify`
Expected: PASS.

Run `npm run dev`, open Profile Management, and confirm:
1. Clearing Full name and saving shows its message with the field focused.
2. Entering a new password with a mismatched confirmation shows the message under **Confirm new password**, and that field takes focus.
3. Saving successfully shows a toast.

```bash
git add src/features/profile/ProfileClient.tsx
git commit -m "Migrate Profile Management to inline validation and toasts"
```

---

## Task 11: Migrate the login form

**Files:**
- Modify: `src/features/auth/LoginForm.tsx`

**Interfaces:**
- Consumes: `useFormErrors`, `Field`.
- Produces: nothing.

No toast here — a successful sign-in navigates away, so there is nothing left to show it on.

- [ ] **Step 1: Rewrite the component**

Replace the contents of `src/features/auth/LoginForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Field from "@/components/ui/Field";
import { useErrorDialog } from "@/components/ui/ErrorDialogProvider";
import { useFormErrors } from "@/features/forms/useFormErrors";
import { apiJson } from "@/lib/api-client";
import { loginSchema } from "./schema";

export function LoginForm() {
  const router = useRouter();
  const { reportError } = useErrorDialog();
  const { errors, validate, clearField } = useFormErrors("login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Same schema the API uses, so the messages match on both sides.
    const parsed = validate(loginSchema, { identifier, password });
    if (!parsed) return;

    setLoading(true);
    try {
      await apiJson("/api/auth/login", "POST", parsed);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      // Rejected credentials are a server decision, not a field problem, and
      // the message is deliberately generic — it must not say which half was
      // wrong. It belongs in the modal.
      reportError(err, "Sign in failed");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Field
        formId="login"
        name="identifier"
        label="Email or mobile number"
        error={errors.identifier}
      >
        {(control) => (
          <input
            {...control}
            type="text"
            autoComplete="username"
            value={identifier}
            onChange={(event) => {
              setIdentifier(event.target.value);
              clearField("identifier");
            }}
          />
        )}
      </Field>
      <Field
        formId="login"
        name="password"
        label="Password"
        error={errors.password}
      >
        {(control) => (
          <input
            {...control}
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              clearField("password");
            }}
          />
        )}
      </Field>
      <button
        type="submit"
        className="btn primary"
        disabled={loading}
        style={{ width: "100%", justifyContent: "center", marginTop: 4 }}
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
```

`noValidate` and the dropped `required` attributes are deliberate: the browser's own bubble would pre-empt our validation and show only the first field, which is the behavior this whole plan exists to remove.

- [ ] **Step 2: Verify**

Run: `npm run verify`
Expected: PASS. `tests/api/auth.test.ts` drives HTTP directly and is unaffected.

- [ ] **Step 3: Check by hand**

Run `npm run dev`, open `/login`, submit it empty, and confirm both fields show messages at once with the identifier focused. Then sign in with a wrong password and confirm the **modal** still appears.

- [ ] **Step 4: Commit**

```bash
git add src/features/auth/LoginForm.tsx
git commit -m "Migrate the login form to inline validation"
```

---

## Task 12: Navigation pending feedback

**Files:**
- Modify: `src/components/AppShell.tsx`
- Modify: `src/app/globals.css` (append)

**Interfaces:**
- Consumes: `useLinkStatus` from `next/link` — signature `() => { pending: boolean }`, verified present in Next 16.3.0.
- Produces: nothing.

`useLinkStatus` only works inside a `<Link>` subtree, so the indicator has to be its own component rendered as a child of the link.

- [ ] **Step 1: Add the indicator component**

In `src/components/AppShell.tsx`, change the Link import:

```tsx
import Link, { useLinkStatus } from "next/link";
```

and add above `export default function AppShell`:

```tsx
/**
 * Pending dot for the link being navigated to. `useLinkStatus` reads the
 * transition of its nearest ancestor Link, so this must be rendered inside one.
 */
function NavPending() {
  const { pending } = useLinkStatus();
  return pending ? <span className="nav-pending" aria-hidden="true" /> : null;
}
```

- [ ] **Step 2: Render it inside each nav link**

Replace the `<Link>` body:

```tsx
                <span className="nav-ico" aria-hidden="true">
                  {m.icon}
                </span>
                <span className="nav-label">{m.label}</span>
                <NavPending />
```

- [ ] **Step 3: Add the styles**

Append to `src/app/globals.css`:

```css
.nav-label {
  flex: 1;
  min-width: 0;
}

/* Marks the link being navigated to, so a slow server render is not silence. */
.nav-pending {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 2px solid var(--border);
  border-top-color: var(--primary);
  animation: nav-spin 0.6s linear infinite;
}

@keyframes nav-spin {
  to {
    transform: rotate(360deg);
  }
}
```

The existing `prefers-reduced-motion` block already caps the animation duration.

- [ ] **Step 4: Verify, check by hand, commit**

Run: `npm run verify`
Expected: PASS.

Run `npm run dev`, throttle the network in devtools, and click between Dashboard and User Management — a spinner should appear on the link being navigated to and disappear when the page renders.

```bash
git add src/components/AppShell.tsx src/app/globals.css
git commit -m "Show pending feedback on the sidebar link being navigated to"
```

---

## Task 13: Playwright harness

**Files:**
- Create: `tests/support/server.ts`
- Create: `playwright.config.ts`
- Create: `tests/e2e/global-setup.ts`, `tests/e2e/global-teardown.ts`
- Create: `tests/e2e/support/actions.ts`
- Modify: `tests/api/setup/globalSetup.ts` (delegate)
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces from `tests/support/server.ts`: `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`, `loadDotEnv(): void`, `startTestServer(options: { port: number; uploadDirName: string }): Promise<string>` (resolves the base URL), `stopTestServer(): Promise<void>`.
- Produces from `tests/e2e/support/actions.ts`: `signIn(page: Page): Promise<void>`.

**The hazard to respect:** both harnesses `DROP TABLE admin_users, roles`. They must never run at once. Ports differ (3311 vs 3312) so the servers cannot collide, but the database still can — hence `E2E_DATABASE_URL` and a strictly sequential `verify`.

- [ ] **Step 1: Install Playwright**

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Extract the shared server harness**

Create `tests/support/server.ts` by moving the body of `tests/api/setup/globalSetup.ts` into a parameterized form:

```ts
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

// Shared by both integration harnesses: the vitest API suite and the Playwright
// E2E suite. Deliberately end-to-end — these suites exist to exercise the real
// request pipeline, and mocking it would mean testing the mocks.
//
// DESTRUCTIVE. `startTestServer` drops `admin_users` and `roles` from whatever
// DATABASE_URL names, so the two suites must never run concurrently against the
// same database. `npm run verify` runs them in sequence for this reason.

/** Fixed credentials for the seeded super admin used by both suites. */
export const TEST_ADMIN_EMAIL = "test-admin@example.test";
export const TEST_ADMIN_PASSWORD = "TestAdminPassword123";

let server: ChildProcess | undefined;

export function loadDotEnv(): void {
  const envPath = path.join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function waitForServer(baseUrl: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/login`);
      if (res.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server did not become ready at ${baseUrl} within ${timeoutMs}ms`);
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit", shell: false });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)),
    );
    child.on("error", reject);
  });
}

export type StartOptions = {
  port: number;
  /** Directory under ./data for this suite's uploads, so the two never share. */
  uploadDirName: string;
  /** Defaults to DATABASE_URL. The E2E suite may point elsewhere. */
  databaseUrl?: string;
};

/** Resets the database, seeds the admin, boots `next start`, returns the base URL. */
export async function startTestServer(options: StartOptions): Promise<string> {
  loadDotEnv();

  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set. The integration tests need a real PostgreSQL database.\n" +
        "  See the 'Testing' section of the README for a one-line Docker command.",
    );
  }
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
    throw new Error("AUTH_SECRET must be set (32+ characters) to run the integration tests.");
  }

  const uploadDir = path.join(process.cwd(), "data", options.uploadDirName);
  rmSync(uploadDir, { recursive: true, force: true });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: databaseUrl,
    UPLOAD_DIR: uploadDir,
    SEED_ADMIN_EMAIL: TEST_ADMIN_EMAIL,
    SEED_ADMIN_PASSWORD: TEST_ADMIN_PASSWORD,
  };

  // Start from a known state: drop the admin tables so the seed is
  // deterministic and a previous run cannot influence this one.
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP TABLE IF EXISTS admin_users CASCADE");
    await pool.query("DROP TABLE IF EXISTS roles CASCADE");
  } finally {
    await pool.end();
  }

  await run("npm", ["run", "init-db"], env);

  if (!existsSync(path.join(process.cwd(), ".next"))) {
    throw new Error(
      "No production build found. Run `npm run build` before the integration tests.",
    );
  }

  server = spawn(
    "npx",
    ["next", "start", "-p", String(options.port), "-H", "127.0.0.1"],
    { env, stdio: "ignore", shell: false, detached: false },
  );
  server.on("error", (err) => {
    throw err;
  });

  const baseUrl = `http://127.0.0.1:${options.port}`;
  await waitForServer(baseUrl);
  return baseUrl;
}

export async function stopTestServer(uploadDirName: string): Promise<void> {
  if (server && !server.killed) {
    server.kill("SIGTERM");
    // Give it a moment to release the port before the next run.
    await new Promise((r) => setTimeout(r, 500));
    if (!server.killed) server.kill("SIGKILL");
  }
  server = undefined;
  rmSync(path.join(process.cwd(), "data", uploadDirName), {
    recursive: true,
    force: true,
  });
}
```

- [ ] **Step 3: Reduce the vitest global setup to a caller**

Replace the contents of `tests/api/setup/globalSetup.ts`:

```ts
import {
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASSWORD,
  startTestServer,
  stopTestServer,
} from "../../support/server";

// The API suite's slice of the shared harness. See tests/support/server.ts —
// this is DESTRUCTIVE to the database DATABASE_URL names.

const PORT = Number(process.env.TEST_PORT ?? 3311);
const UPLOAD_DIR_NAME = "test-uploads";

export { TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD };

export async function setup(): Promise<void> {
  process.env.TEST_BASE_URL = await startTestServer({
    port: PORT,
    uploadDirName: UPLOAD_DIR_NAME,
  });
}

export async function teardown(): Promise<void> {
  await stopTestServer(UPLOAD_DIR_NAME);
}
```

- [ ] **Step 4: Confirm the API suite still passes after the extraction**

Run: `npm run build && npm run test:api`
Expected: PASS, all 135 tests. This is the gate on the refactor — if anything imported `TEST_ADMIN_EMAIL` from the old path, it still resolves because the re-export above preserves it.

- [ ] **Step 5: Add the Playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3312);

// Runs against a real `next start` server and a real database, like the API
// suite — but through a browser, which is the only way to prove focus
// management, drawer behavior and the no-flash theme script actually work.
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  // One worker, one server, one database — the same reason the API suite sets
  // fileParallelism: false.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

- [ ] **Step 6: Add the E2E lifecycle files**

Create `tests/e2e/global-setup.ts`:

```ts
import { startTestServer } from "../support/server";

export const E2E_UPLOAD_DIR_NAME = "e2e-uploads";

export default async function globalSetup(): Promise<void> {
  await startTestServer({
    port: Number(process.env.E2E_PORT ?? 3312),
    uploadDirName: E2E_UPLOAD_DIR_NAME,
    // Point at a separate database when one is configured, so this suite and
    // the API suite cannot destroy each other's tables.
    databaseUrl: process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL,
  });
}
```

Create `tests/e2e/global-teardown.ts`:

```ts
import { stopTestServer } from "../support/server";
import { E2E_UPLOAD_DIR_NAME } from "./global-setup";

export default async function globalTeardown(): Promise<void> {
  await stopTestServer(E2E_UPLOAD_DIR_NAME);
}
```

- [ ] **Step 7: Add the sign-in helper**

Create `tests/e2e/support/actions.ts`:

```ts
import { expect, type Page } from "@playwright/test";
import { TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD } from "../../support/server";

export { TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD };

/** Signs in as the seeded super admin and waits for the dashboard to render. */
export async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#login-identifier").fill(TEST_ADMIN_EMAIL);
  await page.locator("#login-password").fill(TEST_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}
```

The `#login-identifier` / `#login-password` ids come from `Field`'s `fieldElementId("login", …)` convention established in Task 4.

- [ ] **Step 8: Wire up the scripts**

In `package.json`, add to `scripts`:

```jsonc
    "test:e2e": "playwright test",
```

and replace `test:all` and `verify`:

```jsonc
    "test:all": "npm run test && npm run build && npm run test:api && npm run test:e2e",
    "verify": "npm run typecheck && npm run lint && npm run test && npm run build && npm run test:api && npm run test:e2e",
```

In `.gitignore`, add:

```
/test-results
/playwright-report
/data
```

- [ ] **Step 9: Confirm the harness boots**

Create a throwaway check — run `npx playwright test --list`. Expected: it loads the config and reports "Total: 0 tests" without an error. Then delete nothing; the specs arrive in Task 14.

- [ ] **Step 10: Commit**

```bash
git add tests/support/server.ts tests/api/setup/globalSetup.ts tests/e2e playwright.config.ts package.json package-lock.json .gitignore
git commit -m "Add a Playwright harness sharing the API suite's server boot"
```

---

## Task 14: E2E specs — auth, validation, modal

**Files:**
- Create: `tests/e2e/auth.spec.ts`, `tests/e2e/validation.spec.ts`, `tests/e2e/modal.spec.ts`

**Interfaces:**
- Consumes: `signIn`, `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD` from `./support/actions`.

- [ ] **Step 1: Write the auth spec**

Create `tests/e2e/auth.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, signIn } from "./support/actions";

test.describe("sign in", () => {
  test("rejects a wrong password in the error modal", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#login-identifier").fill(TEST_ADMIN_EMAIL);
    await page.locator("#login-password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Sign in failed");
    await expect(page).toHaveURL(/\/login/);
  });

  test("signs a valid admin in to the dashboard", async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("sends a signed-out browser to the login page", async ({ page }) => {
    await page.goto("/users");
    await expect(page).toHaveURL(/\/login/);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm run build && npx playwright test auth.spec.ts`
Expected: PASS, 3 tests.

- [ ] **Step 3: Write the validation spec**

Create `tests/e2e/validation.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { signIn } from "./support/actions";

test.describe("inline validation", () => {
  test("shows every failing field at once and focuses the first", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Both messages, from one submit — the behavior this whole change exists for.
    await expect(page.locator("#login-identifier-error")).toBeVisible();
    await expect(page.locator("#login-password-error")).toBeVisible();
    await expect(page.locator("#login-identifier")).toBeFocused();
    await expect(page.locator("#login-identifier")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  test("clears a field's message as it is corrected", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("#login-identifier-error")).toBeVisible();

    await page.locator("#login-identifier").fill("someone@example.test");
    await expect(page.locator("#login-identifier-error")).toHaveCount(0);
    // The untouched field keeps its message.
    await expect(page.locator("#login-password-error")).toBeVisible();
  });

  test("reports several bad fields in the add-user dialog", async ({ page }) => {
    await signIn(page);
    await page.goto("/users");
    await page.getByRole("button", { name: "Add user" }).click();

    await page.locator("#user-form-email").fill("not-an-email");
    await page.getByRole("button", { name: "Create user" }).click();

    await expect(page.locator("#user-form-full_name-error")).toBeVisible();
    await expect(page.locator("#user-form-email-error")).toHaveText(
      "Enter a valid email address.",
    );
    await expect(page.locator("#user-form-password-error")).toBeVisible();
    // Full name precedes email in the DOM, so it takes focus even though the
    // schema may report a different order.
    await expect(page.locator("#user-form-full_name")).toBeFocused();
  });

  test("keeps server-side failures in the modal", async ({ page }) => {
    await signIn(page);
    await page.goto("/users");
    await page.getByRole("button", { name: "Add user" }).click();

    // A duplicate email passes client validation and is rejected by Postgres,
    // so it must surface as a modal, not as a field message.
    await page.locator("#user-form-full_name").fill("Duplicate Admin");
    await page.locator("#user-form-email").fill("test-admin@example.test");
    await page.locator("#user-form-password").fill("AValidPassword123");
    await page.getByRole("button", { name: "Create user" }).click();

    const dialog = page.getByRole("dialog", { name: "Could not create user" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("already in use");
  });
});
```

- [ ] **Step 4: Run it**

Run: `npx playwright test validation.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the modal spec**

Create `tests/e2e/modal.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { signIn } from "./support/actions";

test.describe("modal focus management", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto("/users");
  });

  test("keeps Tab inside the dialog", async ({ page }) => {
    await page.getByRole("button", { name: "Add user" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Tab far enough to have escaped an untrapped dialog several times over.
    for (let i = 0; i < 25; i += 1) await page.keyboard.press("Tab");

    const focusIsInsideDialog = await page.evaluate(() => {
      const panel = document.querySelector('[role="dialog"]');
      return Boolean(panel && document.activeElement && panel.contains(document.activeElement));
    });
    expect(focusIsInsideDialog).toBe(true);
  });

  test("closes on Escape and returns focus to the trigger", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Add user" });
    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("closes on a click on the overlay", async ({ page }) => {
    await page.getByRole("button", { name: "Add user" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Top-left of the viewport is overlay, never panel — the panel is centred.
    await page.mouse.click(5, 5);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("does not close when a text selection is dragged out of it", async ({ page }) => {
    await page.getByRole("button", { name: "Add user" }).click();
    const nameInput = page.locator("#user-form-full_name");
    await nameInput.fill("Jane Dela Cruz");

    const box = await nameInput.boundingBox();
    if (!box) throw new Error("expected the name input to be laid out");

    // Press inside the field, drag out past the panel, release on the overlay.
    await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(5, 5, { steps: 12 });
    await page.mouse.up();

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(nameInput).toHaveValue("Jane Dela Cruz");
  });

  test("labels the dialog with its own heading", async ({ page }) => {
    await page.getByRole("button", { name: "Add user" }).click();
    await expect(page.getByRole("dialog", { name: "Add user" })).toBeVisible();
  });
});
```

- [ ] **Step 6: Run it**

Run: `npx playwright test modal.spec.ts`
Expected: PASS, 5 tests. If "does not close when a text selection is dragged out" fails, re-check that the panel's `onMouseDown={stopPropagation}` was removed in Task 5 — leaving it breaks the mouseup bookkeeping.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/auth.spec.ts tests/e2e/validation.spec.ts tests/e2e/modal.spec.ts
git commit -m "Add E2E coverage for sign-in, inline validation and modal focus"
```

---

## Task 15: E2E specs — toast, mobile, theme

**Files:**
- Create: `tests/e2e/toast.spec.ts`, `tests/e2e/mobile.spec.ts`, `tests/e2e/theme.spec.ts`

- [ ] **Step 1: Write the toast spec**

Create `tests/e2e/toast.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { signIn } from "./support/actions";

// Uses Playwright's clock control rather than a real five-second wait, so the
// auto-dismiss assertion costs milliseconds instead of becoming the slowest
// test in the suite.
test.describe("toasts", () => {
  test("appears on a successful save and dismisses itself", async ({ page }) => {
    await page.clock.install();
    await signIn(page);
    await page.goto("/roles");

    await page.getByRole("button", { name: "Create group" }).click();
    await page.locator("#role-form-name").fill("Toast Test Group");
    await page.getByRole("button", { name: "Create group" }).last().click();

    const toast = page.getByTestId("toast");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText("Group created.");

    await page.clock.fastForward(6_000);
    await expect(toast).toHaveCount(0);
  });

  test("can be dismissed by hand", async ({ page }) => {
    await signIn(page);
    await page.goto("/roles");

    await page.getByRole("button", { name: "Create group" }).click();
    await page.locator("#role-form-name").fill("Manual Dismiss Group");
    await page.getByRole("button", { name: "Create group" }).last().click();

    const toast = page.getByTestId("toast");
    await expect(toast).toBeVisible();
    await page.getByRole("button", { name: "Dismiss notification" }).click();
    await expect(toast).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test toast.spec.ts`
Expected: PASS, 2 tests.

- [ ] **Step 3: Write the mobile spec**

Create `tests/e2e/mobile.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { signIn } from "./support/actions";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("phone layout", () => {
  test("opens and closes the navigation drawer", async ({ page }) => {
    await signIn(page);

    const toggle = page.getByRole("button", { name: "Open navigation" });
    await expect(toggle).toBeVisible();

    const sidebar = page.locator("#app-sidebar");
    // Off-canvas: present in the DOM, translated out of view.
    await expect(sidebar).not.toBeInViewport();

    await toggle.click();
    await expect(sidebar).toBeInViewport();

    await page.getByRole("link", { name: "User Management" }).click();
    await expect(page).toHaveURL(/\/users/);
    await expect(sidebar).not.toBeInViewport();
  });

  test("renders the user table as cards without sideways scroll", async ({ page }) => {
    await signIn(page);
    await page.goto("/users");

    // thead is visually hidden in card mode; the cells carry their own labels.
    const firstCell = page.locator(".table-cards tbody td").first();
    await expect(firstCell).toHaveAttribute("data-label", "User");

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });
});
```

- [ ] **Step 4: Run it**

Run: `npx playwright test mobile.spec.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write the theme spec**

Create `tests/e2e/theme.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { signIn } from "./support/actions";

// The inline script in src/app/layout.tsx applies the stored theme before first
// paint and must carry the CSP nonce. If the nonce is ever dropped, the CSP
// blocks the script and the attribute below is simply absent after a reload —
// which is what makes this assertion a real regression test for the no-flash
// behavior, not merely a toggle test.
// The toggle renders role="radio" inside a role="radiogroup", not buttons, and
// its accessible name comes from aria-label — so the compact topbar variant,
// which hides the text, is still selectable by name.
test.describe("theme", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("keeps an explicit dark choice across a reload", async ({ page }) => {
    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    const background = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(background).toBe("rgb(15, 17, 21)");
  });

  test("keeps an explicit light choice across a reload", async ({ page }) => {
    await page.getByRole("radio", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("stores no attribute for system, leaving the OS in charge", async ({ page }) => {
    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.getByRole("radio", { name: "System" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);

    await page.reload();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);
  });

  test("follows the OS setting when set to system", async ({ page }) => {
    await page.getByRole("radio", { name: "System" }).click();

    await page.emulateMedia({ colorScheme: "dark" });
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
      "rgb(15, 17, 21)",
    );

    await page.emulateMedia({ colorScheme: "light" });
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
      "rgb(245, 246, 248)",
    );
  });
});
```

The two colour literals are `--bg` from `src/app/globals.css` — `#0f1115` dark (`rgb(15, 17, 21)`) and `#f5f6f8` light (`rgb(245, 246, 248)`). The visual pass will change these tokens, and this spec must change with them.

- [ ] **Step 6: Run the whole suite**

Run: `npx playwright test`
Expected: PASS, 16 tests across six files.

Verified selectors, so these should match first time: the theme controls are
`role="radio"` with `aria-label` of `Light` / `Dark` / `System`; the sidebar is
`#app-sidebar`; the drawer toggle's accessible name is `Open navigation` when
closed and `Close navigation` when open.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/toast.spec.ts tests/e2e/mobile.spec.ts tests/e2e/theme.spec.ts
git commit -m "Add E2E coverage for toasts, the phone layout and theming"
```

---

## Task 16: CI, documentation, and final verification

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Add the E2E job steps**

In `.github/workflows/ci.yml`, add after the existing "API integration tests" step:

```yaml
      # Chromium only — the suite proves focus, layout and the no-flash theme
      # script, none of which need a second engine to be worth running.
      - name: Install Playwright browser
        run: npx playwright install --with-deps chromium

      # Runs after the API tests, never beside them: both suites drop
      # admin_users and roles from the same database.
      - name: End-to-end tests
        run: npm run test:e2e

      - name: Upload Playwright report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

- [ ] **Step 2: Document the new suite in CLAUDE.md**

In `CLAUDE.md`, add to the Commands block:

```bash
npm run test:e2e     # Playwright browser tests — needs Postgres AND a prior `npm run build`
```

Add to the single-test examples:

```bash
npx playwright test tests/e2e/modal.spec.ts                          # build first
npx playwright test tests/e2e/modal.spec.ts -g "returns focus"       # single test by name
```

Replace the "Before running `npm run test:api`" heading with "Before running `npm run test:api` or `npm run test:e2e`" and add a paragraph after the existing warning:

> The Playwright suite uses the same harness (`tests/support/server.ts`) on port
> 3312 and is equally destructive. **Never run the two suites concurrently** —
> they drop the same tables. Set `E2E_DATABASE_URL` to give the browser suite its
> own database if you want to run them in parallel; `npm run verify` runs them in
> sequence.

Add to the "Testing layers" section:

> - `tests/e2e/` — Playwright against a real browser, real server, real database.
>   Covers only what needs a browser: focus trapping, inline validation, toasts,
>   the mobile drawer, card tables, and the pre-paint theme script. It does not
>   re-test RBAC, session forgery or upload sniffing — `tests/api/` owns those.

Update the known-gaps sentence at the end: remove "and there are no browser-level tests".

- [ ] **Step 3: Document it in the README**

In `README.md`, add to the Testing code block:

```bash
npm run test:e2e      # browser tests — needs Postgres + a build
```

Add a row to the integration-test table and a short paragraph after it describing the six specs. In the "Known gaps" list, delete the bullet reading **"No browser-level (end-to-end) tests."** and replace it with:

```markdown
- **No visual-regression tests.** The browser suite asserts on behaviour —
  focus, layout mode, theme attributes — not on pixels.
```

Add `npm run test:e2e` to the Scripts table.

- [ ] **Step 4: Run the entire chain from clean**

```bash
rm -rf .next
npm run verify
```

Expected: typecheck, lint, 203+ unit tests, build, 135 API tests, 16 E2E tests — all passing, in that order.

- [ ] **Step 5: Confirm the acceptance criteria by hand**

With `npm run dev` running, walk the spec's success criteria:

1. Add-user with three bad fields → three messages, first focused.
2. `role_id` rejects a crafted value with "Select a valid role group." — check with:
   `curl -s -X POST localhost:3000/api/users -H 'Content-Type: application/json' -d '{"full_name":"x","email":"a@b.co","password":"aaaaaaaaaaaa","role_id":"abc"}'`
   (Expect a 401 when signed out — sign in through the browser and repeat with the cookie, or accept the unit test as the evidence.)
3. A duplicate email still opens the error modal.
4. A success toast self-dismisses.
5. Tab cannot leave an open dialog; Escape returns focus to the trigger.
6. Drag-select out of a dialog does not close it.
7. Users and Dashboard tables are cards below 700px.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml CLAUDE.md README.md
git commit -m "Run the browser suite in CI and document it"
```

---

## Self-Review Notes

**Spec coverage.** Every section of the spec maps to a task: field-error mapping → 1; `role_id` message → 1; toast reducer → 2; `ToastProvider` → 3; `useFormErrors` + `Field` → 4; modal focus and overlay fix → 5; `.table-cards` → 6 and 7; the four screen migrations → 7, 9, 10, 11; the checkpoint → 8; pending states → 12; harness → 13; the six specs → 14 and 15; scripts, CI and docs → 13 and 16.

**Two deviations from the spec, both deliberate and both verified:**

1. The spec called for `fieldErrorsFromZod` to descend into `invalid_union` sub-issues as a defensive fallback. Testing against Zod 4.4.3 showed the branch messages are internals (`Invalid input: expected ""`), strictly worse than the union's own message. The descent is dropped; the schema-level message in `roleIdSchema` is the whole fix. Task 1 documents why in the module header.
2. The spec listed pending states as part of each screen's migration. They are Task 12 instead, because `useLinkStatus` lives in `AppShell` and touches no feature client.

**Selectors verified against the source rather than assumed.** `ThemeToggle`
renders `role="radio"` inside a `role="radiogroup"`, not buttons — the first
draft of Task 15 used `getByRole("button")` and would have failed on every
assertion. Also confirmed: `roleInputSchema` does carry a `description` field
(so `roleForm.errors.description` is reachable), the topbar `<h1>` renders the
active module's label (so `signIn` can wait on a "Dashboard" heading), and
"Create group" appears twice on the Roles page — page header and modal footer —
which is why the toast spec uses `.last()`.

**Naming consistency.** `formId` is the prop name on `Field` and the argument to `useFormErrors`; ids are always `fieldElementId(formId, name)` = `` `${formId}-${name}` ``; the form ids in use are `user-form`, `reset-form`, `role-form`, `profile-form`, `login`, and the E2E specs select on exactly those. `showToast` is the only method on `useToast()`. `startTestServer` / `stopTestServer` are the only exports the two harnesses call.
