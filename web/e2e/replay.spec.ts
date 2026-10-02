import { expect, test } from "@playwright/test";

for (const id of ["enc-01", "enc-02", "enc-03", "enc-04"]) {
  test(`walkthrough ${id} replays to a result with cited codes and an answer key`, async ({ page }) => {
    await page.goto(`/encounter/${id}`);
    await page.getByRole("button", { name: "Skip to result" }).click();
    await expect(page.getByText("Principal").first()).toBeVisible();
    await expect(page.getByText(/Answer key, written before the chart/)).toBeVisible();
    // Every code card quotes the chart.
    const quotes = page.locator('section[aria-label="Codes and decision"] button p.border-l-2');
    expect(await quotes.count()).toBeGreaterThan(2);
  });
}

test("clicking a code highlights its evidence in the chart", async ({ page }) => {
  await page.goto("/encounter/enc-01");
  await page.getByRole("button", { name: "Skip to result" }).click();
  await page.locator('section[aria-label="Codes and decision"] button[aria-pressed]').first().click();
  await expect(page.locator('mark[data-active="true"]').first()).toBeVisible();
});

test("held stays show a compliant provider query", async ({ page }) => {
  await page.goto("/encounter/enc-02");
  await page.getByRole("button", { name: "Skip to result" }).click();
  await expect(page.getByText(/Linter: compliant/).first()).toBeVisible();
  await expect(page.getByText("Clinically undetermined").first()).toBeVisible();
});

test("reduced motion shows the finished run without replaying", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/encounter/enc-04");
  await expect(page.getByText(/Answer key, written before the chart/)).toBeVisible();
  await ctx.close();
});
