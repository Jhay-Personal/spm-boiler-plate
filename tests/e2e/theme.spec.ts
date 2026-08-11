import { expect, test } from "@playwright/test";
import { signIn } from "./support/actions";

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

    // The two literals are --bg from globals.css: #0f1115 and #f5f6f8.
    await page.emulateMedia({ colorScheme: "dark" });
    expect(
      await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    ).toBe("rgb(15, 17, 21)");

    await page.emulateMedia({ colorScheme: "light" });
    expect(
      await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    ).toBe("rgb(245, 246, 248)");
  });
});
