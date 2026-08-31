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

test("block detail shows reward, miner, and prev/next navigation", async ({ page }) => {
  // Genesis: reward + miner present, a next link to block 1, and no prev link.
  await page.goto("/block/0");
  await expect(page.getByText("Reward")).toBeVisible();
  await expect(page.getByText("Miner")).toBeVisible();
  await expect(page.getByRole("link", { name: /Block #1/ })).toHaveAttribute("href", "/block/1");
  await expect(page.getByRole("link", { name: /← Block/ })).toHaveCount(0);
  // Miner field links to the coinbase output address.
  await expect(page.getByRole("link", { name: "addrA" })).toHaveAttribute("href", "/address/addrA");
  // Latest indexed block (1): a prev link to block 0.
  await page.goto("/block/1");
  await expect(page.getByRole("link", { name: /← Block #0/ })).toHaveAttribute("href", "/block/0");
  // Latest block: no "next" link.
  await expect(page.getByRole("link", { name: /Block #2/ })).toHaveCount(0);
});

test("transaction detail shows resolved input address and outputs", async ({ page }) => {
  await page.goto("/transaction/t1");
  await expect(page.getByRole("heading", { name: "Outputs" })).toBeVisible();
  // addrA is short so truncateHash renders it whole (seed uses short fixture addresses).
  await expect(page.getByRole("link", { name: "addrA", exact: true })).toBeVisible();
});

test("coinbase transaction shows the newly minted note", async ({ page }) => {
  await page.goto("/transaction/cb0");
  await expect(page.getByText(/newly minted/i).first()).toBeVisible();
});

test("transaction with an item output shows an item tag", async ({ page }) => {
  await page.goto("/transaction/t0");
  await expect(page.getByText("item", { exact: true })).toBeVisible();
});

test("address shows balance and history", async ({ page }) => {
  await page.goto("/address/addrB");
  await expect(page.getByText("Balance")).toBeVisible();
  // Stat renders the value and unit with a space between them: "30 LNGX".
  await expect(page.getByText("30 LNGX")).toBeVisible();
});

test("unknown id 404s", async ({ page }) => {
  const res = await page.goto("/block/does-not-exist-hash");
  expect(res?.status()).toBe(404);
});

test("block and transaction detail show confirmation counts", async ({ page }) => {
  // Tip is block 1 (seed). Genesis (block 0) => 1 - 0 + 1 = 2 confirmations.
  await page.goto("/block/0");
  await expect(
    page.getByText("Confirmations", { exact: true }).locator("xpath=following-sibling::div"),
  ).toHaveText("2");
  // Latest block (1) => 1 confirmation.
  await page.goto("/block/1");
  await expect(
    page.getByText("Confirmations", { exact: true }).locator("xpath=following-sibling::div"),
  ).toHaveText("1");
  // Transaction t0 is in block 0 => 2 confirmations.
  await page.goto("/transaction/t0");
  await expect(
    page.getByText("Confirmations", { exact: true }).locator("xpath=following-sibling::div"),
  ).toHaveText("2");
});
