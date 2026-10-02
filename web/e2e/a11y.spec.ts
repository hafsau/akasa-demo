import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Audit the settled page: with reduced motion the replay shows the finished run
// and nothing is mid-fade (partially transparent text fails contrast spuriously).
test.use({ reducedMotion: "reduce" });

for (const path of ["/", "/evals", "/about", "/encounter/enc-01", "/encounter/enc-02", "/encounter/enc-03"]) {
  test(`no axe violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    if (path.startsWith("/encounter")) await expect(page.getByText(/Answer key, written before the chart/)).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}
