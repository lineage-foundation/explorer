import { test, expect } from "@playwright/test";

test("search autocomplete suggests a block and navigates to it", async ({ page }) => {
  await page.goto("/");
  const box = page.getByRole("combobox", { name: /search/i });
  await box.fill("0");
  const option = page.getByRole("option");
  await expect(option).toContainText("Block #0");
  await option.click();
  await expect(page).toHaveURL(/\/block\/0$/);
});
