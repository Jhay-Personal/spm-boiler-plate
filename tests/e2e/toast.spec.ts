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
