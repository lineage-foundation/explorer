import { test, expect } from "@playwright/test";
import { SWAP_DRUID, ODD_DRUID } from "./seed.js";

test("home feed shows the trade as one row", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(`a[href="/trade/${SWAP_DRUID}"]`)).toHaveCount(1);
  // Neither half appears as a row of its own.
  await expect(page.locator('a[href="/transaction/sA"]')).toHaveCount(0);
  await expect(page.locator('a[href="/transaction/sB"]')).toHaveCount(0);
});

test("transactions list collapses the trade and keeps ordinary rows", async ({ page }) => {
  await page.goto("/transactions");
  const row = page.locator("tr", { has: page.locator(`a[href="/trade/${SWAP_DRUID}"]`) });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("4 LNGX ⇄ 1 item");
  await expect(page.locator('a[href="/transaction/f1"]')).toHaveCount(1);
});

test("block page lists the trade once", async ({ page }) => {
  await page.goto("/block/1");
  await expect(page.locator(`a[href="/trade/${SWAP_DRUID}"]`)).toHaveCount(1);
  await expect(page.locator('a[href="/transaction/sA"]')).toHaveCount(0);
});

test("trade page shows both legs and both halves", async ({ page }) => {
  await page.goto(`/trade/${SWAP_DRUID}`);
  await expect(page.getByRole("heading", { name: "Legs" })).toBeVisible();
  await expect(page.getByText("4 LNGX", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("met", { exact: true })).toHaveCount(2);
  await expect(page.getByText("incomplete")).toHaveCount(0);
  await expect(page.getByText("2 / 2")).toBeVisible();
  await expect(page.locator('a[href="/transaction/sA"]')).toBeVisible();
  await expect(page.locator('a[href="/transaction/sB"]')).toBeVisible();
});

test("an unknown trade 404s", async ({ page }) => {
  const res = await page.goto("/trade/DRUID0xdoesnotexist");
  expect(res?.status()).toBe(404);
});

test("each half links to its counterpart and to the trade", async ({ page }) => {
  await page.goto("/transaction/sA");
  await expect(page.getByText("Half of a two-way trade")).toBeVisible();
  await expect(page.locator('a[href="/transaction/sB"]')).toBeVisible();
  await expect(page.locator(`a[href="/trade/${SWAP_DRUID}"]`)).toBeVisible();
  // The item half moves no tokens, and its item is never shown as LNGX.
  await expect(page.getByText("0 LNGX in")).toBeVisible();
  await expect(page.getByText(/0\.0+1 LNGX/)).toHaveCount(0);
  await page.goto("/transaction/sB");
  await expect(page.locator('a[href="/transaction/sA"]')).toBeVisible();
});

test("address page shows what was given and received", async ({ page }) => {
  await page.goto("/address/addrD");
  const row = page.locator("tr", { has: page.locator(`a[href="/trade/${SWAP_DRUID}"]`) });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("−1 item");
  await expect(row).toContainText("+4 LNGX");
  // Running token balance after the swap: the 4 LNGX received.
  await expect(row.locator("td").nth(3)).toHaveText("4.00");
});

test("searching a DRUID goes to its trade", async ({ page }) => {
  await page.goto("/");
  const box = page.getByRole("combobox", { name: /search/i });
  await box.fill(SWAP_DRUID);
  const option = page.getByRole("option");
  await expect(option).toContainText("Trade");
  await option.click();
  await expect(page).toHaveURL(new RegExp(`/trade/${SWAP_DRUID}$`));
});

test("trade API returns the trade", async ({ request }) => {
  const res = await request.get(`/api/v1/trades/${SWAP_DRUID}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ druid: SWAP_DRUID, complete: true, transactions: ["sA", "sB"] });
});

test("a trade with a non-canonical DRUID is reachable from the list, by page and by API", async ({ page, request }) => {
  const path = `/trade/${encodeURIComponent(ODD_DRUID)}`;
  // The list links to it with the DRUID URL-encoded, and following the link works.
  await page.goto("/transactions");
  await page.locator(`a[href="${path}"]`).click();
  await expect(page.getByRole("heading", { name: "Legs" })).toBeVisible();
  await expect(page.getByText(ODD_DRUID, { exact: true })).toBeVisible();
  await expect(page.getByText("met", { exact: true })).toHaveCount(2);
  await expect(page.locator('a[href="/transaction/oA"]')).toBeVisible();
  // Directly, too.
  const direct = await page.goto(path);
  expect(direct?.status()).toBe(200);
  // And through the public API.
  const res = await request.get(`/api/v1/trades/${encodeURIComponent(ODD_DRUID)}`);
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ druid: ODD_DRUID, complete: true });
  // Each half's banner links back to the same encoded path.
  await page.goto("/transaction/oA");
  await expect(page.locator(`a[href="${path}"]`)).toBeVisible();
});

test("the old swap URLs redirect to their trade equivalents", async ({ request }) => {
  const api = await request.get(`/api/v1/swaps/${SWAP_DRUID}`, { maxRedirects: 0 });
  expect(api.status()).toBe(308);
  expect(api.headers()["location"]).toBe(`/api/v1/trades/${SWAP_DRUID}`);
  const list = await request.get("/api/v1/swaps?limit=1");
  expect(list.ok()).toBe(true);
  const page = await request.get(`/swap/${SWAP_DRUID}`, { maxRedirects: 0 });
  expect(page.headers()["location"]).toBe(`/trade/${SWAP_DRUID}`);
});
