# Confirmation Counts — Design Spec

**Status:** Approved
**Date:** 2026-08-31

## Goal

Show how many confirmations a block/transaction has on the block and transaction
detail pages. Confirmations are derived entirely from indexed data (chain tip
height − block height); no mempool/node call is involved.

## Non-goals

- No pending/unconfirmed transaction list (the mempool node exposes no endpoint
  to enumerate the pending pool — deferred until it does).
- No new DB query beyond the existing `getMaxBlockNum`.

## Convention

**Inclusion = 1 confirmation.** A block/transaction included in the latest block
has 1 confirmation; genesis with tip `N` has `N + 1`. This matches Bitcoin and
most explorers. Formally:

```
confirmations = tip === null ? 0 : max(0, tip − blockNum + 1)
```

The `max(0, …)` clamps the impossible `blockNum > tip` case to 0.

## Components

### `confirmations` helper — `apps/web/lib/format.ts`

A pure, exported function:
```ts
export function confirmations(tipNum: number | null, blockNum: number): number {
  if (tipNum === null) return 0;
  return Math.max(0, tipNum - blockNum + 1);
}
```

### Block detail page — `apps/web/app/block/[id]/page.tsx`

The page already fetches `getMaxBlockNum(db)` (as `maxNum`, for the prev/next
nav) and has `block.num`. Add a **"Confirmations"** `Field` to the info card:
`confirmations(maxNum, block.num).toLocaleString()`. No new fetch.

### Transaction detail page — `apps/web/app/transaction/[id]/page.tsx`

The page already resolves the tx's block via `getBlockByHashOrNumber(tx.blockHash)`
(`block?.num`). Add `getMaxBlockNum(db)` to the fetch, and a **"Confirmations"**
`MetaItem`: when `block` resolves, `confirmations(maxNum, block.num).toLocaleString()`;
otherwise `—`.

## Data flow

`getMaxBlockNum(db) → number | null` (existing) provides the tip. Block height
comes from the already-loaded block row. The helper combines them; no other
data is needed and no node request is made.

## Error handling

- Empty chain / `maxNum === null` → `confirmations` returns 0 (won't occur when a
  block/tx exists, but is handled).
- Transaction whose block doesn't resolve → the Confirmations field shows `—`.

## Testing

- **Unit** (`apps/web/lib/__tests__/format.test.ts`): `confirmations(10, 10) === 1`
  (latest block), `confirmations(10, 5) === 6`, `confirmations(10, 0) === 11`
  (genesis), `confirmations(null, 3) === 0`, `confirmations(5, 10) === 0` (clamp).
- **e2e** (`apps/web/e2e/explorer.spec.ts`): the seed has blocks num 0 and 1 (tip
  1), so `/block/0` shows a **Confirmations** field reading `2` and `/block/1`
  reads `1`; the transaction page for a seeded tx shows a **Confirmations** field.

## Files

```
apps/web/lib/format.ts                    modify — add confirmations()
apps/web/lib/__tests__/format.test.ts     modify — confirmations() unit tests
apps/web/app/block/[id]/page.tsx          modify — Confirmations field
apps/web/app/transaction/[id]/page.tsx    modify — getMaxBlockNum + Confirmations field
apps/web/e2e/explorer.spec.ts             modify — confirmation-count assertions
```

## Constraints

- Strict TS, ESM, `.js` import specifiers; no `any`; `console.warn`/`error` only.
- No AI attribution; no legacy-brand strings.
- No node/mempool dependency — confirmations are DB-derived.
