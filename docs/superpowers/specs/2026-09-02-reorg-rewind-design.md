# Incremental Reorg Rewind — Design Spec

**Status:** Draft (for review)
**Date:** 2026-09-02

## Goal

When the source chain diverges from indexed data by a small number of blocks (a
shallow reorg near the tip), rewind and replay only the affected tail instead of
wiping the entire chain and re-syncing from genesis. Preserve the current
approach's core guarantee — **balances are never left silently wrong** — and fall
back to a full resync whenever an incremental rewind can't be done safely.

## Background: how divergence is handled today

`apps/indexer/src/ingestor.ts` `runCycle`:

1. Reads stored tip (`getMaxBlockNum`) and source tip (`getLatestBlock`).
2. `sourceDiverged` compares the block hash at the lower of the two tips. A
   block hash commits to its whole ancestry, so one mismatch proves divergence
   at or below that height; an absent/inconclusive response never triggers a
   wipe.
3. On confirmed divergence it calls `resetIndexedChain` — a single
   `TRUNCATE block, transaction, tx_in, tx_out, tx_in_expanded, coins_history
   RESTART IDENTITY CASCADE` — and re-ingests from `genesisHeight`.

This is correct and atomic but O(chain height): a 1-block reorg rebuilds
everything, and `/status` lag balloons to the full height meanwhile.

### Why balances make this hard

Balances are not stored as numbers. `coins_history` holds an **append-only,
cumulative snapshot per address**: each row is `{ address, date, outIds }` where
`outIds` is the set of unspent `tx_out` ids for that address as of some block
(written per touched address in `block-processor.ts`, `date = block.timestamp`).
`getAccountBalance` takes the address's **latest** snapshot (`ORDER BY date DESC,
id DESC`) and sums those outputs' amounts. Crucially, `coins_history` carries
**no block reference** today — only a timestamp — so "the snapshots produced by
blocks above the fork" cannot be identified cleanly, and block timestamps are
not guaranteed strictly increasing or unique (e.g. the genesis epoch-0
sentinel). Deleting snapshots by timestamp is therefore fragile — the core
reason this was deferred.

## Approach

**A — targeted rewind with a block-referenced balance history (chosen).** Add a
`block_num` column to `coins_history` so a rewind can delete exactly the
snapshots produced by rolled-back blocks. Find the fork point by walking hashes
backward (bounded), delete everything above it in one transaction, and replay
forward. Gate the whole feature behind a depth config that defaults to today's
full-resync behaviour, so it ships dark and is enabled deliberately.

**B — timestamp-based snapshot deletion (rejected).** Avoids the schema change
but deletes `coins_history` by `date > fork.timestamp`; non-monotonic/duplicate
timestamps make this silently wrong. Not worth the risk.

**C — status quo, full resync only (fallback).** Retained as the safety net when
a fork can't be located within the configured depth or any read is inconclusive.

## Configuration

`IndexerConfig` gains `reorgMaxDepth: number` from
`INDEXER_REORG_MAX_DEPTH` (default **0**).

- `0` → always full resync (identical to today's behaviour; feature off).
- `N > 0` → attempt an incremental rewind up to `N` blocks below the stored tip;
  if the fork point is deeper than `N`, or any source read is inconclusive, fall
  back to `resetIndexedChain`.

Shipping with the default `0` means this change is behaviourally inert until an
operator opts in.

## Schema / migration

Add `block_num integer` to `coins_history`.

- Going forward, `block-processor.ts` writes `blockNum: blockRow.num` on every
  inserted snapshot (a one-line addition alongside the existing `date`).
- The column is **nullable** (no `NOT NULL`) so the migration needs no backfill:
  a rewind only ever touches recent, post-migration snapshots (which have
  `block_num` set); if any candidate snapshot in the rewind range has a NULL
  `block_num` (legacy row), the rewind aborts and falls back to full resync
  rather than guess. A one-time full resync after deploying repopulates every
  snapshot with `block_num`.
- Index: extend or add so rollback (`DELETE ... WHERE block_num > fork`) is
  index-assisted — `index("IX_ch_block_num").on(block_num)`.
- Declared in `schema.ts` so `drizzle-kit generate` tracks it; the drift gate
  and fresh-DB migrate smoke both cover it. No extension needed.

## Data layer: `deleteFromHeight`

New `deleteFromHeight(db, fork: number)` in `packages/db/src/queries.ts` —
delete every row belonging to blocks with `num > fork`, in FK-safe order, inside
one `db.transaction`:

```sql
-- children of transaction first
DELETE FROM tx_in_expanded WHERE "txHash" IN
  (SELECT hash FROM transaction WHERE "blockHash" IN (SELECT hash FROM block WHERE num > $fork));
DELETE FROM tx_in  WHERE "txHash" IN (…same…);
DELETE FROM tx_out WHERE "txHash" IN (…same…);
-- then transaction (references block.hash), then the balance snapshots, then blocks
DELETE FROM transaction   WHERE "blockHash" IN (SELECT hash FROM block WHERE num > $fork);
DELETE FROM coins_history WHERE block_num > $fork;
DELETE FROM block         WHERE num > $fork;
```

Why this restores correct balances: deleting post-fork `coins_history` rows makes
each affected address's **latest** snapshot revert to its pre-fork one. A
pre-fork snapshot can only reference pre-fork `tx_out` ids (an output is created
in its own block), so it never dangles after the delete. An output created
before the fork but *spent* in a rolled-back block becomes unspent again because
the spending `tx_in` is deleted and the pre-fork snapshot (which still lists that
output) becomes latest. No `tx_out.amount` referenced by a surviving snapshot is
ever deleted.

`resetIndexedChain` stays as-is for the full-resync path.

## Ingestor: fork-finding + integration

New `rewindToFork` in `ingestor.ts`, called from `runCycle` where
`resetIndexedChain` is called today:

```
if (storedMax !== null && await sourceDiverged(...)) {
  const fork = config.reorgMaxDepth > 0
    ? await findForkPoint(db, source, storedMax, config.reorgMaxDepth)
    : null;
  if (fork !== null) {
    await deleteFromHeight(db, fork);       // targeted rewind
    maxNum = fork;                          // replay resumes at fork+1
    logger.warn({ event: "chain.rewind", fork, storedMax }, "reorg — rewound to fork");
  } else {
    await resetIndexedChain(db);            // full resync fallback (unchanged)
    maxNum = null;
    logger.warn({ event: "chain.reset", storedMax }, "reorg/reset — resyncing from genesis");
  }
}
```

`findForkPoint(db, source, storedMax, maxDepth)`:

- Walk backward from `storedMax` toward `storedMax - maxDepth` (not below
  `genesisHeight`), comparing our stored hash (`getBlockHashByNum`) to the
  source's hash for that height (`getBlockRange(h, h)` → entry key).
- Fetch source hashes in **chunks** (reuse the existing ≤100-height range fetch)
  rather than one height at a time.
- Return the **highest** height where the hashes match (the fork point); replay
  then resumes at `fork + 1`.
- Return `null` (→ full resync) if: no match within `maxDepth`, the source read
  is inconclusive/empty at a probed height, or any candidate `coins_history` row
  in `(fork, storedMax]` has a NULL `block_num` (legacy data).

The forward replay is unchanged: `from = maxNum + 1`, and the continuity check
anchors on the retained fork block (`prevHash = getBlockHashByNum(db, fork)`), so
a bad replay still trips `ContinuityError` and halts.

## Atomicity & crash safety

- `deleteFromHeight` runs in a single transaction — a crash mid-delete rolls
  back, leaving the pre-rewind state intact; the next cycle re-detects divergence
  and retries.
- The delete and the forward replay are **separate** transactions (replay is
  per-block, as today). A crash after the delete but before replay leaves a
  correctly-truncated chain at height `fork`; the next cycle simply ingests
  forward from `fork + 1`. No inconsistent intermediate balance state is
  observable (each per-block `processBlock` is already atomic).

## Testing

The decisive test is **balance correctness across a reorg**, in
`ingestor.test.ts` (real Postgres, `FakeSourceClient`):

1. Build chain 0..N. In a post-fork block, address A *receives* output X; in a
   later block A *spends* X to B.
2. Point the ingestor at a divergent branch that forks below A's activity, with
   `reorgMaxDepth` large enough to cover it. Run a cycle.
3. Assert: blocks above the fork are gone and the new branch is ingested; A's and
   B's balances match the new branch (X un-spent / re-spent per the new branch);
   `coins_history` has no rows with `block_num > fork`; `getMaxBlockNum` reflects
   the new tip.

Additional cases:
- **Fallback:** a fork deeper than `reorgMaxDepth` (and `reorgMaxDepth = 0`)
  still does a full `resetIndexedChain` and resyncs — the existing reset tests
  keep passing.
- **Inconclusive source** during fork-finding → no destructive action (mirrors
  the existing "momentarily inconclusive" test).
- `deleteFromHeight` unit test: deletes exactly the rows above the fork across
  all six tables, leaves the fork block and below intact.
- Continuity still halts if the replayed branch is internally inconsistent.

## Files

```
packages/db/src/schema.ts                 modify — coins_history.block_num + index
packages/db/drizzle/0004_*.sql            add    — generated migration
packages/db/src/queries.ts                modify — deleteFromHeight()
packages/db/src/queries.test.ts           modify — deleteFromHeight test
apps/indexer/src/block-processor.ts       modify — write blockNum on coins_history
apps/indexer/src/ingestor.ts              modify — findForkPoint + rewindToFork wiring
apps/indexer/src/config.ts                modify — reorgMaxDepth (INDEXER_REORG_MAX_DEPTH)
apps/indexer/src/__tests__/ingestor.test.ts   modify — reorg balance + fallback tests
.env.example / turbo.json passThroughEnv  modify — INDEXER_REORG_MAX_DEPTH
```

## Constraints

- Strict TS, ESM `.js` specifiers, no `any`; amounts as bignumber strings.
- New column in a committed migration; schema-drift gate and fresh-DB migrate
  smoke must pass. No AI attribution; no legacy-brand strings.
- Default behaviour unchanged (`reorgMaxDepth = 0`) — feature is opt-in.
- The rewind must never leave a balance wrong: any uncertainty (unlocatable
  fork, inconclusive read, legacy NULL `block_num`) falls back to full resync.

## Open questions for review

1. **Is it worth building now?** Depends on how often this chain reorgs near the
   tip and how deep. If reorgs are rare/shallow or the node effectively only
   ever resets, the current full-resync is fine and this is premature.
2. **Default depth when enabled** — a sensible non-zero default (e.g. 100) once
   an operator opts in, or leave tuning entirely to them?
3. **Backfill vs nullable `block_num`** — nullable + resync-to-populate (chosen)
   vs a migration that backfills `block_num` from a `date`→`block` join. The
   nullable path is simpler and avoids a fragile timestamp join; the trade is a
   one-time full resync to get incremental rewinds working on pre-existing data.
```
