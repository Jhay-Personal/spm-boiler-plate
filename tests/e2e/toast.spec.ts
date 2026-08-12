import { expect, test } from "@playwright/test";
import { signIn } from "./support/actions";

// Both tests freeze the clock rather than waiting out the real five-second
// auto-dismiss: it keeps the suite fast, and it removes the race between a
// test's own network round trip and the toast expiring underneath it.
//
// Role names are unique-constrained, so a fixed name makes these tests
// single-use: a second run hits a 409 and an error modal appears where the
// toast should be. Unique names keep them idempotent and repeat-safe —
// verified with `--repeat-each=4`.
const uniqueGroup = (prefix: string) =>
  `${prefix} ${Date.now()}-${Math.floor(Math.random() * 100000)}`;

test.describe("toasts", () => {
  test("appears on a successful save and dismisses itself", async ({ page }) => {
    await page.clock.install();
    await signIn(page);
    await page.goto("/roles");

    await page.getByRole("button", { name: "Create group" }).click();
    await page.locator("#role-form-name").fill(uniqueGroup("Toast Test"));
    await page.getByRole("button", { name: "Create group" }).last().click();

    const toast = page.getByTestId("toast");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText("Group created.");

    await page.clock.fastForward(6_000);
    await expect(toast).toHaveCount(0);
  });

  test("can be dismissed by hand", async ({ page }) => {
    // The clock is frozen here too, and for a different reason than above: it
    // removes the race between this test's own network round trip and the 5s
    // auto-dismiss. Without it, a slow save lets the toast expire on its own
    // before the click, and the test fails claiming the toast was missing —
    // which is exactly the kind of load-dependent flake that teaches people to
    // re-run CI instead of reading it. Frozen, the ONLY thing that can remove
    // the toast is the click, which is what this test is actually about.
    await page.clock.install();
    await signIn(page);
    await page.goto("/roles");

    await page.getByRole("button", { name: "Create group" }).click();
    await page.locator("#role-form-name").fill(uniqueGroup("Manual Dismiss"));
    await page.getByRole("button", { name: "Create group" }).last().click();

    const toast = page.getByTestId("toast");
    await expect(toast).toBeVisible();
    await page.getByRole("button", { name: "Dismiss notification" }).click();
    await expect(toast).toHaveCount(0);
  });
});
