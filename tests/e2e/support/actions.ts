import { expect, type Page } from "@playwright/test";
import { TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD } from "../../support/server";

export { TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD };

// The #login-* ids come from Field's `${formId}-${name}` convention, which is
// what makes these selectors stable rather than tied to label wording.

/** Signs in as the seeded super admin and waits for the dashboard to render. */
export async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#login-identifier").fill(TEST_ADMIN_EMAIL);
  await page.locator("#login-password").fill(TEST_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}
