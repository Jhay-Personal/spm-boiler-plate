import { expect, test } from "@playwright/test";
import { signIn } from "./support/actions";

test.describe("inline validation", () => {
  test("shows every failing field at once and focuses the first", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Both messages, from one submit — the behaviour this whole change exists for.
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
