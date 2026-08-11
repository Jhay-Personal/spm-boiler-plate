import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/actions";

// Guards the palette against accessibility regressions.
//
// Worth knowing what this can and cannot catch. Because oklch holds lightness
// constant across hues, rotating --accent-h alone CANNOT break contrast — that
// is the point of the colour space, and it is why rebranding is safe by
// construction. Verified: setting --accent-h to 95 (yellow-green) still passes.
//
// What it does catch, all verified by deliberately breaking them: an edit to
// any lightness value (raising --muted to 0.75 fails three pairs), a change to
// --on-accent, a chroma push that clips out of sRGB gamut, and drift between
// the two dark blocks.
//
// Colours are RASTERISED rather than parsed: getComputedStyle hands back
// oklch() verbatim (it does resolve calc(), but it does not convert), and
// canvas fillStyle preserves oklch too — so the only route to true sRGB is to
// paint a pixel and read it back. Painting the base colour first also makes the
// browser composite alpha exactly as a user sees it, which matters for every
// `-soft` token.

const AA_TEXT = 4.5;
const AA_UI = 3;

type Pair = { name: string; fg: string; bg: string; over?: string; min: number };

async function measure(page: Page, pairs: Pair[]) {
  return page.evaluate((specs: Pair[]) => {
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
    canvas.width = 1;
    canvas.height = 1;
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

    const luminance = ([r, g, b]: [number, number, number]): number => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };

    const results = specs.map((spec) => {
      const base = spec.over ? resolve(spec.over) : undefined;
      const bgColor = resolve(spec.bg);
      const bg = paint(bgColor, base);
      // Text is composited over its own background, so a translucent
      // foreground is measured as rendered rather than as declared.
      const fg = paint(resolve(spec.fg), base ? undefined : bgColor);
      const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
      return {
        name: spec.name,
        min: spec.min,
        ratio: Math.round(((hi! + 0.05) / (lo! + 0.05)) * 100) / 100,
      };
    });

    probe.remove();
    return results;
  }, pairs);
}

const PAIRS: Pair[] = [
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
  // A form control's boundary identifies the control, so WCAG 1.4.11 applies:
  // 3:1 against both the surface behind it and the field's own fill.
  { name: "control border on surface", fg: "--border-strong", bg: "--surface", min: AA_UI },
  { name: "control border on field fill", fg: "--border-strong", bg: "--bg", min: AA_UI },
  // A decorative separator between two surfaces has no WCAG minimum — every
  // major design system sits near 1.3:1 here, and forcing 3:1 makes a UI
  // harsh. Held to a visibility floor instead, so it cannot vanish entirely.
  { name: "decorative border on surface", fg: "--border", bg: "--surface", min: 1.2 },
];

for (const theme of ["light", "dark"] as const) {
  test(`meets WCAG AA in ${theme} mode`, async ({ page }) => {
    await signIn(page);
    await page
      .getByRole("radio", { name: theme === "light" ? "Light" : "Dark" })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

    const results = await measure(page, PAIRS);
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
  // The file has always warned that the two must stay in sync; this enforces it.
  const TOKENS = [
    "--bg", "--surface", "--surface-2", "--border", "--border-strong",
    "--text", "--muted",
    "--primary", "--primary-hover", "--primary-soft", "--primary-text",
    "--on-accent", "--success-soft", "--success-text", "--warning-soft",
    "--warning-text", "--danger", "--danger-soft", "--danger-text",
    "--danger-strong", "--info-soft", "--info-text", "--btn-hover",
    "--topbar-bg", "--overlay", "--link", "--login-glow", "--toast-accent",
    "--shadow-sm", "--shadow-md", "--shadow-lg",
  ];

  const read = () =>
    page.evaluate((tokens: string[]) => {
      const style = getComputedStyle(document.documentElement);
      return Object.fromEntries(
        tokens.map((t) => [t, style.getPropertyValue(t).trim()]),
      );
    }, TOKENS);

  await signIn(page);

  // Route A: the explicit attribute.
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const viaAttribute = await read();

  // Route B: the system preference, with no attribute at all.
  await page.getByRole("radio", { name: "System" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);
  await page.emulateMedia({ colorScheme: "dark" });
  const viaMediaQuery = await read();

  expect(viaMediaQuery).toEqual(viaAttribute);
});
