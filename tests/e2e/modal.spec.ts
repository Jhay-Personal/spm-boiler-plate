import { expect, test } from "@playwright/test";
import { signIn } from "./support/actions";

/** Where focus is now, or null when it is still inside the dialog. */
async function focusEscapedTo(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[role="dialog"]');
    const el = document.activeElement as HTMLElement | null;
    if (panel && el && panel.contains(el)) return null;
    return el?.id || el?.getAttribute("aria-label") || el?.tagName || "unknown";
  });
}

test.describe("modal focus management", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto("/users");
  });

  // Checked after EVERY press rather than once at the end. An untrapped dialog
  // lets focus out for a stretch and then wraps it back in — with this dialog,
  // out at press 10 and back at press 23 — so a single check after N presses
  // passes or fails purely on the value of N. This version cannot.
  for (const [name, key] of [
    ["Tab", "Tab"],
    ["Shift+Tab", "Shift+Tab"],
  ] as const) {
    test(`keeps ${name} inside the dialog`, async ({ page }) => {
      await page.getByRole("button", { name: "Add user" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();

      const escaped: string[] = [];
      for (let i = 0; i < 25; i += 1) {
        await page.keyboard.press(key);
        const outside = await focusEscapedTo(page);
        if (outside) escaped.push(`press ${i}: ${outside}`);
      }

      expect(escaped).toEqual([]);
    });
  }

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

  test("does not close when a text selection is dragged out of it", async ({
    page,
  }) => {
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
