# Confirmation Counts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a confirmation count on the block and transaction detail pages, derived from the chain tip height (inclusion = 1 confirmation), with no node/mempool call.

**Architecture:** A pure `confirmations(tipNum, blockNum)` helper in `lib/format.ts` computes `max(0, tip − height + 1)`. The block detail page already has the tip (`maxNum`) and `block.num`; the transaction page adds a `getMaxBlockNum` fetch. Each renders a "Confirmations" field.

**Tech Stack:** Next.js 15 App Router (RSC pages), `@explorer/db` (`getMaxBlockNum`), Vitest, Playwright e2e.

## Global Constraints

- Strict TypeScript (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, Bundler); ESM; every relative import uses a `.js` specifier resolving to `.ts`.
- ESLint: `@typescript-eslint/no-explicit-any` is an error; `no-console` is an error except `console.warn`/`console.error`.
- No AI attribution in commits/code/docs — commit messages carry NO `Co-Authored-By: Claude`/`Claude-Session`/Anthropic trailer. No legacy-brand strings (CI rebrand grep in `.github/workflows/ci.yml` is authoritative).
- Convention: **inclusion = 1 confirmation** — `confirmations = tip === null ? 0 : max(0, tip − blockNum + 1)`.
- No node/mempool dependency; confirmations are DB-derived from the existing `getMaxBlockNum(db) → number | null`.
- Local test DB is on port **5433** (e2e uses `DATABASE_URL=postgres://explorer:explorer@127.0.0.1:5433/explorer_test`).

## File Structure

```
apps/web/lib/format.ts                    modify — add confirmations()
apps/web/lib/__tests__/format.test.ts     modify — confirmations() unit tests
apps/web/app/block/[id]/page.tsx          modify — Confirmations field (uses existing maxNum)
apps/web/app/transaction/[id]/page.tsx    modify — getMaxBlockNum fetch + Confirmations field
apps/web/e2e/explorer.spec.ts             modify — confirmation-count assertions
```

The e2e seed (`apps/web/e2e/seed.ts`) seeds blocks num 0 (`H0`) and num 1 (`H1`) — so the tip is 1: `/block/0` → 2 confirmations, `/block/1` → 1; and tx `t0` is in block `H0` → 2 confirmations.

---

### Task 1: `confirmations` helper

**Files:**
- Modify: `apps/web/lib/format.ts`
- Test: `apps/web/lib/__tests__/format.test.ts`

**Interfaces:**
- Produces: `confirmations(tipNum: number | null, blockNum: number): number`.

- [ ] **Step 1: Write the failing test**

In `apps/web/lib/__tests__/format.test.ts`, add `confirmations` to the import from `../format.js`:
```ts
import { truncateHash, formatLngx, txTypeLabel, relativeTime, absoluteTime, confirmations } from "../format.js";
```
Then add this test inside the `describe("format", …)` block (e.g. right before its closing `});`):
```ts
  it("computes confirmations as tip - height + 1 (inclusion = 1)", () => {
    expect(confirmations(10, 10)).toBe(1); // latest block
    expect(confirmations(10, 5)).toBe(6);
    expect(confirmations(10, 0)).toBe(11); // genesis, tip 10
    expect(confirmations(null, 3)).toBe(0); // no tip
    expect(confirmations(5, 10)).toBe(0); // impossible height > tip, clamped
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm -F @explorer/web exec vitest run format`
Expected: FAIL — `confirmations` is not exported from `../format.js`.

- [ ] **Step 3: Implement the helper**

In `apps/web/lib/format.ts`, add (e.g. at the end of the file):
```ts
export function confirmations(tipNum: number | null, blockNum: number): number {
  if (tipNum === null) return 0;
  return Math.max(0, tipNum - blockNum + 1);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F @explorer/web exec vitest run format`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm -F @explorer/web typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/format.ts apps/web/lib/__tests__/format.test.ts
git commit -m "feat(web): add confirmations helper"
```

---

### Task 2: Confirmations fields + e2e

**Files:**
- Modify: `apps/web/app/block/[id]/page.tsx`
- Modify: `apps/web/app/transaction/[id]/page.tsx`
- Test: `apps/web/e2e/explorer.spec.ts`

**Interfaces:**
- Consumes: `confirmations(tipNum, blockNum)` from `lib/format.js` (Task 1); `getMaxBlockNum(db) → number | null` from `@explorer/db` (existing).

- [ ] **Step 1: Add the Confirmations field to the block detail page**

In `apps/web/app/block/[id]/page.tsx`:

(a) Add `confirmations` to the format import:
```ts
import {
  absoluteTime, relativeTime, truncateHash, txTypeLabel, formatLngx, confirmations,
} from "../../../lib/format.js";
```

(b) Add a Confirmations `Field` immediately after the existing `Transactions` field in the info-card grid:
```tsx
          <Field label="Transactions">{block.nbTx ?? 0}</Field>
          <Field label="Confirmations">{confirmations(maxNum, block.num).toLocaleString()}</Field>
```
(`maxNum` is already fetched in this page via the existing `Promise.all`.)

- [ ] **Step 2: Add the Confirmations field to the transaction detail page**

In `apps/web/app/transaction/[id]/page.tsx`:

(a) Extend the `@explorer/db` import to include `getMaxBlockNum`:
```ts
import { getTransactionByHash, getBlockByHashOrNumber, getMaxBlockNum } from "@explorer/db";
```

(b) Add `confirmations` to the format import:
```ts
import {
  absoluteTime, relativeTime, truncateHash, txTypeLabel, confirmations,
} from "../../../lib/format.js";
```

(c) Fetch the tip after resolving the block. Replace:
```ts
  const block = await getBlockByHashOrNumber(db, tx.blockHash);
```
with:
```ts
  const block = await getBlockByHashOrNumber(db, tx.blockHash);
  const maxNum = await getMaxBlockNum(db);
```

(d) Add a Confirmations `MetaItem` to the grid, right after the `Version` item:
```tsx
          <MetaItem label="Version">{tx.version}</MetaItem>
          <MetaItem label="Confirmations">{block ? confirmations(maxNum, block.num).toLocaleString() : "—"}</MetaItem>
```

- [ ] **Step 3: Typecheck and build**

Run: `pnpm -F @explorer/web typecheck`
Expected: no errors.
Run: `env -u DATABASE_URL pnpm -F @explorer/web build`
Expected: `Compiled successfully`.

- [ ] **Step 4: Write the failing e2e**

In `apps/web/e2e/explorer.spec.ts`, add a test. The `following-sibling::div` locator selects the value div next to the "Confirmations" label div (the shared `Field`/`MetaItem` shape is `<div><div>{label}</div><div>{value}</div></div>`):
```ts
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
```

- [ ] **Step 5: Run the e2e suite**

Run (this machine, DB on 5433; the `e2e` script seeds then runs Playwright):
```bash
lsof -ti tcp:8080 | xargs -r kill
DATABASE_URL=postgres://explorer:explorer@127.0.0.1:5433/explorer_test pnpm -F @explorer/web e2e
```
Expected: all e2e tests pass, including `block and transaction detail show confirmation counts`. (If chromium is missing: `pnpm -F @explorer/web exec playwright install chromium`.)

- [ ] **Step 6: Full local verification**

Run:
```bash
pnpm typecheck
pnpm lint
env -u DATABASE_URL pnpm -F @explorer/web build
# Run the same rebrand grep the CI 'verify' job runs (pattern lives in .github/workflows/ci.yml); expect no matches.
```
Expected: typecheck/lint clean, web build compiles, rebrand grep prints `CLEAN`.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/block/[id]/page.tsx" "apps/web/app/transaction/[id]/page.tsx" apps/web/e2e/explorer.spec.ts
git commit -m "feat(web): show confirmation counts on block and transaction pages"
```

- [ ] **Step 8: Push and confirm CI**

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
- `confirmations(tipNum, blockNum)` helper with inclusion=1 + null/clamp handling → Task 1. ✓
- Block detail Confirmations field (existing `maxNum`) → Task 2 Step 1. ✓
- Transaction detail: `getMaxBlockNum` fetch + Confirmations field (`—` when no block) → Task 2 Step 2. ✓
- No new DB query beyond `getMaxBlockNum`; no node call → satisfied. ✓
- Testing: unit (latest/older/genesis/null/clamp) + e2e (block 0→2, block 1→1, tx t0→2) → Tasks 1–2. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output. ✓

**Type consistency:** `confirmations(tipNum: number | null, blockNum: number): number` defined in Task 1, consumed identically in Task 2 (both pages pass `maxNum`/`block.num`). `getMaxBlockNum(db): Promise<number | null>` (existing) used consistently. ✓
