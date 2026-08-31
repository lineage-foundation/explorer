# LineageNodeClient → Fleet `/v1` REST API Migration — Design Spec

**Status:** Approved
**Date:** 2026-08-31

## Goal

Migrate the explorer's `LineageNodeClient` (`packages/chain`) from the fleet
node's legacy RPC-style API to its new `/v1` REST API (fleet source; SDK v2.0.0).
The client's **public interface stays identical**, so the indexer and web are
unaffected — only the HTTP calls, response mapping, config, and tests change.

## Background / what changed

The fleet node replaced its flat action-paths (`/latest_block`, `/block_by_num`,
`/blockchain_entry`, `/issued_supply`, `/total_supply`) and its
`{id, status, reason, route, content}` response envelope with a `/v1` REST API
returning **plain JSON**, real HTTP status codes, and `application/problem+json`
error bodies. OpenAPI is served at `/v1/openapi.json`, Swagger at `/v1/docs`.

**Operational note:** the currently-running local fleet node is still the *old*
build (every `/v1` route returns the legacy "Method not found" envelope; the old
paths still answer). This migration is built against the fleet source spec;
end-to-end integration testing is gated on the user deploying the `/v1` fleet.

## Approach

**A — interface-stable internal migration (chosen).** Every `LineageNodeClient`
method keeps its exact signature and return shape. The indexer's `SourceClient`
interface and the web read the same shapes, so the blast radius is
`packages/chain` plus the indexer's config wiring. No dual old/new support (the
old API is gone).

## Endpoint mapping

Base URLs are unchanged (`storageNodeUrl` = storage node, `mempoolNodeUrl` =
mempool node); only paths gain `/v1`.

| Method (unchanged signature) | New request | Response → current return shape |
|---|---|---|
| `getLatestBlock(): LineageBlock` | `GET {storage}/v1/blocks/latest` | `{ block }` → `block`. `404` = empty chain (throws, cycle retries). |
| `getBlockRange(start, end): [string, Record<"block", LineageBlock>][]` | `GET {storage}/v1/blocks?num=…` (repeat `num` per height; chunked, see below) | `[{ key, item_meta, data }]` → `[[key, { block: data }]]` |
| `getTransactionsByHash(hashes): [string, LineageTransaction][]` | `POST {storage}/v1/blockchain-entries/query` body `{ keys: [...] }` | `[{ key, item_meta, data }]` → `[[key, data]]` |
| `getIssuedSupply(): string` / `getCirculatingSupply()` | `GET {mempool}/v1/supply` | `{ total, issued }` → `BigNumber(issued).toFixed(0)` |
| `getTotalSupply(): string` | `GET {mempool}/v1/supply` | `{ total, issued }` → `BigNumber(total).toFixed(0)` |

**`entry.key` for a block IS the block hash** — confirmed from the fleet source:
`get_block_by_num`/`get_blocks_batch` look up the named `indexed_block_hash_key(num)`
pointer, which `get_stored_value_from_db` resolves to the block's actual storage
key (its hash) before building the entry. So `[[key, {block: data}]]` gives the
same `[hash, {block}]` shape the indexer already consumes.

**`item_meta`** is `{ type: "block", block_num, tx_len }` or
`{ type: "tx", block_num, tx_num }`; the client ignores it (kept for possible
future use). Missing keys/numbers are **omitted** from query results, so the old
`["","",""]` placeholder triple no longer appears — the `fetchBatch` filtering
of empty entries is removed.

**Removed methods/behaviour:** the singular `getTransactionByHash` (the
bare-string `/blockchain_entry` call that 400'd) is dropped — it is dead code
and its endpoint no longer exists; batch `getTransactionsByHash` is the only tx
read.

## `getBlockRange` chunking

`GET /v1/blocks?num=…` encodes each height as a repeated query param. A full
`maxBlockRange` (default 1000) would make an ~10 KB URL that can exceed server
limits, so `getBlockRange` splits the requested `[start, end]` into chunks of at
most **100** heights, issues one GET per chunk, and concatenates the entries in
order. This is internal; the returned array shape is unchanged.

## Error handling

Non-2xx responses carry `application/problem+json` (`{ type, title, status,
detail }`). The existing `fetchJson` wrapper already: checks `res.ok`, throws a
descriptive error including status + a body snippet on non-2xx, retries transient
failures with backoff, and applies a timeout — this carries over unchanged (the
snippet now shows the problem+json body). `getLatestBlock` on a `404`
(empty chain) throws like any other non-2xx; the ingest cycle retries, matching
today's behaviour when the tip is unavailable.

## Config

`LineageNodeConfig` (in `packages/chain/src/types.ts`) and the indexer's
`IndexerConfig`:

- **Remove** `issuedSupplyUrl` / `totalSupplyUrl` (obsolete — one `/v1/supply`
  endpoint replaces both).
- **Add** optional `apiKey?: string`, sent as an `x-api-key` header on every
  request (default absent; the local fleet needs none). `fetchJson` merges it
  into the request headers.
- Keep `storageNodeUrl`, `mempoolNodeUrl`, and the tx-batch tuning fields.

Env plumbing: `apps/indexer/src/config.ts` stops reading
`LINEAGE_ISSUED_SUPPLY_URL` / `LINEAGE_TOTAL_SUPPLY_URL` and reads
`LINEAGE_API_KEY` (optional); `apps/indexer/src/index.ts` passes `apiKey`
instead of the two supply URLs. `.env.example`, `turbo.json` `passThroughEnv`,
`docker-compose*.yml`, and the README are updated to drop the two supply vars and
document the optional `LINEAGE_API_KEY`.

## Types

The `data` payloads (block / transaction JSON) are structurally identical to the
current vendored types, so `LineageBlock`, `LineageBlockHeader`,
`LineageTransaction`, `LineageTxIn`, `LineageTxOut`, `LineageOutPoint`, and the
asset types are unchanged. `LineageTransaction.fees?` stays optional (node tx
data may still include it; not in the SDK type). The vendoring comment is
refreshed to note the `/v1` source and that the explorer still only needs the
types, never the SDK runtime.

## Files

```
packages/chain/src/client.ts           modify — /v1 endpoints, mapping, chunking, apiKey header
packages/chain/src/types.ts            modify — LineageNodeConfig (drop supply URLs, add apiKey); refresh comment
packages/chain/src/client.test.ts      modify — assert /v1 URLs, {keys}/?num= requests, entry→tuple + supply parsing, apiKey header
apps/indexer/src/config.ts             modify — IndexerConfig + loadConfig (drop supply URLs, add apiKey)
apps/indexer/src/index.ts              modify — construct client with apiKey, not supply URLs
apps/indexer/src/__tests__/config.test.ts  modify (if it asserts the removed fields)
.env.example                           modify — remove 2 supply vars, add commented LINEAGE_API_KEY
turbo.json                             modify — passThroughEnv: drop 2 supply vars, add LINEAGE_API_KEY
docker-compose.yml / docker-compose.dev.yml  modify (if they set the supply URLs)
README.md                              modify — document the /v1 node API + LINEAGE_API_KEY
```

## Testing

- **`packages/chain/src/client.test.ts`** (rewrite): mock `fetchImpl` and assert,
  for each method, the exact `/v1` URL, the request encoding (`{ keys: [...] }`
  body for entries; repeated `?num=` for blocks; GET for latest/supply), the
  entry→tuple mapping (`{key, item_meta, data}` → `[key, block/tx]`), supply
  parsing (`{ total, issued }` → the right field as a string), that a chunked
  block range issues multiple GETs and concatenates, that omitted keys yield a
  shorter result, and that `apiKey` sets the `x-api-key` header.
- **Indexer tests** use `FakeSourceClient` (the `SourceClient` interface), which
  is unchanged, so they need no edits beyond the `config.test.ts` field removal.
- **Integration** against a live `/v1` fleet is gated on the user deploying it;
  the CI e2e/web tests do not hit the node.

## Constraints

- Strict TS, ESM, `.js` import specifiers; no `any`; `console.warn`/`error` only.
- No AI attribution; no legacy-brand strings.
- Amounts/supply as strings via bignumber.
- Public `LineageNodeClient` method signatures and return shapes are unchanged
  (interface-stable migration).
