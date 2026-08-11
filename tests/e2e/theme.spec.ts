import { expect, test } from "@playwright/test";
import { signIn } from "./support/actions";

/** Lightness channel of an oklch() colour, e.g. "oklch(0.178 0.01 250)". */
function oklchLightness(value: string): number {
  const match = /oklch\(\s*([0-9.]+)/.exec(value);
  if (!match) throw new Error(`expected an oklch() colour, got: ${value}`);
  return Number(match[1]);
}

// The inline script in src/app/layout.tsx applies the stored theme before first
// paint and must carry the CSP nonce. If the nonce is ever dropped, the CSP
// blocks the script and the attribute below is simply absent after a reload —
// which is what makes this a regression test for the no-flash behaviour, not
// merely a toggle test.
//
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

    // Asserted as a relationship, not a literal. A test pinned to a specific
    // colour would break on every rebrand — which is exactly what this
    // boilerplate is built for — while proving nothing extra.
    const darkL = oklchLightness(
      await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    );
    expect(darkL).toBeLessThan(0.5);
  });

  test("keeps an explicit light choice across a reload", async ({ page }) => {
    await page.getByRole("radio", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("stores no attribute for system, leaving the OS in charge", async ({
    page,
  }) => {
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
    const dark = oklchLightness(
      await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    );

    await page.emulateMedia({ colorScheme: "light" });
    const light = oklchLightness(
      await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    );

    expect(dark).toBeLessThan(light);
    expect(light - dark).toBeGreaterThan(0.5);
  });
});
