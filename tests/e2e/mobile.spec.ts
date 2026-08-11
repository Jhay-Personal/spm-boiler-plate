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
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });
});
