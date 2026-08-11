# UI/UX Visual Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the portal look deliberate rather than generated — a restrained oklch palette driven by one rebrand knob, a six-step type scale, and fifteen hand-drawn icons replacing twenty emoji — with contrast and dark-mode parity enforced by tests.

**Architecture:** Foundation-first. `globals.css` is global, so the screen-by-screen order used in the usability pass does not apply. The token layer lands first, a contrast suite locks it against WCAG AA before anything is built on top, then type, then icons.

**Tech Stack:** CSS custom properties + `oklch()`, Next.js 16 / React 19, Playwright (already installed).

**Spec:** `docs/superpowers/specs/2026-08-11-ui-ux-visual-design.md`

## Global Constraints

- **No new dependencies.** Icons hand-authored; type scale uses the system stack. `package.json` gains nothing.
- **No behaviour changes.** The existing 375 tests stay green. Only the two colour assertions in `tests/e2e/theme.spec.ts` change, and only because oklch changes what `getComputedStyle` returns.
- **The 16px mobile input override is untouchable** — it stops iOS Safari zooming on focus. Behavioural guard, not a visual choice.
- **Seeds are declared once**, on bare `:root`, never overridden per theme. That is what makes a rebrand one edit.
- **Three token blocks remain**: bare `:root`, `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, and `:root[data-theme="dark"]`.
- **Browser floor:** `oklch()` needs Chrome 111+/Safari 15.4+/Firefox 113+ (Baseline 2023). No `@supports` fallback — accepted deliberately.
- **No hard-coded colour below the token blocks.** The file's header comment says this; this plan makes it true.
- Run `npm run verify` before every commit. It needs Postgres on 55432 and takes ~90s.

---

## File Structure

**Create:**

| Path | Responsibility |
|---|---|
| `src/components/icons/index.tsx` | The 15-icon registry, `IconName` type, and `Icon` component. |
| `tests/e2e/contrast.spec.ts` | WCAG AA enforcement + dark-mode parity, both themes. |

**Modify:**

| Path | Change |
|---|---|
| `src/app/globals.css` | Token blocks rewritten; type scale; gradient removal; hard-coded fixes. |
| `src/lib/modules.ts` | `icon` retyped from emoji string to `IconName`. Presentation field only. |
| `src/components/AppShell.tsx` | Nav + drawer + sign-out icons. |
| `src/features/theme/ThemeToggle.tsx` | Sun/moon/monitor icons. |
| `src/features/dashboard/DashboardClient.tsx` | Stat-tile + empty-state icons; page title class. |
| `src/features/users/UsersClient.tsx` | Plus + empty-state icons; page title class. |
| `src/features/roles/RolesClient.tsx` | Plus + empty-state icons; page title + meta classes. |
| `src/features/profile/ProfileClient.tsx` | Page title class. |
| `src/components/ui/Modal.tsx` | Close icon. |
| `src/components/ui/ToastProvider.tsx` | Close icon. |
| `src/components/ui/PhotoUploader.tsx` | Image placeholder icon. |
| `tests/e2e/theme.spec.ts` | Colour assertions become relationship-based. |
| `CLAUDE.md`, `README.md` | Restyling and rebranding guidance. |

---

## Task 1: Token layer

**Files:**
- Modify: `src/app/globals.css` (token blocks, lines 17-126; plus the six hard-coded values below them)
- Modify: `tests/e2e/theme.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: seeds `--accent-h`, `--neutral-h`, `--neutral-c`; tokens `--on-accent`, `--shadow-sm`, `--shadow-md`, `--shadow-lg`. `--shadow` is **removed** — every use becomes `--shadow-lg` except `.toast`, which takes `--shadow-md`.

- [ ] **Step 1: Replace the light token block**

In `src/app/globals.css`, replace the whole `:root { … }` block (from `:root {` through its closing brace, currently lines 17-54) with:

```css
:root {
  color-scheme: light dark;

  /* ---- Seeds -------------------------------------------------------------
     The rebrand knobs. Declared here only, never overridden per theme, so
     changing --accent-h restyles light AND dark in one edit. Set
     --neutral-c to 0 for pure greys: every neutral's chroma is a multiple
     of it, so zero genuinely means zero.
     --------------------------------------------------------------------- */
  --accent-h: 250;
  --neutral-h: 250;
  --neutral-c: 0.008;

  /* ---- Neutrals ---- */
  --bg: oklch(0.982 calc(var(--neutral-c) * 0.4) var(--neutral-h));
  --surface: oklch(1 0 0);
  --surface-2: oklch(0.962 calc(var(--neutral-c) * 0.6) var(--neutral-h));
  --border: oklch(0.912 calc(var(--neutral-c) * 0.9) var(--neutral-h));
  --text: oklch(0.24 calc(var(--neutral-c) * 1.9) var(--neutral-h));
  --muted: oklch(0.53 calc(var(--neutral-c) * 2) var(--neutral-h));

  /* ---- Accent ----
     Chroma stays literal: an accent is a per-fork decision, and tying its
     intensity to a seed would mean a rebrand had two knobs, not one. */
  --primary: oklch(0.545 0.16 var(--accent-h));
  --primary-hover: oklch(0.485 0.16 var(--accent-h));
  --primary-soft: oklch(0.545 0.16 var(--accent-h) / 0.12);
  --primary-text: oklch(0.42 0.15 var(--accent-h));
  /* Label colour ON the accent. Theme-dependent, and a token rather than a
     literal so a fork choosing a pale accent can fix legibility in one place. */
  --on-accent: oklch(1 0 0);

  /* ---- Status ----
     Hues 150/70/25/235, each pinned to matching lightness so no status
     colour shouts louder than another purely because of its hue. */
  --success-soft: oklch(0.62 0.15 150 / 0.14);
  --success-text: oklch(0.44 0.13 150);
  --warning-soft: oklch(0.70 0.15 70 / 0.16);
  --warning-text: oklch(0.45 0.11 70);
  --danger: oklch(0.55 0.19 25);
  --danger-soft: oklch(0.55 0.19 25 / 0.12);
  --danger-text: oklch(0.46 0.18 25);
  --danger-strong: oklch(0.55 0.19 25 / 0.20);
  --info-soft: oklch(0.60 0.13 235 / 0.14);
  --info-text: oklch(0.44 0.12 235);

  /* ---- Chrome ---- */
  --btn-hover: oklch(0.935 calc(var(--neutral-c) * 0.8) var(--neutral-h));
  --topbar-bg: oklch(1 0 0 / 0.8);
  --overlay: oklch(0.24 0.02 var(--neutral-h) / 0.45);
  --link: oklch(0.45 0.15 var(--accent-h));
  --login-glow: oklch(0.545 0.16 var(--accent-h) / 0.13);
  --toast-accent: oklch(0.52 0.14 150);

  /* ---- Shape & depth ---- */
  --radius: 12px;
  --radius-sm: 8px;
  --shadow-sm: 0 1px 2px oklch(0.24 0.02 var(--neutral-h) / 0.08);
  --shadow-md: 0 4px 12px oklch(0.24 0.02 var(--neutral-h) / 0.10);
  --shadow-lg: 0 10px 30px oklch(0.24 0.02 var(--neutral-h) / 0.13);
  --sidebar-w: 250px;
}
```

- [ ] **Step 2: Replace both dark blocks with identical bodies**

Replace the `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` block and the `:root[data-theme="dark"] { … }` block so both contain **exactly** these declarations. They must stay byte-identical — Task 1's parity test enforces it.

```css
/* "System" — no data-theme attribute, so the OS decides. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: oklch(0.178 calc(var(--neutral-c) * 1.25) var(--neutral-h));
    --surface: oklch(0.218 calc(var(--neutral-c) * 1.5) var(--neutral-h));
    --surface-2: oklch(0.262 calc(var(--neutral-c) * 1.6) var(--neutral-h));
    --border: oklch(0.322 calc(var(--neutral-c) * 1.75) var(--neutral-h));
    --text: oklch(0.935 calc(var(--neutral-c) * 0.75) var(--neutral-h));
    --muted: oklch(0.715 calc(var(--neutral-c) * 1.75) var(--neutral-h));

    --primary: oklch(0.68 0.15 var(--accent-h));
    --primary-hover: oklch(0.74 0.15 var(--accent-h));
    --primary-soft: oklch(0.68 0.15 var(--accent-h) / 0.18);
    --primary-text: oklch(0.86 0.08 var(--accent-h));
    --on-accent: oklch(0.19 0.02 var(--accent-h));

    --success-soft: oklch(0.75 0.16 150 / 0.18);
    --success-text: oklch(0.87 0.14 150);
    --warning-soft: oklch(0.80 0.15 70 / 0.18);
    --warning-text: oklch(0.88 0.13 70);
    --danger: oklch(0.65 0.19 25);
    --danger-soft: oklch(0.65 0.19 25 / 0.20);
    --danger-text: oklch(0.81 0.12 25);
    --danger-strong: oklch(0.65 0.19 25 / 0.32);
    --info-soft: oklch(0.72 0.13 235 / 0.18);
    --info-text: oklch(0.86 0.09 235);

    --btn-hover: oklch(0.30 calc(var(--neutral-c) * 1.7) var(--neutral-h));
    --topbar-bg: oklch(0.218 calc(var(--neutral-c) * 1.5) var(--neutral-h) / 0.72);
    --overlay: oklch(0.12 0.01 var(--neutral-h) / 0.62);
    --link: oklch(0.82 0.10 var(--accent-h));
    --login-glow: oklch(0.68 0.15 var(--accent-h) / 0.16);
    --toast-accent: oklch(0.82 0.14 150);

    --shadow-sm: 0 1px 2px oklch(0 0 0 / 0.30);
    --shadow-md: 0 4px 12px oklch(0 0 0 / 0.38);
    --shadow-lg: 0 10px 30px oklch(0 0 0 / 0.45);
  }
}

/* Explicit dark choice — wins regardless of the OS setting.
   MUST match the block above declaration for declaration. The parity test in
   tests/e2e/contrast.spec.ts fails if they drift. */
:root[data-theme="dark"] {
  /* …the same 28 declarations, copied verbatim… */
}
```

Copy the 28 declarations into the `[data-theme="dark"]` block verbatim.

- [ ] **Step 3: Remove the gradients and the hard-coded colours**

Three edits below the token blocks.

`.brand-mark`:

```css
.brand-mark {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: var(--primary);
  display: grid;
  place-items: center;
  font-weight: 800;
  color: var(--on-accent);
  font-size: 14px;
  flex-shrink: 0;
}
```

`.avatar-fallback`:

```css
.avatar-fallback {
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--primary);
  color: var(--on-accent);
  font-weight: 700;
  border: 1px solid var(--border);
  flex-shrink: 0;
}
```

`.theme-option.active` — replace `box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);` with `box-shadow: var(--shadow-sm);`

`.btn.primary` — replace `color: #ffffff;` with `color: var(--on-accent);`

- [ ] **Step 4: Repoint the shadow token**

`--shadow` no longer exists. Replace every `var(--shadow)` with `var(--shadow-lg)`, except in `.toast`, which uses `var(--shadow-md)`.

Find them all:

```bash
grep -n "var(--shadow)" src/app/globals.css
```

Expected: `.login-card`, `.modal`, `.toast`, and the mobile `.sidebar`.

- [ ] **Step 5: Verify no hard-coded colours remain below the token blocks**

```bash
awk 'NR>130' src/app/globals.css | grep -nE "#[0-9a-fA-F]{3,8}\b|rgba?\(" || echo "CLEAN"
```

Expected: `CLEAN`. If anything prints, replace it with a token.

- [ ] **Step 6: Update the theme spec's colour assertions**

In `tests/e2e/theme.spec.ts`, add this helper after the imports:

```ts
/** Lightness channel of an oklch() colour string, e.g. "oklch(0.178 0.01 250)". */
function oklchLightness(value: string): number {
  const match = /oklch\(\s*([0-9.]+)/.exec(value);
  if (!match) throw new Error(`expected an oklch() colour, got: ${value}`);
  return Number(match[1]);
}
```

Replace the assertion in "keeps an explicit dark choice across a reload":

```ts
    // Asserted as a relationship, not a literal. A test pinned to a specific
    // colour would break on every rebrand — which is exactly what this
    // boilerplate is built for — while still not proving anything more.
    const darkL = oklchLightness(
      await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    );
    expect(darkL).toBeLessThan(0.5);
```

Replace the body of "follows the OS setting when set to system":

```ts
    await page.getByRole("radio", { name: "System" }).click();

    await page.emulateMedia({ colorScheme: "dark" });
    const dark = oklchLightness(
      await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    );

    await page.emulateMedia({ colorScheme: "light" });
    const light = oklchLightness(
      await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    );

    expect(dark).toBeLessThan(light);
    expect(light - dark).toBeGreaterThan(0.5);
```

- [ ] **Step 7: Verify**

Run: `npm run verify`
Expected: PASS — 219 unit, 135 API, 21 browser.

- [ ] **Step 8: Confirm the rebrand knob works**

Temporarily change `--accent-h: 250` to `--accent-h: 25`, run `npm run dev`, and confirm buttons, nav-active state, links and the brand mark all turn red-orange in both themes. Then change it back to `250`. This is the spec's headline claim — verify it rather than assume it.

- [ ] **Step 9: Commit**

```bash
git add src/app/globals.css tests/e2e/theme.spec.ts
git commit -m "Rebuild the token layer on oklch seeds; drop the gradient"
```

---

## Task 2: Contrast and dark-parity suite

**Files:**
- Create: `tests/e2e/contrast.spec.ts`

**Interfaces:**
- Consumes: the tokens from Task 1.
- Produces: nothing other tasks import.

**Verified mechanism, do not substitute another:** `getComputedStyle` returns `oklch()` verbatim and does *not* convert to rgb — but it *does* resolve `calc()`. Canvas `fillStyle` also preserves oklch, so reading `fillStyle` back is useless. The working conversion is to **rasterise**: `fillRect` then `getImageData`, which returns true sRGB bytes. Filling a base colour first and the translucent colour over it makes the browser composite alpha exactly as the user sees it.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/contrast.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/actions";

// Guards the rebrand knob. A fork that sets --accent-h to a hue whose accent
// cannot carry its label colour gets a failing build instead of an
// accessibility complaint months later.
//
// Colours are RASTERISED rather than parsed: getComputedStyle hands back
// oklch() verbatim, and canvas fillStyle preserves it too, so the only way to
// true sRGB is to paint a pixel and read it back. Painting the base colour
// first also makes the browser composite alpha exactly as a user sees it.

type Rgb = [number, number, number];

const AA_TEXT = 4.5;
const AA_UI = 3;

async function sample(
  page: Page,
  pairs: { name: string; fg: string; bg: string; over?: string; min: number }[],
) {
  return page.evaluate((specs) => {
    const probe = document.createElement("div");
    probe.style.position = "absolute";
    probe.style.opacity = "0";
    probe.style.pointerEvents = "none";
    document.body.appendChild(probe);

    const resolve = (token: string): string => {
      probe.style.color = "";
      probe.style.color = `var(${token})`;
      return getComputedStyle(probe).color;
    };

    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    const paint = (color: string, over?: string): [number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      if (over) {
        ctx.fillStyle = over;
        ctx.fillRect(0, 0, 1, 1);
      }
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0]!, d[1]!, d[2]!];
    };

    const luminance = ([r, g, b]: [number, number, number]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };

    const results = specs.map((spec) => {
      const base = spec.over ? resolve(spec.over) : undefined;
      const bg = paint(resolve(spec.bg), base);
      // Text is composited over its own background, so a translucent text
      // colour is measured as rendered rather than as declared.
      const fg = paint(resolve(spec.fg), resolve(spec.bg));
      const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
      return {
        name: spec.name,
        min: spec.min,
        ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100,
      };
    });

    probe.remove();
    return results;
  }, pairs);
}

const PAIRS = [
  { name: "text on bg", fg: "--text", bg: "--bg", min: AA_TEXT },
  { name: "text on surface", fg: "--text", bg: "--surface", min: AA_TEXT },
  { name: "muted on surface", fg: "--muted", bg: "--surface", min: AA_TEXT },
  { name: "muted on bg", fg: "--muted", bg: "--bg", min: AA_TEXT },
  { name: "on-accent on primary", fg: "--on-accent", bg: "--primary", min: AA_TEXT },
  { name: "on-accent on primary-hover", fg: "--on-accent", bg: "--primary-hover", min: AA_TEXT },
  { name: "primary-text on primary-soft", fg: "--primary-text", bg: "--primary-soft", over: "--surface", min: AA_TEXT },
  { name: "success badge", fg: "--success-text", bg: "--success-soft", over: "--surface", min: AA_TEXT },
  { name: "warning badge", fg: "--warning-text", bg: "--warning-soft", over: "--surface", min: AA_TEXT },
  { name: "danger badge", fg: "--danger-text", bg: "--danger-soft", over: "--surface", min: AA_TEXT },
  { name: "info badge", fg: "--info-text", bg: "--info-soft", over: "--surface", min: AA_TEXT },
  { name: "gray badge", fg: "--muted", bg: "--surface-2", over: "--surface", min: AA_TEXT },
  { name: "field error on surface", fg: "--danger-text", bg: "--surface", min: AA_TEXT },
  { name: "link on surface", fg: "--link", bg: "--surface", min: AA_TEXT },
  { name: "border on surface", fg: "--border", bg: "--surface", min: AA_UI },
];

for (const theme of ["light", "dark"] as const) {
  test(`meets WCAG AA in ${theme} mode`, async ({ page }) => {
    await signIn(page);
    await page.getByRole("radio", { name: theme === "light" ? "Light" : "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

    const results = await sample(page, PAIRS);
    const failures = results
      .filter((r) => r.ratio < r.min)
      .map((r) => `${r.name}: ${r.ratio}:1 (needs ${r.min}:1)`);

    expect(failures).toEqual([]);
  });
}

test("both routes into dark mode compute identically", async ({ page }) => {
  // globals.css carries the dark palette twice — once under
  // prefers-color-scheme, once under [data-theme="dark"] — because CSS cannot
  // share a declaration list across a media query and an attribute selector.
  // The file has always warned that they must stay in sync; this enforces it.
  const TOKENS = [
    "--bg", "--surface", "--surface-2", "--border", "--text", "--muted",
    "--primary", "--primary-hover", "--primary-soft", "--primary-text",
    "--on-accent", "--success-soft", "--success-text", "--warning-soft",
    "--warning-text", "--danger", "--danger-soft", "--danger-text",
    "--danger-strong", "--info-soft", "--info-text", "--btn-hover",
    "--topbar-bg", "--overlay", "--link", "--login-glow", "--toast-accent",
    "--shadow-sm", "--shadow-md", "--shadow-lg",
  ];

  const read = () =>
    page.evaluate((tokens) => {
      const style = getComputedStyle(document.documentElement);
      return Object.fromEntries(
        tokens.map((t) => [t, style.getPropertyValue(t).trim()]),
      );
    }, TOKENS);

  await signIn(page);

  // Route A: explicit attribute.
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const viaAttribute = await read();

  // Route B: system preference, no attribute at all.
  await page.getByRole("radio", { name: "System" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);
  await page.emulateMedia({ colorScheme: "dark" });
  const viaMediaQuery = await read();

  expect(viaMediaQuery).toEqual(viaAttribute);
});
```

- [ ] **Step 2: Run it**

Run: `npm run build && npx playwright test contrast.spec.ts --reporter=list`
Expected: three tests. Some contrast pairs may FAIL on the first run — that is the point of this task.

- [ ] **Step 3: Tune until green**

For each reported failure, adjust only the **lightness** channel of the offending token in `src/app/globals.css`, then rebuild and re-run. Rules:

- Raising a text token's contrast on a light background means *lowering* its L.
- On a dark background, *raise* it.
- Do not reduce chroma to pass — that drains the palette. Move L.
- `--on-accent` is the token to move if a primary-button pair fails, not `--primary`.

Repeat `npm run build && npx playwright test contrast.spec.ts` until all three tests pass.

- [ ] **Step 4: Prove the test has teeth**

A contrast test that cannot fail is worthless. Temporarily set `--accent-h: 95` (yellow-green) in `src/app/globals.css`, rebuild, and run the suite.

Run: `npm run build && npx playwright test contrast.spec.ts --reporter=list`
Expected: FAIL on "on-accent on primary" in light mode — white label on a pale yellow accent.

Then restore `--accent-h: 250`, rebuild, and confirm it passes again.

- [ ] **Step 5: Verify and commit**

Run: `npm run verify`
Expected: PASS — 219 unit, 135 API, 24 browser.

```bash
git add tests/e2e/contrast.spec.ts src/app/globals.css
git commit -m "Enforce WCAG AA and dark-mode parity in the browser suite"
```

---

## Task 3: Type scale

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/features/{dashboard/DashboardClient,users/UsersClient,roles/RolesClient,profile/ProfileClient}.tsx`

**Interfaces:**
- Produces: `--text-display`, `--text-title`, `--text-heading`, `--text-body`, `--text-label`, `--text-micro`; classes `.page-title` and `.meta`.

- [ ] **Step 1: Add the scale to the `:root` block**

Insert into `:root`, after the `--sidebar-w` line:

```css
  /* ---- Type scale ----
     Six steps, replacing fifteen ad-hoc sizes. Tracking tightens as size
     grows, which is what stops large text looking loose. */
  --text-display: 1.75rem;   /* 28 — stat values */
  --text-title: 1.25rem;     /* 20 — page headings */
  --text-heading: 1.0625rem; /* 17 — topbar, modal, card titles */
  --text-body: 0.875rem;     /* 14 — default */
  --text-label: 0.75rem;     /* 12 — field labels, chips */
  --text-micro: 0.6875rem;   /* 11 — table headers, nav sections, badges */

  --track-display: -0.02em;
  --track-title: -0.01em;
  --track-heading: -0.005em;
  --track-label: 0.01em;
  --track-micro: 0.04em;
```

- [ ] **Step 2: Apply the scale**

Replace the `font-size` declarations through `globals.css` as follows. Every other `font-size` in the file is deleted so the element inherits `--text-body`.

| Selector | New declaration |
|---|---|
| `html, body` | `font-size: var(--text-body); line-height: 1.5;` |
| `.brand-name` | `font-size: var(--text-body); font-weight: 700;` |
| `.brand-sub` | `font-size: var(--text-micro); color: var(--muted);` |
| `.brand-mark` | `font-size: var(--text-label);` |
| `.nav-section` | `font-size: var(--text-micro); letter-spacing: var(--track-micro);` |
| `.nav-link` | (delete its `font-size`) |
| `.topbar h1` | `font-size: var(--text-heading); letter-spacing: var(--track-heading);` |
| `.topbar-identity` | `font-size: var(--text-label);` |
| `.theme-option` | `font-size: var(--text-label);` |
| `.user-chip .um-name` | `font-size: var(--text-body); font-weight: 600;` |
| `.user-chip .um-role` | `font-size: var(--text-micro);` |
| `.card-title` | `font-size: var(--text-heading); letter-spacing: var(--track-heading); font-weight: 650;` |
| `.stat .label` | `font-size: var(--text-label);` |
| `.stat .value` | `font-size: var(--text-display); letter-spacing: var(--track-display); font-weight: 700; font-variant-numeric: tabular-nums;` |
| `.stat .sub` | `font-size: var(--text-label);` |
| `.badge` | `font-size: var(--text-micro); letter-spacing: var(--track-micro);` |
| `table` | `font-size: var(--text-body); font-variant-numeric: tabular-nums;` |
| `thead th` | `font-size: var(--text-micro); letter-spacing: var(--track-micro);` |
| `.btn` | `font-size: var(--text-body);` |
| `.btn.sm` | `font-size: var(--text-label);` |
| `.field label` | `font-size: var(--text-label); letter-spacing: var(--track-label);` |
| `.field .hint` | `font-size: var(--text-micro);` |
| `.field-error` | `font-size: var(--text-micro);` |
| inputs/select/textarea | `font-size: var(--text-body);` |
| `.check-item .ci-label` | `font-size: var(--text-body);` |
| `.check-item .ci-key` | `font-size: var(--text-micro);` |
| `.alert` | `font-size: var(--text-body);` |
| `.page-head p` | `font-size: var(--text-body); color: var(--muted);` |
| `.modal-head h3` | `font-size: var(--text-heading); letter-spacing: var(--track-heading);` |
| `.modal-message` | `font-size: var(--text-body); line-height: 1.6;` |
| `.toast` | `font-size: var(--text-body);` |
| `.close-x` | `font-size: var(--text-title);` |
| `.toast-dismiss` | `font-size: var(--text-heading);` |
| `.empty-state .big` | `font-size: var(--text-display);` |
| `code` | `font-size: var(--text-label);` |
| `.photo-preview.empty` | `font-size: var(--text-title);` |

**Leave the `@media (max-width: 620px)` input override at literal `16px`.** It is the iOS-zoom guard and must not become a token.

- [ ] **Step 3: Add the two new classes**

Append to `globals.css`, next to `.page-head`:

```css
.page-title {
  font-size: var(--text-title);
  letter-spacing: var(--track-title);
  font-weight: 650;
}

/* Secondary detail line inside a card or table cell. */
.meta {
  font-size: var(--text-label);
  color: var(--muted);
}
```

- [ ] **Step 4: Remove the seven inline font sizes**

In each of the four feature clients, replace `<h2 style={{ fontSize: 20 }}>` with `<h2 className="page-title">`:

- `src/features/dashboard/DashboardClient.tsx` — `Welcome back, …`
- `src/features/users/UsersClient.tsx` — `User Management`
- `src/features/roles/RolesClient.tsx` — `Role Management`
- `src/features/profile/ProfileClient.tsx` — `Profile Management`

Then replace the three remaining `style={{ fontSize: 12 }}` uses:

- `RolesClient.tsx` — `<div className="muted" style={{ fontSize: 12, marginTop: 2 }}>` becomes `<div className="meta" style={{ marginTop: 2 }}>`
- `RolesClient.tsx` — `<span className="muted" style={{ fontSize: 12 }}>` becomes `<span className="meta">`
- `UsersClient.tsx` — `<div className="muted" style={{ fontSize: 12 }}>` becomes `<div className="meta">`

Leave `Avatar.tsx`'s `fontSize: size * 0.4` — it legitimately scales with the `size` prop.

- [ ] **Step 5: Confirm the size count**

```bash
grep -oE "font-size: [0-9.]+px" src/app/globals.css | sort -u
```

Expected: exactly one line — `font-size: 16px` (the mobile input guard). Everything else must be a token.

```bash
grep -rn "fontSize" src/features src/components
```

Expected: one line — `Avatar.tsx`.

- [ ] **Step 6: Verify and commit**

Run: `npm run verify`
Expected: PASS — 219 unit, 135 API, 24 browser.

```bash
git add src/app/globals.css src/features
git commit -m "Replace fifteen ad-hoc font sizes with a six-step scale"
```

---

## Task 4: Icon module

**Files:**
- Create: `src/components/icons/index.tsx`

**Interfaces:**
- Produces: `type IconName`, `const ICONS`, and `Icon({ name, size, className }: { name: IconName; size?: number; className?: string })`. Default `size` is 18.

- [ ] **Step 1: Create the module**

Create `src/components/icons/index.tsx`:

```tsx
import type { ReactNode } from "react";

// The whole icon set: 15 icons on a 24×24 grid, 1.5px stroke, round caps and
// joins, no fill. Every one draws in `currentColor`, so an icon inherits its
// container's colour and state — which is exactly what the emoji they replace
// could never do.
//
// Hand-authored rather than a dependency: this project ships zero UI packages,
// and a fork inherits whatever we add here. Adding a 16th icon means adding one
// entry below.

const paths: Record<string, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
  settings: (
    <>
      <path d="M20 7h-9" />
      <path d="M14 17H5" />
      <circle cx="17" cy="17" r="3" />
      <circle cx="7" cy="7" r="3" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  ban: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m4.93 4.93 14.14 14.14" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a8 8 0 0 1 16 0v1" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  menu: (
    <>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </>
  ),
  close: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  signOut: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </>
  ),
  moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />,
  monitor: (
    <>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </>
  ),
};

export const ICONS = paths as Record<keyof typeof paths, ReactNode>;

export type IconName = keyof typeof paths;

export const ICON_NAMES = Object.keys(paths) as IconName[];

type IconProps = {
  name: IconName;
  /** Rendered square size in px. */
  size?: number;
  className?: string;
};

export function Icon({ name, size = 18, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      // Decorative by default. Every call site pairs the icon with a text
      // label or an aria-label on the control itself.
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
```

- [ ] **Step 2: Write the registry test**

Create `tests/unit/icons.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ICON_NAMES } from "@/components/icons";
import { MODULES } from "@/lib/modules";

describe("icon registry", () => {
  it("covers every module's icon", () => {
    // TypeScript already enforces this, but a cast in modules.ts would slip
    // past it and render a blank square in the sidebar.
    const missing = MODULES.map((m) => m.icon).filter(
      (icon) => !ICON_NAMES.includes(icon),
    );
    expect(missing).toEqual([]);
  });

  it("exposes the fifteen icons the app uses", () => {
    expect(ICON_NAMES).toHaveLength(15);
  });
});
```

This test fails until Task 5 retypes `modules.ts`. That is intentional — write it now, and Task 5's step 1 makes it pass.

- [ ] **Step 3: Verify the module compiles**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

Run: `npx vitest run tests/unit/icons.test.ts`
Expected: FAIL on "covers every module's icon" — `modules.ts` still holds emoji. Correct at this stage.

- [ ] **Step 4: Commit**

```bash
git add src/components/icons/index.tsx tests/unit/icons.test.ts
git commit -m "Add a hand-authored icon set with a typed registry"
```

---

## Task 5: Icon adoption

**Files:**
- Modify: `src/lib/modules.ts:11-16`
- Modify: `src/components/AppShell.tsx`, `src/features/theme/ThemeToggle.tsx`, `src/features/dashboard/DashboardClient.tsx`, `src/features/users/UsersClient.tsx`, `src/features/roles/RolesClient.tsx`, `src/components/ui/Modal.tsx`, `src/components/ui/ToastProvider.tsx`, `src/components/ui/PhotoUploader.tsx`
- Modify: `src/app/globals.css` (`.nav-ico`, `.stat-ico`, `.empty-state .big`)

**Interfaces:**
- Consumes: `Icon`, `IconName` from `@/components/icons`.

- [ ] **Step 1: Retype `modules.ts`**

`src/lib/modules.ts` is the RBAC source of truth. **Only the `icon` field changes** — no key, path, or access rule is touched.

Add the import at the top:

```ts
import type { IconName } from "@/components/icons";
```

Replace the `MODULES` declaration:

```ts
export const MODULES = [
  { key: "dashboard", label: "Dashboard", icon: "dashboard", path: "/dashboard" },
  { key: "users", label: "User Management", icon: "users", path: "/users" },
  { key: "roles", label: "Role Management", icon: "shield", path: "/roles" },
  { key: "profile", label: "Profile Management", icon: "settings", path: "/profile" },
] as const satisfies readonly {
  key: string;
  label: string;
  icon: IconName;
  path: string;
}[];
```

`satisfies` keeps the literal types (so `ModuleKey` stays a union of the four keys) while checking each `icon` against `IconName`.

- [ ] **Step 2: Confirm the registry test now passes**

Run: `npx vitest run tests/unit/icons.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 3: AppShell — nav, drawer, sign-out**

Add the import:

```tsx
import { Icon } from "@/components/icons";
```

Replace the nav icon span:

```tsx
                <span className="nav-ico" aria-hidden="true">
                  <Icon name={m.icon} size={18} />
                </span>
```

Replace the drawer toggle's `☰` with `<Icon name="menu" size={18} />`, and the sign-out button's `⏻ ` prefix with `<Icon name="signOut" size={16} />`.

- [ ] **Step 4: ThemeToggle**

Replace the `LABELS` record:

```tsx
import { Icon, type IconName } from "@/components/icons";

const LABELS: Record<ThemeChoice, { icon: IconName; text: string }> = {
  light: { icon: "sun", text: "Light" },
  dark: { icon: "moon", text: "Dark" },
  system: { icon: "monitor", text: "System" },
};
```

and the render:

```tsx
            <span aria-hidden="true">
              <Icon name={icon} size={15} />
            </span>
```

**Do not touch `role="radio"`, `aria-checked`, or `aria-label={text}`** — `theme.spec.ts` and `contrast.spec.ts` both select these controls by accessible name.

- [ ] **Step 5: Dashboard**

Change `StatCardProps.icon` from `string` to `IconName`, render `<Icon name={icon} size={16} />` inside `.stat-ico`, and pass `icon="users"`, `icon="check"`, `icon="ban"`, `icon="shield"` to the four cards. Replace the empty state's `👤` with `<Icon name="user" size={28} />`.

- [ ] **Step 6: Users, Roles, Modal, Toast, PhotoUploader**

- `UsersClient.tsx` — `＋ Add user` becomes `<Icon name="plus" size={15} /> Add user`; the `👥` empty state becomes `<Icon name="users" size={28} />`.
- `RolesClient.tsx` — `＋ Create group` becomes `<Icon name="plus" size={15} /> Create group`; the `🛡️` empty state becomes `<Icon name="shield" size={28} />`. Also replace the module-checkbox `<span className="nav-ico">{module.icon}</span>` with `<Icon name={module.icon} size={16} />`.
- `Modal.tsx` — the `×` in `.close-x` becomes `<Icon name="close" size={16} />`.
- `ToastProvider.tsx` — the `×` in `.toast-dismiss` becomes `<Icon name="close" size={14} />`.
- `PhotoUploader.tsx` — `{initialsFor(name) || "📷"}` becomes `{initialsFor(name) || <Icon name="image" size={24} />}`.

**Keep every `aria-label`** (`Close`, `Dismiss notification`, `Open navigation`) — the browser suite selects on them.

- [ ] **Step 7: Adjust the icon containers**

In `globals.css`, the three containers were sized for emoji glyphs. Replace their rules:

```css
.nav-link .nav-ico {
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.stat-ico {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.empty-state .big {
  display: flex;
  justify-content: center;
  color: var(--muted);
  margin-bottom: 10px;
}
```

The `.stat-ico.indigo/green/amber/blue` background rules are unchanged; add a matching text colour to each so the icon inside picks it up:

```css
.stat-ico.indigo { background: var(--primary-soft); color: var(--primary-text); }
.stat-ico.green  { background: var(--success-soft); color: var(--success-text); }
.stat-ico.amber  { background: var(--warning-soft); color: var(--warning-text); }
.stat-ico.blue   { background: var(--info-soft);    color: var(--info-text); }
```

- [ ] **Step 8: Confirm no emoji remain**

```bash
grep -rnoP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{FF0B}\x{23FB}-\x{23FE}\x{2715}\x{2630}]' src || echo "NO EMOJI"
```

Expected: `NO EMOJI`.

- [ ] **Step 9: Verify and commit**

Run: `npm run verify`
Expected: PASS — 221 unit (219 + 2 icon tests), 135 API, 24 browser.

```bash
git add src/lib/modules.ts src/components src/features src/app/globals.css
git commit -m "Replace twenty emoji with the typed icon set"
```

---

## Task 6: Documentation

**Files:**
- Modify: `CLAUDE.md`, `README.md`

- [ ] **Step 1: Document rebranding in CLAUDE.md**

Replace the theme bullet in "Client-side conventions" with:

```markdown
- Theme: three modes (light/dark/system) with tokens in `src/app/globals.css`. Colours are `oklch()` derived from three seeds on bare `:root` — `--accent-h` (the rebrand knob), `--neutral-h`, and `--neutral-c` (set to `0` for pure greys; every neutral's chroma is a multiple of it). **Rebranding is changing `--accent-h`.** Seeds are declared once and never overridden per theme, which is what makes one edit reach both.
- The dark palette is declared twice — under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, and under `:root[data-theme="dark"]` — because CSS cannot share a declaration list across a media query and an attribute selector. They must stay identical; `tests/e2e/contrast.spec.ts` fails if they drift.
- Never hard-code a colour below the token blocks, and never add a `font-size` in px. The only literal left is the `16px` input size under `@media (max-width: 620px)`, which stops iOS Safari zooming on focus.
- Typography is a six-step scale: `--text-display/title/heading/body/label/micro` with matching `--track-*` values.
- Icons come from `src/components/icons/index.tsx` — `<Icon name="users" size={18} />`. `name` is typed, so a typo fails the build. They draw in `currentColor` and inherit their container's colour. No emoji in `src/`.
```

- [ ] **Step 2: Document the contrast gate**

Add to the "Testing layers" section, after the `tests/e2e/` bullet:

```markdown
- `tests/e2e/contrast.spec.ts` — asserts WCAG AA on every text/background pair in both themes, and that the two dark-mode routes compute identically. It rasterises colours through a canvas rather than parsing them, because `getComputedStyle` returns `oklch()` verbatim and canvas `fillStyle` preserves it. **If you change `--accent-h`, run this** — it is what stops a rebrand producing an unreadable button.
```

- [ ] **Step 3: Document rebranding in the README**

Replace the Theming section's bullet list with:

```markdown
- Colours are `oklch()`, derived from three seeds declared once on `:root`.
- **To rebrand, change `--accent-h`.** One number, both themes, everything downstream — buttons, links, focus rings, the active nav item, the brand mark.
- `--neutral-c` controls how much of the accent hue bleeds into the greys. Set it to `0` for neutral greys.
- Run `npm run test:e2e` afterwards: `contrast.spec.ts` fails the build if the new accent cannot carry its label colour at WCAG AA.
- The preference is stored in `localStorage` under `admin-portal-theme`, and an inline script in the root layout applies it before first paint, so there is no flash. It carries the CSP nonce.
- "System" stores no `data-theme` attribute at all, leaving `prefers-color-scheme` in charge, and tracks OS changes live via `matchMedia`.
```

- [ ] **Step 4: Final verification from clean**

```bash
rm -rf .next
npm run verify
```

Expected: typecheck, lint, 221 unit, build, 135 API, 24 browser — all passing.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "Document the rebrand knob and the contrast gate"
```

---

## Self-Review Notes

**Spec coverage.** Seeds and oklch architecture → Task 1. Gradient removal and the six hard-coded values → Task 1 steps 3-5. Theme assertions → Task 1 step 6. Contrast suite → Task 2. Dark-parity → Task 2 (folded in, since it shares the sampling harness and there is no reviewer decision that would accept one and reject the other). Type scale → Task 3. Icon module → Task 4. Emoji replacement and `modules.ts` retyping → Task 5. Docs → Task 6.

**One deviation from the spec, deliberate:** the spec lists the dark-parity test as a separate concern. It ships inside `contrast.spec.ts` because both need the same computed-token plumbing, and splitting them would duplicate it.

**Verified before writing, not assumed:** `getComputedStyle` resolves `calc()` but returns `oklch()` verbatim; canvas `fillStyle` also preserves oklch, so only `fillRect` + `getImageData` yields true sRGB; painting a base colour first makes the browser composite alpha exactly as rendered. Task 2's harness depends on all three and would be wrong without them.

**Type consistency.** `IconName` is defined in Task 4 and consumed in Task 5 by `modules.ts`, `ThemeToggle`, and `DashboardClient`. `Icon` takes `{ name, size?, className? }` everywhere. `--shadow` is removed in Task 1 step 4 and never referenced again. `.page-title` and `.meta` are defined in Task 3 step 3 and used in step 4.

**Test-count arithmetic.** Browser tests: 21 existing + 2 contrast + 1 parity = 24. Unit: 219 + 2 icon = 221.
