import { expect, test } from "@playwright/test";

test("evals page shows agent vs baseline, the routing fix, and the gate", async ({ page }) => {
  await page.goto("/evals");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("table", { name: /agent versus baseline/i })).toBeVisible();
  await expect(page.getByText(/v1/).first()).toBeVisible();
  await expect(page.getByText(/gate/i).first()).toBeVisible();
});
