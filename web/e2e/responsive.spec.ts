import { expect, test } from "@playwright/test";

for (const path of ["/", "/evals", "/about", "/encounter/enc-01"]) {
  test(`no horizontal scroll on phones: ${path}`, async ({ page }) => {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
