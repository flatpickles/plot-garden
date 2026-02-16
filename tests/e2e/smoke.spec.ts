import { expect, test } from "@playwright/test";

test("loads first sketch and supports manual render mode", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sketch\//);

  await expect(
    page.getByRole("heading", { name: "Inset Square Study", exact: true }),
  ).toBeVisible();

  await page.getByLabel("Render mode").selectOption("manual");
  await page.getByLabel("Inset").fill("1.6");

  await expect(page.getByRole("button", { name: "Render" })).toBeVisible();
});
