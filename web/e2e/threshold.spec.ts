import { expect, test } from "@playwright/test";

test("dragging the threshold moves stays between lanes and updates metrics", async ({ page }) => {
  await page.goto("/");
  const slider = page.getByLabel("Confidence threshold");
  const auto = page.getByTestId("lane-teal").locator("li a");
  const held = page.getByTestId("lane-coral").locator("li a");
  const total = (await auto.count()) + (await held.count());
  expect(total).toBeGreaterThanOrEqual(24);

  await slider.fill("0");
  await expect(held).toHaveCount(0);
  await expect(page.getByText(/coded autonomously/i).first()).toBeVisible();

  await slider.fill("1");
  await expect(auto).toHaveCount(0);
  await expect(page.getByText("Nothing clears this threshold.")).toBeVisible();
});

test("the not-affiliated notice is on every page", async ({ page }) => {
  for (const path of ["/", "/evals", "/about", "/encounter/enc-01"]) {
    await page.goto(path);
    await expect(page.getByText(/Not affiliated with Akasa/).first()).toBeVisible();
  }
});
