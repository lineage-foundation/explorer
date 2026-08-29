import { test, expect } from "@playwright/test";
import { seed } from "./seed.js";

test.beforeAll(async () => {
  await seed();
});

test("home shows stats and latest feed", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Total blocks")).toBeVisible();
  await expect(page.getByText("Latest blocks")).toBeVisible();
});

test("block detail resolves by number and by hash", async ({ page }) => {
  await page.goto("/block/1");
  await expect(page.getByRole("heading", { name: "#1" })).toBeVisible();
  await page.goto("/block/H0");
  await expect(page.getByRole("heading", { name: "#0" })).toBeVisible();
});

test("transaction detail shows resolved input address and outputs", async ({ page }) => {
  await page.goto("/transaction/t1");
  await expect(page.getByRole("heading", { name: "Outputs" })).toBeVisible();
  // addrA is short so truncateHash renders it whole (seed uses short fixture addresses).
  await expect(page.getByRole("link", { name: "addrA", exact: true })).toBeVisible();
});

test("address shows balance and history", async ({ page }) => {
  await page.goto("/address/addrB");
  await expect(page.getByText("Balance")).toBeVisible();
  // Stat renders value and unit adjacently with no separating text node: "30LNGX".
  await expect(page.getByText("30LNGX")).toBeVisible();
});

test("unknown id 404s", async ({ page }) => {
  const res = await page.goto("/block/does-not-exist-hash");
  expect(res?.status()).toBe(404);
});
