# UI/UX visual pass — design

**Date:** 2026-08-11
**Status:** approved, ready for planning
**Scope:** presentation only. The usability pass
(`2026-08-11-ui-ux-usability-design.md`) shipped first and is not revisited.

---

## Problem

The portal's structure is sound — a real token layer, correct three-block
theming, responsive breakpoints. Its *appearance* is the default output of a
generated template, and three things say so at a glance:

1. **A high-chroma indigo accent with a violet gradient.** `#4f46e5` is oklch
   chroma **0.22** — loud. It appears as `linear-gradient(135deg, var(--primary),
   #a855f7)` on the brand mark and every avatar fallback. This is the single
   clearest tell.
2. **Emoji as the icon system.** 20 occurrences across 9 files — module nav,
   stat tiles, empty states, theme toggle, drawer toggle, close buttons, the
   photo placeholder. They render differently on every OS, cannot take a stroke
   weight, and cannot inherit a colour.
3. **No type scale.** 15 distinct font sizes across 40 declarations
   (10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 16, 17, 20, 22, 28, 32), plus 7
   inline `fontSize` styles in the feature clients.

The file's own header claims *"Nothing below the token blocks hard-codes a
colour, which is what makes the theme switch a one-line change rather than an
audit."* **That is already false** — six hard-coded values sit below it.

## Identity

This is a **boilerplate to be reskinned**, confirmed during brainstorming. Repo
`spm-boiler-plate`, described as "a starting point for internal admin tools",
with a placeholder "AP" mark. That decides the aesthetic target:

> Credible, restrained, and obviously deliberate — with no strong personality,
> because personality is what each fork adds. Rebranding must be one edit, not
> an audit.

A bespoke identity would be actively wrong here: every fork would have to
dismantle it first.

## Goals

Make the app look considered rather than generated, and make the rebrand knob
real.

## Non-goals

**A spacing-token migration.** Replacing the 9/11/13px odd values with a
`--space-*` scale would touch nearly every rule in the file for almost no
visible gain, landing on top of the `.table-cards` and drawer work that just
shipped — real regression risk traded for tidiness. Revisit only if the spacing
starts causing problems.

Also out: any layout restructure, new screens, or component API changes.

---

## Constraints

- **No new dependencies.** Icons are hand-authored; the type scale uses the
  system stack. Nothing is added to `package.json`.
- **No behaviour changes.** The 375 tests from the usability pass stay green.
  Two theme assertions change because oklch changes what `getComputedStyle`
  returns — see Testing — and nothing else in any suite is edited.
- **CSP allows no external fonts.** `font-src 'self' data:` blocks every CDN.
  A webfont would have to be self-hosted via `next/font`; we are not adding one.
- **The 16px mobile input size is untouchable.** It exists to stop iOS Safari
  zooming on focus — a behavioural guard, not a visual choice.
- **Three token blocks remain.** Bare `:root`, the `prefers-color-scheme` block
  guarded by `:root:not([data-theme="light"])`, and `:root[data-theme="dark"]`.
  The structure is required by how theming works; only its bulk changes.

### Browser floor

`oklch()` requires Chrome 111+, Safari 15.4+, Firefox 113+ — Baseline since
2023. Accepted without a fallback layer: this is an internal admin tool, the
project already requires Node 22 and Next 16, and duplicating every colour in an
`@supports` block would reintroduce exactly the bulk this change removes. Worth
recording as a deliberate decision rather than an oversight.

---

## Colour

### Architecture

Three seeds drive every colour:

```css
:root {
  --accent-h: 250;      /* the rebrand knob */
  --neutral-h: 250;     /* neutrals carry a trace of the accent hue */
  --neutral-c: 0.008;   /* how much of it; 0 gives pure grey */
}
```

Semantic tokens derive from the seeds through `oklch()`. The seeds are declared
**once**, on bare `:root`, and are never overridden per theme — which is what
makes a rebrand a single edit that reaches both themes.

**On the dark blocks:** an earlier draft of this spec claimed they would shrink
to a handful of seed overrides. That was wrong, and is corrected here. Dark is
not a hue shift — its lightness values genuinely differ per token, so they
cannot derive from a seed, and CSS cannot share one declaration list between a
media query and an attribute selector. The duplication is therefore
*unavoidable*, and the honest fix is not a syntax trick but enforcement:

> A **dark-parity test** asserts that the two routes into dark mode —
> `prefers-color-scheme: dark` with no attribute, and `data-theme="dark"` —
> compute to identical values for every token.

That converts the file's standing "these must stay in sync" comment from a
warning a reader may ignore into a failing build. It is strictly better than
shrinking the blocks, because it catches drift that shorter blocks would still
allow.

Why oklch rather than HSL: its lightness channel is perceptually even, so the
same L reads as the same brightness at any hue. That is what lets the soft and
hover variants be *generated* instead of hand-picked, and what keeps a badge
from looking brighter than its neighbour purely because of its hue.

### Palette

The accent moves from hue 273 / chroma 0.22 to **hue 250 / chroma 0.16** — a
settled blue rather than a saturated indigo-violet. Restraint is the change that
reads as "designed".

Neutrals carry a trace of the accent hue (`--neutral-c: 0.008`) so surfaces feel
related rather than assembled.

Neutral chroma is expressed as a **multiple of the seed**, not as a literal per
step. This is what makes `--neutral-c: 0` actually produce pure greys — with
literals it would produce nothing at all, and the seed would be decorative.

| Role | Light | Dark |
|---|---|---|
| `--bg` | `oklch(0.982 calc(c * 0.4) h)` | `oklch(0.178 calc(c * 1.25) h)` |
| `--surface` | `oklch(1 0 0)` | `oklch(0.218 calc(c * 1.5) h)` |
| `--surface-2` | `oklch(0.962 calc(c * 0.6) h)` | `oklch(0.262 calc(c * 1.6) h)` |
| `--border` | `oklch(0.912 calc(c * 0.9) h)` | `oklch(0.322 calc(c * 1.75) h)` |
| `--text` | `oklch(0.24 calc(c * 1.9) h)` | `oklch(0.935 calc(c * 0.75) h)` |
| `--muted` | `oklch(0.53 calc(c * 2) h)` | `oklch(0.715 calc(c * 1.75) h)` |
| `--primary` | `oklch(0.545 0.16 a)` | `oklch(0.68 0.15 a)` |
| `--primary-hover` | `oklch(0.485 0.16 a)` | `oklch(0.74 0.15 a)` |
| `--primary-soft` | `oklch(0.545 0.16 a / 0.12)` | `oklch(0.68 0.15 a / 0.18)` |
| `--primary-text` | `oklch(0.44 0.15 a)` | `oklch(0.84 0.09 a)` |

(`h` = `var(--neutral-h)`, `c` = `var(--neutral-c)`, `a` = `var(--accent-h)`.
Light `--surface` is pure white by intent, so it takes no tint.)

Accent chroma stays literal: an accent is a deliberate choice per fork, and
tying its intensity to a seed would mean a rebrand had two knobs instead of one.

Semantic hues, each pinned to consistent lightness across themes so no status
colour shouts louder than another: **success 150, warning 70, danger 25,
info 235.**

**These L values are a starting point, not a guarantee.** The contrast suite
described below is the gate: implementation tunes lightness until every pair
clears WCAG AA, and the test — not a designer's eye — decides when that is true.

### Removing the gradient

`linear-gradient(135deg, var(--primary), #a855f7)` is deleted from `.brand-mark`
and `.avatar-fallback`, replaced by a flat accent. This is the highest-leverage
single change in the spec.

### The six hard-coded values

| Where | Now | Becomes |
|---|---|---|
| `.brand-mark`, `.avatar-fallback` | `#a855f7` in a gradient | removed |
| `.brand-mark`, `.avatar-fallback`, `.btn.primary` | `color: #ffffff` | `--on-accent` |
| `.theme-option.active` | `rgba(0, 0, 0, 0.08)` | `--shadow-sm` |

`--on-accent` is necessary rather than cosmetic, and is **theme-dependent**: at
light-mode accent lightness 0.545, white is right; in dark mode the accent sits
at 0.68, where white would fail AA and a dark label is correct. A fork choosing a
pale accent (yellow, lime) needs to change one token instead of hunting three
literals. The contrast suite proves both directions.

---

## Typography

Six steps replace fifteen sizes:

| Token | Size / line-height | Tracking | Weight | Used by |
|---|---|---|---|---|
| `--text-display` | 28 / 1.15 | −0.02em | 650 | stat values |
| `--text-title` | 20 / 1.25 | −0.01em | 650 | page headings |
| `--text-heading` | 17 / 1.3 | −0.005em | 650 | topbar, modal, card titles |
| `--text-body` | 14 / 1.5 | 0 | 400 | default |
| `--text-label` | 12 / 1.4 | +0.01em | 600 | field labels, chips |
| `--text-micro` | 11 / 1.4 | +0.04em | 600 caps | table headers, nav sections, badges |

`font-variant-numeric: tabular-nums` on stat values and table cells, so figures
align down a column and do not jitter as they change.

The 7 inline `fontSize` styles in the feature clients become classes. The 8th, in
`Avatar`, stays — it legitimately computes from the `size` prop.

The 16px mobile input override is preserved exactly as-is.

---

## Icons

`src/components/icons/index.tsx` — 15 icons on a 24×24 grid, 1.5px stroke,
`currentColor`, `fill="none"`, round caps and joins:

```
dashboard  users  shield  settings     modules
check      ban    user                 stat tiles, empty states
plus       menu   close   signOut      chrome
sun        moon   monitor              theme toggle
image                                  photo placeholder
```

```tsx
export type IconName = keyof typeof ICONS;
<Icon name="users" size={18} />   // name is typed — a typo fails the build
```

In `src/lib/modules.ts`, `icon: "📊"` becomes `icon: "dashboard"`, typed as
`IconName`. That file is the RBAC source of truth, so to be explicit: **only the
presentation field changes.** No key, path, or access rule is touched, and no
test asserts on `icon` — verified.

Because icons take `currentColor`, they inherit the nav link's active and hover
colours automatically, which emoji never could.

---

## Surfaces

`--shadow-sm` / `--shadow-md` / `--shadow-lg` replace the single `--shadow` and
the stray `rgba(0, 0, 0, 0.08)`. Existing radius tokens are unchanged.

---

## Testing

The 21 browser tests and 354 unit/API tests from the usability pass stay green.

### Theme assertions become relationship-based

Verified empirically: `getComputedStyle` returns `oklch(0.18 0.012 258)`
verbatim rather than converting to rgb, so the two assertions in
`tests/e2e/theme.spec.ts` pinned to `rgb(15, 17, 21)` will break.

They are not re-pinned to oklch strings. A test pinned to a literal colour breaks
on **every rebrand**, which is precisely what this boilerplate exists to make
easy. Instead they parse the L channel and assert the relationship: dark's
background is darker than light's. That survives any reskin while still failing
if the pre-paint theme script stops running — which is what the test is for.

### New: `tests/e2e/contrast.spec.ts`

Renders the real application, rasterises computed colours through a canvas to
recover true sRGB (necessary because `getComputedStyle` hands back oklch), and
asserts WCAG AA on the pairs that matter, in **both** themes:

| Pair | Minimum |
|---|---|
| `--text` on `--bg` | 4.5:1 |
| `--text` on `--surface` | 4.5:1 |
| `--muted` on `--surface` | 4.5:1 |
| `--on-accent` on `--primary` | 4.5:1 |
| `--primary-text` on `--primary-soft` over `--surface` | 4.5:1 |
| all six badge variants — `green`, `amber`, `red`, `blue`, `gray`, `indigo` — text on their own soft background over `--surface` | 4.5:1 |
| `--field-error` text on `--surface` | 4.5:1 |
| `--border-strong` on `--surface` and on `--bg` | 3:1 |
| `--border` (decorative) on `--surface` | 1.2:1 visibility floor |

**Corrected after building it.** An earlier draft claimed this suite protects
against a fork setting `--accent-h: 60` and ending up with white-on-yellow
buttons. That cannot happen: oklch holds lightness constant across hues, so
rotating the accent hue alone *cannot* change a contrast ratio — verified by
setting `--accent-h: 95` and watching every pair still pass. That is a property
worth stating plainly, because it means **rebranding by hue is safe by
construction**, not merely tested.

What the suite actually protects, each verified by deliberately breaking it:

- any edit to a lightness value (raising `--muted` to 0.75 fails three pairs)
- a change to `--on-accent`, or to an accent chroma that clips out of sRGB gamut
- drift between the two dark blocks (the parity test)

It converts "contrast was checked once, by eye" into a standing guarantee.

Alpha-composited pairs (`--primary-soft`, badge softs) are sampled *as rendered
over their parent surface*, not as their declared rgba, so the ratio reflects
what a user actually sees.

---

## Rollout

Foundation-first: CSS here is global, so the screen-by-screen order used in the
usability pass does not apply. Every commit leaves `npm run verify` green.

| # | Commit | Contents |
|---|---|---|
| 1 | Token layer | Seeds, oklch semantic tokens, `--on-accent`, shadow scale, gradient removal, the six hard-coded fixes, updated theme assertions |
| 2 | Contrast suite | `contrast.spec.ts`, and tuning the L values until it passes |
| 3 | Type scale | Tokens, applied across `globals.css`, 7 inline `fontSize` styles removed |
| 4 | Icon module | `icons/index.tsx` with all 15 icons and the `Icon` component |
| 5 | Icon adoption | 20 emoji replaced across 9 files; `modules.ts` retyped to `IconName` |
| 6 | Docs | `CLAUDE.md` restyling guidance, README |

Commit 2 comes before the type and icon work deliberately: it locks the palette
against a measurable standard before anything is built on top of it.

---

## Risks

| Risk | Mitigation |
|---|---|
| Chosen L values fail AA | Commit 2 exists precisely to catch this, before the rest is built on the palette |
| oklch unsupported on an old browser | Documented floor (Baseline 2023); accepted, with the reasoning recorded above |
| Retyping `modules.ts` disturbs RBAC | Presentation field only; no test asserts on it; the 41 RBAC API tests run unmodified |
| Hand-drawn icons look inconsistent | One grid, one stroke width, one cap style, all in a single reviewable file |
| Restyle silently breaks layout | 21 browser tests cover drawer, card tables, focus and theming behaviour |

## Rollback

Commits 3–5 revert independently. Reverting commit 1 requires reverting 2 first,
since the contrast suite asserts against the new tokens.

---

## Success criteria

1. No gradient anywhere; no hard-coded colour below the token blocks — making
   the file's header comment true for the first time.
2. Changing `--accent-h` alone visibly rebrands the app in both themes, with no
   other edit.
3. `contrast.spec.ts` passes in both themes, and fails if any lightness value
   regresses.
4. The dark-parity test passes, and fails if the two dark blocks are edited
   apart — making the file's "must stay in sync" comment enforced rather than
   advisory.
5. No emoji remain in `src/`; every icon inherits `currentColor`.
6. At most 6 font sizes are declared, plus the 16px mobile input guard.
7. `npm run verify` passes: typecheck, lint, 219 unit, build, 135 API, and 22+
   browser tests.
