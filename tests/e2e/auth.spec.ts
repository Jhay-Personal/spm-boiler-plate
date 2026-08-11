import { expect, test } from "@playwright/test";
import { TEST_ADMIN_EMAIL, signIn } from "./support/actions";

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
  });

  test("sends a signed-out browser to the login page", async ({ page }) => {
    await page.goto("/users");
    await expect(page).toHaveURL(/\/login/);
  });
});
