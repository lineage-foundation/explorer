# Item Metadata Search API — Design Spec

**Status:** Approved
**Date:** 2026-09-01

## Goal

Expose minted items (item-type transaction outputs) through a searchable public
API endpoint. Items carry a `genesisHash` (item-class identifier) and a raw
`itemMetadata` string (plain text or JSON-as-text). Users need to find items by
searching that metadata, and to browse all outputs of a given item class.

## Background

Item outputs are already indexed: `tx_out` rows with `valueType = 'item'` store
`genesisHash`, `itemMetadata` (nullable `varchar`), `scriptPublicKey` (the
recipient/holder recorded by that output), `amount`, `txHash`, and `n`. They are
currently only surfaced inside a transaction's `outputs`. The public API
(`packages/api`) has no search or browse endpoint yet — this adds the first one.

## Endpoint

`GET /api/v1/items` — mounted alongside blocks/transactions/addresses/meta.

Query params (validated with the shared Zod layer):

| Param | Type | Notes |
|---|---|---|
| `q` | string, 1..128, optional | case-insensitive substring match on `itemMetadata` (`ILIKE '%q%'`, metacharacters escaped) |
| `genesis` | string, 1..128, optional | exact `genesisHash` match (browse one item class) |
| `limit` | int 1..100, default 25 | shared `PageQuery` |
| `offset` | int 0..100000, default 0 | shared `PageQuery` (deep-offset cap) |

**At least one of `q` / `genesis` is required** — a request with neither returns
`422` (avoids an unfiltered full item scan). They may be combined (metadata
search within one item class).

Results are ordered `block.num DESC, tx_out.id DESC` (unique tiebreaker, matching
the pagination convention used elsewhere).

## Response

One row per matching item output:

```jsonc
{
  "data": [{
    "genesisHash": "…",
    "metadata": "…",            // raw itemMetadata (may be null)
    "address": "…",             // scriptPublicKey — holder recorded by this output (may be null)
    "amount": "1",              // raw string
    "amountLngx": "…",          // formatLngxPlain(amount)
    "spent": false,             // whether this output has been spent; false ⇒ a current holder
    "txHash": "…",
    "n": 0,
    "blockNum": 42,
    "blockHash": "…",
    "timestamp": "2024-01-01T00:00:00.000Z"  // nullable
  }],
  "pagination": { "total": 1, "limit": 25, "offset": 0, "hasMore": false }
}
```

`spent` is computed by an `EXISTS` against `tx_in` on
`(previousOutTxHash, previousOutTxN) = (tx_out.txHash, tx_out.n)`.

## Data layer

New `searchItems(db, { q?, genesis?, limit, offset })` in
`packages/db/src/queries.ts`:

- Base: `tx_out` filtered to `valueType = 'item'`, inner-joined to `transaction`
  then `block` (for `blockNum`/`blockHash`/`timestamp`).
- `genesis` → `eq(tx_out.genesisHash, genesis)`.
- `q` → `ilike(tx_out.itemMetadata, '%' + escapeLike(q) + '%')` (reuse the
  existing `escapeLike` that guards `\ % _`).
- `spent` → correlated `EXISTS (select 1 from tx_in where previousOutTxHash =
  tx_out.txHash and previousOutTxN = tx_out.n)`.
- Total count uses the same filters; the page adds order + limit/offset.
- Amounts stay strings (numeric → string); `amountLngx` via `formatLngxPlain`.

At least one filter is guaranteed by the API layer; the db function also treats
"no filters" defensively (still bounded by limit) but the API rejects it first.

## Schema / migration

Migration `0003` (Drizzle) adds:

- `CREATE EXTENSION IF NOT EXISTS pg_trgm;` (hand-prepended to the generated SQL —
  drizzle-kit does not model extensions; it is not tracked in the snapshot, so the
  schema-drift gate is unaffected).
- **GIN trigram** index on `tx_out.itemMetadata`
  (`using gin (itemMetadata gin_trgm_ops)`) — makes `ILIKE '%q%'` index-assisted.
- **btree** index on `tx_out.genesisHash` — the class filter / ordering support.
- **btree** index on `tx_in (previousOutTxHash, previousOutTxN)` — the `spent`
  EXISTS lookup (previously unindexed).

All three indexes are declared in `schema.ts` so `drizzle-kit generate` produces
and tracks them; only the `CREATE EXTENSION` line is added by hand. CI's
fresh-DB migrate smoke test runs the extension creation, and the drift gate
(`drizzle-kit generate` + `git diff --exit-code`) stays clean.

## API layer

- New `packages/api/src/routes/items.ts` registering `GET /api/v1/items`.
- `ItemQuery` schema: `PageQuery.extend({ q?, genesis? })` with a `.superRefine`
  (or `.refine`) enforcing "at least one of q/genesis"; both `.max(128)`.
- `ItemOutputSchema` + `listSchema(ItemOutputSchema, "ItemList")` for the OpenAPI
  response; registered in `createApiApp` so `/v1/docs` and `openapi.json` include
  it.
- Errors use the existing `problem+json` path; validation failures 422 via the
  existing `defaultHook`.

## Testing

- **db** (`queries.test.ts`): fixtures with ≥2 item outputs (distinct genesis
  hashes, one spent via a `tx_in` referencing it, JSON-string and plain-string
  metadata). Assert: substring match (case-insensitive, mid-string), genesis
  filter, combined filter, `spent` true/false, ordering + pagination tiebreaker,
  empty result, and `escapeLike` on a `%`/`_` in `q`.
- **api** (`test/items.test.ts`): 200 shape (data + pagination envelope,
  `amountLngx` present, `spent` boolean), `q` substring hit, `genesis` filter,
  422 when neither filter given, 422 on over-long `q`/`genesis`, offset cap.
- Big-int safety: an item `amount` beyond 2^53 round-trips as an exact string
  (guards the numeric→string path).

## Constraints

- Strict TS, ESM `.js` specifiers, no `any`; amounts as strings via bignumber.
- No SQL injection: drizzle builder / parameterized values; `escapeLike` on the
  user substring.
- New index columns must appear in a committed migration; schema-drift gate and
  fresh-DB migrate smoke must both pass (pg_trgm enabled in the migration).
- No AI attribution; no legacy-brand strings.

## Out of scope (possible follow-ups)

- Structured JSON-path querying (metadata is heterogeneous; substring chosen).
- A `?unspent=true` filter (the `spent` field already lets clients filter
  client-side; a server-side filter is a small later addition).
- Wiring item search into the web UI search bar.
