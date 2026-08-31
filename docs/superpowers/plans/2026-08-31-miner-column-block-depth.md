# Miner Column + Block Detail Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each block's miner (coinbase output address) in the blocks table, and deepen the block detail page with reward, miner, and previous/next block navigation — all from already-indexed data.

**Architecture:** Extend `getBlocks` to return the coinbase output's `scriptPublicKey` (miner) alongside the existing reward; add `getBlockCoinbaseInfo` for the detail page. The `BlockTable` gains a Miner column; the block detail page gains Reward/Miner fields and edge-guarded prev/next links.

**Tech Stack:** Drizzle (`@explorer/db`), Next.js 15 App Router (RSC pages + shared components), Vitest + @testing-library/react, Playwright e2e.

## Global Constraints

- Strict TypeScript (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, Bundler); ESM; every relative import uses a `.js` specifier resolving to `.ts`.
- ESLint: `@typescript-eslint/no-explicit-any` is an error; `no-console` is an error except `console.warn`/`console.error`.
- No AI attribution in commits/code/docs — commit messages carry NO `Co-Authored-By: Claude`/`Claude-Session`/Anthropic trailer. No legacy-brand strings (CI rebrand grep in `.github/workflows/ci.yml` is authoritative).
- Amounts are strings; LNGX via `formatLngx(raw, 2)` for the reward field (matching the existing Reward column).
- Miner = the `scriptPublicKey` of the block's coinbase (`coinbase = true`) transaction output at `n = 0`; `null` when there is none. All new reads are exact-key/`IN`-list lookups over indexed columns.
- Local test DB is on port **5433**: prefix DB-touching commands with `TEST_DATABASE_URL=postgres://explorer:explorer@127.0.0.1:5433/explorer_test` (and `DATABASE_URL=…` for e2e).

## File Structure

```
packages/db/src/queries.ts                            modify — BlockListItem.miner; getBlocks miner; getBlockCoinbaseInfo
packages/db/src/queries.test.ts                       modify — miner + getBlockCoinbaseInfo tests
apps/web/app/components/BlockTable.tsx                 modify — Miner column + 6-col colgroup
apps/web/app/components/__tests__/BlockTable.test.tsx  create — miner cell renders link / em dash
apps/web/app/block/[id]/page.tsx                       modify — Reward/Miner fields + prev/next nav
apps/web/e2e/explorer.spec.ts                          modify — block-detail depth assertions
```

Existing fixtures already support the tests: `queries.test.ts` seeds block `b_hash_2` (num 2) whose coinbase `tx_cb` has an output `{ scriptPublicKey: "miner", amount: "1000", n: 0 }`, and block `b_hash_1` (num 1) with no coinbase output. The e2e seed (`apps/web/e2e/seed.ts`) seeds block `H0` (num 0, coinbase `cb0` with output `scriptPublicKey: "addrA"`) and block `H1` (num 1, coinbase `cb1` with no output).

---

### Task 1: Data layer — `miner` on `getBlocks` + `getBlockCoinbaseInfo`

**Files:**
- Modify: `packages/db/src/queries.ts`
- Test: `packages/db/src/queries.test.ts`

**Interfaces:**
- Modifies: `BlockListItem` gains `miner: string | null` (after `reward`).
- Produces: `getBlockCoinbaseInfo(db: Database, blockHash: string): Promise<{ reward: string | null; miner: string | null }>`.
- Consumes: existing `block`, `transaction`, `txOut` schema tables and the `and`, `eq`, `inArray`, `sql`, `desc`, `asc` drizzle helpers already imported in this file.

- [ ] **Step 1: Write the failing tests**

In `packages/db/src/queries.test.ts`, add `getBlockCoinbaseInfo` to the import from `./queries.js`, then replace the existing reward test and add a coinbase-info test:
```ts
  it("includes each block's coinbase reward and miner", async () => {
    const res = await getBlocks(db(), { limit: 10, offset: 0, order: "desc" });
    const b2 = res.blocks.find((b) => b.num === 2);
    const b1 = res.blocks.find((b) => b.num === 1);
    expect(b2?.reward).toBe("1000"); // block 2 coinbase tx_cb (1000)
    expect(b2?.miner).toBe("miner"); // tx_cb output scriptPublicKey
    expect(b1?.reward).toBeNull(); // block 1 has no coinbase output
    expect(b1?.miner).toBeNull();
  });

  it("returns a block's coinbase reward and miner, or nulls", async () => {
    expect(await getBlockCoinbaseInfo(db(), "b_hash_2")).toEqual({ reward: "1000", miner: "miner" });
    expect(await getBlockCoinbaseInfo(db(), "b_hash_1")).toEqual({ reward: null, miner: null });
  });
```
(Delete the previous `it("includes each block's coinbase reward", …)` test — the new one supersedes it.)

- [ ] **Step 2: Run to verify it fails**

Run: `TEST_DATABASE_URL=postgres://explorer:explorer@127.0.0.1:5433/explorer_test pnpm -F @explorer/db exec vitest run queries`
Expected: FAIL — `getBlockCoinbaseInfo` is not exported and `b2.miner` is undefined.

- [ ] **Step 3: Add `miner` to `BlockListItem`**

In `packages/db/src/queries.ts`, change the interface:
```ts
export interface BlockListItem {
  version: number; num: number; hash: string; previousHash: string | null;
  timestamp: Date | null; nbTx: number | null; reward: string | null; miner: string | null;
}
```

- [ ] **Step 4: Populate `miner` in `getBlocks`**

In `getBlocks`, after the `rewardByHash` map is built and before the `return`, add the miner lookup and include it in the mapped rows. Replace:
```ts
  const rewardByHash = new Map(rewards.map((r) => [r.blockHash, r.reward]));
  return {
    blocks: rows.map((r) => ({ ...r, reward: rewardByHash.get(r.hash) ?? null })),
    pagination: { total, limit, offset, hasMore: offset + limit < total },
  };
}
```
with:
```ts
  const rewardByHash = new Map(rewards.map((r) => [r.blockHash, r.reward]));
  // Miner = the address on the coinbase transaction's first output.
  const miners = blockHashes.length
    ? await db
        .select({ blockHash: transaction.blockHash, address: txOut.scriptPublicKey })
        .from(transaction)
        .innerJoin(txOut, eq(txOut.txHash, transaction.hash))
        .where(and(
          inArray(transaction.blockHash, blockHashes),
          eq(transaction.coinbase, true),
          eq(txOut.n, 0),
        ))
    : [];
  const minerByHash = new Map(miners.map((m) => [m.blockHash, m.address]));
  return {
    blocks: rows.map((r) => ({
      ...r, reward: rewardByHash.get(r.hash) ?? null, miner: minerByHash.get(r.hash) ?? null,
    })),
    pagination: { total, limit, offset, hasMore: offset + limit < total },
  };
}
```

- [ ] **Step 5: Add `getBlockCoinbaseInfo`**

In `packages/db/src/queries.ts`, add (e.g. right after `getBlocks`):
```ts
export async function getBlockCoinbaseInfo(
  db: Database,
  blockHash: string,
): Promise<{ reward: string | null; miner: string | null }> {
  const [rewardRow] = await db
    .select({ reward: sql<string | null>`sum(${txOut.amount})` })
    .from(transaction)
    .innerJoin(txOut, eq(txOut.txHash, transaction.hash))
    .where(and(eq(transaction.blockHash, blockHash), eq(transaction.coinbase, true)));
  const [minerRow] = await db
    .select({ address: txOut.scriptPublicKey })
    .from(transaction)
    .innerJoin(txOut, eq(txOut.txHash, transaction.hash))
    .where(and(
      eq(transaction.blockHash, blockHash),
      eq(transaction.coinbase, true),
      eq(txOut.n, 0),
    ))
    .limit(1);
  return { reward: rewardRow?.reward ?? null, miner: minerRow?.address ?? null };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `TEST_DATABASE_URL=postgres://explorer:explorer@127.0.0.1:5433/explorer_test pnpm -F @explorer/db exec vitest run queries`
Expected: PASS (including the two new/updated tests).

- [ ] **Step 7: Typecheck**

Run: `pnpm -F @explorer/db typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/db/src/queries.ts packages/db/src/queries.test.ts
git commit -m "feat(db): expose block miner on getBlocks and add getBlockCoinbaseInfo"
```

---

### Task 2: Blocks table Miner column

**Files:**
- Modify: `apps/web/app/components/BlockTable.tsx`
- Test: `apps/web/app/components/__tests__/BlockTable.test.tsx`

**Interfaces:**
- Consumes: `BlockListItem` (now with `miner: string | null`) from `@explorer/db`; `truncateHash` from `lib/format.js`.
- Produces: no new exports; the rendered table gains a Miner column.

- [ ] **Step 1: Write the failing test**

`apps/web/app/components/__tests__/BlockTable.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

import { BlockTable } from "../BlockTable.js";

const base = { version: 1, previousHash: null, timestamp: new Date(), nbTx: 1, reward: "72072000" };

describe("BlockTable", () => {
  it("renders the miner as a link to the address", () => {
    render(<BlockTable blocks={[{ ...base, num: 5, hash: "b5", miner: "addrA" }]} />);
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/address/addrA");
  });

  it("shows an em dash when the miner is unknown", () => {
    render(<BlockTable blocks={[{ ...base, num: 6, hash: "b6", miner: null }]} />);
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs).not.toContain("/address/null");
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F @explorer/web exec vitest run BlockTable`
Expected: FAIL — no `/address/addrA` link (no Miner column yet).

- [ ] **Step 3: Add the Miner column**

Replace the contents of `apps/web/app/components/BlockTable.tsx` with:
```tsx
import Link from "next/link";
import type { BlockListItem } from "@explorer/db";
import {
  Table, THead, TBody, TR, TH, TD, Mono,
} from "@explorer/ui";
import { relativeTime, truncateHash, formatLngx } from "../../lib/format.js";

export function BlockTable({ blocks }: { blocks: BlockListItem[] }) {
  return (
    <Table fixed>
      <colgroup>
        <col style={{ width: "12%" }} />
        <col style={{ width: "22%" }} />
        <col style={{ width: "22%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "22%" }} />
        <col style={{ width: "12%" }} />
      </colgroup>
      <THead>
        <TR><TH>Block</TH><TH>Hash</TH><TH>Miner</TH><TH>Txns</TH><TH>Reward</TH><TH>Age</TH></TR>
      </THead>
      <TBody>
        {blocks.map((b) => (
          <TR key={b.hash}>
            <TD>
              <Link href={`/block/${b.num}`} className="text-link hover:text-link-hover">
                <Mono>{`#${b.num.toLocaleString()}`}</Mono>
              </Link>
            </TD>
            <TD className="truncate">
              <Link href={`/block/${b.hash}`} className="text-link hover:text-link-hover">
                <Mono>{truncateHash(b.hash)}</Mono>
              </Link>
            </TD>
            <TD className="truncate">
              {b.miner
                ? (
                  <Link href={`/address/${b.miner}`} className="text-link hover:text-link-hover">
                    <Mono>{truncateHash(b.miner)}</Mono>
                  </Link>
                )
                : <span className="text-text-subtle">—</span>}
            </TD>
            <TD><Mono>{b.nbTx ?? 0}</Mono></TD>
            <TD><Mono>{b.reward === null ? "—" : formatLngx(b.reward, 2)}</Mono></TD>
            <TD><span suppressHydrationWarning className="text-text-muted">{relativeTime(b.timestamp)}</span></TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -F @explorer/web exec vitest run BlockTable`
Expected: PASS (2 tests). Then the full web unit suite: `pnpm -F @explorer/web test` — expect all passing (the `LatestFeed` test snapshot already includes `reward`; it does NOT set `miner`, so confirm it still type-checks — see Step 5).

- [ ] **Step 5: Update the LatestFeed test fixture for the new field**

The `LatestFeed` test builds a block snapshot inline; `BlockListItem` now requires `miner`. In `apps/web/app/components/__tests__/LatestFeed.test.tsx`, add `miner: "addrA"` to the block object in the `snap` fixture (the object that already has `reward: "72072000"`). Re-run `pnpm -F @explorer/web test` — expect all passing.

- [ ] **Step 6: Typecheck**

Run: `pnpm -F @explorer/web typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/components/BlockTable.tsx apps/web/app/components/__tests__/BlockTable.test.tsx apps/web/app/components/__tests__/LatestFeed.test.tsx
git commit -m "feat(web): add miner column to the blocks table"
```

---

### Task 3: Block detail depth — reward, miner, prev/next nav

**Files:**
- Modify: `apps/web/app/block/[id]/page.tsx`
- Test: `apps/web/e2e/explorer.spec.ts`

**Interfaces:**
- Consumes: `getBlockCoinbaseInfo`, `getMaxBlockNum` from `@explorer/db` (Task 1 + existing); `formatLngx`, `truncateHash` from `lib/format.js`.

- [ ] **Step 1: Add reward/miner fetch, fields, and prev/next nav**

In `apps/web/app/block/[id]/page.tsx`:

(a) Extend the `@explorer/db` import to include the two functions:
```ts
import { getBlockByHashOrNumber, getBlockTransactions, getBlockCoinbaseInfo, getMaxBlockNum } from "@explorer/db";
```

(b) Add `formatLngx` to the format import:
```ts
import {
  absoluteTime, relativeTime, truncateHash, txTypeLabel, formatLngx,
} from "../../../lib/format.js";
```

(c) Replace the data-fetch lines
```ts
  const block = await getBlockByHashOrNumber(db, id);
  if (!block) notFound();
  const txs = (await getBlockTransactions(db, id))?.transactions ?? [];
```
with:
```ts
  const block = await getBlockByHashOrNumber(db, id);
  if (!block) notFound();
  const [txsRes, coinbase, maxNum] = await Promise.all([
    getBlockTransactions(db, id),
    getBlockCoinbaseInfo(db, block.hash),
    getMaxBlockNum(db),
  ]);
  const txs = txsRes?.transactions ?? [];
```

(d) Add the prev/next nav row immediately after the `<PageHeader … />` line:
```tsx
      <PageHeader eyebrow="Block" title={`#${block.num.toLocaleString()}`} />
      <div className="flex items-center justify-between text-sm">
        {block.num > 0
          ? (
            <Link
              href={`/block/${block.num - 1}`}
              className="rounded-md border border-border px-3 py-1.5 text-text-muted hover:text-text"
            >
              {`← Block #${(block.num - 1).toLocaleString()}`}
            </Link>
          )
          : <span />}
        {maxNum !== null && block.num < maxNum
          ? (
            <Link
              href={`/block/${block.num + 1}`}
              className="rounded-md border border-border px-3 py-1.5 text-text-muted hover:text-text"
            >
              {`Block #${(block.num + 1).toLocaleString()} →`}
            </Link>
          )
          : <span />}
      </div>
```

(e) Add Reward and Miner fields to the info-card grid — insert after the `Transactions` field:
```tsx
          <Field label="Transactions">{block.nbTx ?? 0}</Field>
          <Field label="Reward">{coinbase.reward === null ? "—" : `${formatLngx(coinbase.reward, 2)} LNGX`}</Field>
          <Field label="Miner">
            {coinbase.miner
              ? (
                <Link href={`/address/${coinbase.miner}`} className="text-link hover:text-link-hover">
                  {truncateHash(coinbase.miner, 10, 8)}
                </Link>
              )
              : "—"}
          </Field>
```

- [ ] **Step 2: Typecheck and build**

Run: `pnpm -F @explorer/web typecheck`
Expected: no errors.
Run: `env -u DATABASE_URL pnpm -F @explorer/web build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Write the failing e2e**

In `apps/web/e2e/explorer.spec.ts`, add a test:
```ts
test("block detail shows reward, miner, and prev/next navigation", async ({ page }) => {
  // Genesis: reward + miner present, a next link to block 1, and no prev link.
  await page.goto("/block/0");
  await expect(page.getByText("Reward")).toBeVisible();
  await expect(page.getByText("Miner")).toBeVisible();
  await expect(page.getByRole("link", { name: /Block #1/ })).toHaveAttribute("href", "/block/1");
  await expect(page.getByRole("link", { name: /← Block/ })).toHaveCount(0);
  // Latest indexed block (1): a prev link to block 0.
  await page.goto("/block/1");
  await expect(page.getByRole("link", { name: /← Block #0/ })).toHaveAttribute("href", "/block/0");
});
```

- [ ] **Step 4: Run the e2e suite**

Run (this machine, DB on 5433; the `e2e` script seeds then runs Playwright):
```bash
lsof -ti tcp:8080 | xargs -r kill
DATABASE_URL=postgres://explorer:explorer@127.0.0.1:5433/explorer_test pnpm -F @explorer/web e2e
```
Expected: all e2e tests pass, including `block detail shows reward, miner, and prev/next navigation`. (If chromium is missing: `pnpm -F @explorer/web exec playwright install chromium`.)

- [ ] **Step 5: Full local verification**

Run:
```bash
pnpm typecheck
pnpm lint
env -u DATABASE_URL pnpm -F @explorer/web build
# Run the same rebrand grep the CI 'verify' job runs (pattern lives in .github/workflows/ci.yml); expect no matches.
```
Expected: typecheck/lint clean, web build compiles, rebrand grep prints `CLEAN`.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/block/[id]/page.tsx" apps/web/e2e/explorer.spec.ts
git commit -m "feat(web): add reward, miner, and prev/next nav to block detail"
```

- [ ] **Step 7: Push and confirm CI**

```bash
git push origin main
```
Watch to green (both `verify` and `e2e` jobs):
```bash
gh run watch "$(gh run list --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status --compact
```
Expected: `verify` and `e2e` both succeed.

---

## Self-Review

**Spec coverage:**
- Miner definition (coinbase output n=0 scriptPublicKey) → Task 1 (getBlocks + getBlockCoinbaseInfo). ✓
- `getBlocks` gains `miner`; `getBlockCoinbaseInfo` added → Task 1. ✓
- Blocks table Miner column (keep Hash → 6 cols) + colgroup widths → Task 2. ✓
- Block detail Reward + Miner fields + prev/next nav hidden at genesis/latest → Task 3. ✓
- No size (out of scope) → not implemented. ✓
- Testing: db (miner + coinbase info), web (BlockTable miner cell), e2e (detail depth) → Tasks 1–3. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output. The one inline correction (`toBeGreaterThan`) is spelled out. ✓

**Type consistency:** `BlockListItem.miner: string | null` defined in Task 1, consumed by Task 2 (BlockTable) and the LatestFeed fixture (Task 2 Step 5). `getBlockCoinbaseInfo(db, blockHash) → { reward, miner }` defined Task 1, consumed Task 3. `getMaxBlockNum(db) → number | null` (existing) used for the next-nav guard. `formatLngx(raw, 2)` used consistently. ✓
