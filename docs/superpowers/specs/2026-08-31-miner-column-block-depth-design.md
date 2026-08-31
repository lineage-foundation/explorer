# Miner Column + Block Detail Depth — Design Spec

**Status:** Approved
**Date:** 2026-08-31

## Goal

Surface the block's **miner** (the address that receives the coinbase reward) in
the blocks table, and deepen the block detail page with **reward**, **miner**,
and **previous/next block navigation**. All from data already indexed — no
schema or indexer change.

## Non-goals

- Block byte size (not stored; the node payload carries none). Explicitly out.
- Any indexer/schema/migration change.

## Definitions

- **Miner** = the `scriptPublicKey` of the block's coinbase (mining) transaction
  output. The coinbase tx is the one with `coinbase = true` for that block (its
  hash is `block.nonceAndMiningTxHash[1]`). If it has multiple outputs, use the
  first by `n`.
- **Reward** = the sum of the coinbase transaction's output amounts (already
  computed by `getBlocks`).

## Data layer (`packages/db/src/queries.ts`)

1. **`getBlocks` gains `miner`.** The existing reward subquery groups coinbase
   outputs by `blockHash` and sums `amount`. Extend it to also return the
   coinbase output's `scriptPublicKey` (the address at the lowest `n`). Add
   `miner: string | null` to `BlockListItem`. Approach: after the block rows are
   fetched, one grouped query over `transaction ⋈ tx_out` where
   `coinbase = true AND blockHash IN (…)`, selecting `blockHash`,
   `sum(amount) AS reward`, and the `scriptPublicKey` of the `n = 0` output
   (via `min(n)`-keyed lookup or a correlated pick). Concretely: keep the reward
   aggregate, and add a second small query selecting `blockHash, scriptPublicKey`
   from the coinbase outputs at `n = 0`, mapped by `blockHash`. Both keyed into
   the returned rows.

2. **`getBlockCoinbaseInfo(db, blockHash): Promise<{ reward: string | null; miner: string | null }>`.**
   New query for the detail page (which loads the raw `Block` via
   `getBlockByHashOrNumber` and has neither field). Sums the block's coinbase
   outputs for `reward` and reads the `n = 0` coinbase output's
   `scriptPublicKey` for `miner`. Returns `{ reward: null, miner: null }` when
   the block has no coinbase output.

3. **`getMaxBlockNum`** (exists) bounds the "next" navigation.

`BlockListItem` final shape adds `miner: string | null` (after `reward`).

## Blocks table (`apps/web/app/components/BlockTable.tsx`)

Add a **Miner** column, keeping Hash → columns become
`Block · Hash · Miner · Txns · Reward · Age` (6). Miner renders truncated and
links to `/address/{miner}`; `—` when null. Switch the `colgroup` widths so the
six columns fit the homepage's ~552px feed column without horizontal scroll
(and scale up on the full-width `/blocks` page), e.g. Block 12%, Hash 22%,
Miner 22%, Txns 10%, Reward 22%, Age 12%. All columns stay left-aligned
(consistent with the current table). Used by both the homepage feed and
`/blocks`.

## Block detail page (`apps/web/app/block/[id]/page.tsx`)

1. **Info card gains two fields:** **Reward** (`formatLngx(reward, 2)` LNGX, or
   `—`) and **Miner** (truncated, linked to `/address/{miner}`, or `—`), sourced
   from `getBlockCoinbaseInfo(db, block.hash)`.

2. **Prev/next navigation** — a row above or below the info card with:
   - `← Block #{num − 1}` linking to `/block/{num − 1}`, shown only when
     `num > 0`.
   - `Block #{num + 1} →` linking to `/block/{num + 1}`, shown only when
     `num < max` (from `getMaxBlockNum`).
   At the genesis block only "next" shows; at the latest block only "prev"
   shows. Styled like the existing bordered link controls (see `Pagination`).

The page already fetches `block` and `txs`; it additionally fetches
`getBlockCoinbaseInfo(db, block.hash)` and `getMaxBlockNum(db)` (all in the
existing `await` flow / `Promise.all`).

## Error handling

- Missing coinbase output → reward/miner render as `—` (never throw).
- Prev/next links are plain navigation; if a target block is missing the target
  page's `notFound()` handles it, but the edge guards (`num > 0`,
  `num < max`) prevent that in normal operation.

## Testing

- **DB** (`packages/db/src/queries.test.ts`): `getBlocks` returns the coinbase
  `miner` for the fixture block whose coinbase (`tx_cb`) has an output
  (`scriptPublicKey: "miner"`), and `null` for a block with no coinbase output;
  `getBlockCoinbaseInfo` returns `{ reward: "1000", miner: "miner" }` for that
  block and `{ reward: null, miner: null }` for a block without one.
- **Web** (`apps/web/app/components/__tests__/BlockTable.test.tsx`, new or
  extended): the table renders a miner cell linking to `/address/{miner}` and
  `—` when the miner is null.
- **e2e** (`apps/web/e2e/explorer.spec.ts` or the block spec): on a block detail
  page, the Reward and Miner fields are present and the prev/next links point to
  the adjacent block numbers (and the genesis page has no "prev").

## Files

```
packages/db/src/queries.ts                            modify — BlockListItem.miner, getBlocks miner, getBlockCoinbaseInfo
packages/db/src/queries.test.ts                       modify — miner + getBlockCoinbaseInfo tests
apps/web/app/components/BlockTable.tsx                 modify — Miner column + colgroup widths
apps/web/app/components/__tests__/BlockTable.test.tsx  create/modify — miner cell test
apps/web/app/block/[id]/page.tsx                       modify — reward/miner fields + prev/next nav
apps/web/e2e/explorer.spec.ts                          modify — block-detail depth assertions
```

## Constraints

- Strict TS, ESM, `.js` import specifiers; no `any`; `console.warn`/`error` only.
- No AI attribution; no legacy-brand strings.
- Amounts are strings; LNGX via `formatLngx` (2dp for the reward field, matching
  the existing Reward column).
- All new DB reads are exact-key/`IN`-list lookups over already-indexed columns
  (no new scan surface).
