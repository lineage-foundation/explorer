import { test, expect } from "@playwright/test";
import { ITEM_GENESIS, SWAP_DRUID } from "./seed.js";

const ITEM = `a[href="/item/${ITEM_GENESIS}"]`;

test("header links to the items list", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation").getByRole("link", { name: "Items" }).click();
  await expect(page).toHaveURL(/\/items$/);
  await expect(page.getByRole("heading", { name: "Items" })).toBeVisible();
});

test("items list shows the item and filters by metadata", async ({ page }) => {
  await page.goto("/items");
  await expect(page.locator(ITEM)).toHaveCount(1);
  await expect(page.getByText("title: Seed Relic · medium: digital")).toBeVisible();
  // The search form works as a plain submit.
  await page.getByRole("searchbox", { name: "Search item metadata" }).fill("relic");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/items\?q=relic$/);
  await expect(page.locator(ITEM)).toHaveCount(1);
  await page.goto("/items?q=nomatch");
  await expect(page.getByText("No items match")).toBeVisible();
  await expect(page.locator(ITEM)).toHaveCount(0);
});

test("item page shows metadata, the current holder and the history", async ({ page }) => {
  await page.goto(`/item/${ITEM_GENESIS}`);
  await expect(page.getByRole("heading", { name: "Metadata" })).toBeVisible();
  await expect(page.getByText("Seed Relic", { exact: true })).toBeVisible();

  const holders = page.locator("section", { has: page.getByRole("heading", { name: "Holders" }) });
  await expect(holders.locator("tbody tr")).toHaveCount(1);
  await expect(holders.locator('a[href="/address/addrC"]')).toBeVisible(); // received it in the swap
  await expect(holders.locator('a[href="/address/addrD"]')).toHaveCount(0); // gave it away

  const history = page.locator("section", { has: page.getByRole("heading", { name: "History" }) });
  await expect(history.locator("tbody tr")).toHaveCount(2); // the swap transfer, then the creation
  await expect(history.locator("tbody tr").first().locator('a[href="/transaction/sA"]')).toBeVisible();
  await expect(history.locator(`a[href="/swap/${SWAP_DRUID}"]`)).toBeVisible();
  await expect(history.locator("tbody tr").last().getByText("created")).toBeVisible();
});

test("an ordinary transaction hash is not an item", async ({ page }) => {
  expect((await page.goto("/item/t1"))?.status()).toBe(404);
  expect((await page.goto("/item/sA"))?.status()).toBe(404); // a transfer, not a creation
});

test("address page lists items held, and omits the section when there are none", async ({ page }) => {
  await page.goto("/address/addrC");
  const held = page.locator("section", { has: page.getByRole("heading", { name: "Items held" }) });
  await expect(held.locator(ITEM)).toBeVisible();
  await expect(held).toContainText("title: Seed Relic");
  await page.goto("/address/addrD"); // gave its item away in the swap
  await expect(page.getByRole("heading", { name: "Items held" })).toHaveCount(0);
});

test("the create transaction, the transfer and the swap all link to the item", async ({ page }) => {
  await page.goto(`/transaction/${ITEM_GENESIS}`);
  await expect(page.getByText("Creates item")).toBeVisible();
  await expect(page.locator(ITEM).first()).toBeVisible();
  await page.goto("/transaction/sA");
  await expect(page.locator(ITEM).first()).toBeVisible();
  await page.goto(`/swap/${SWAP_DRUID}`);
  await expect(page.locator(ITEM).first()).toBeVisible();
});

test("item API returns the item, its holder and its history", async ({ request }) => {
  const item = await (await request.get(`/api/v1/items/${ITEM_GENESIS}`)).json();
  expect(item).toMatchObject({
    genesisHash: ITEM_GENESIS, totalAmount: "1", creator: "addrD", holderCount: 1,
    holders: [{ address: "addrC", amount: "1" }],
  });
  const transfers = await (await request.get(`/api/v1/items/${ITEM_GENESIS}/transfers`)).json();
  expect(transfers.data.map((t: { txHash: string }) => t.txHash)).toEqual(["sA", ITEM_GENESIS]);
  const held = await (await request.get("/api/v1/addresses/addrC/items")).json();
  expect(held.data).toEqual([{ genesisHash: ITEM_GENESIS, amount: "1", metadata: '{"title":"Seed Relic","medium":"digital"}' }]);
  expect((await request.get("/api/v1/items/t1")).status()).toBe(404);
});

test("an item output with no recorded amount does not break the pages that list it", async ({ page, request }) => {
  // The seed's gen1 output on addrA has a null amount.
  const res = await page.goto("/address/addrA");
  expect(res?.status()).toBe(200);
  const held = page.locator("section", { has: page.getByRole("heading", { name: "Items held" }) });
  await expect(held.locator('a[href="/item/gen1"]')).toBeVisible();
  const body = await (await request.get("/api/v1/addresses/addrA/items")).json();
  expect(body.data).toEqual([expect.objectContaining({ genesisHash: "gen1", amount: "0" })]);
});
