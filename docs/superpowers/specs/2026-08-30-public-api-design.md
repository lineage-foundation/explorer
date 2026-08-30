# Lineage Explorer Public API — Design Spec

**Status:** Approved
**Date:** 2026-08-30

## Goal

A versioned, documented, standards-compliant read-only REST API over the
existing chain data, with an OpenAPI 3.1 document generated from the same
schemas that validate incoming traffic (single source of truth, no drift).

## Non-goals

- Write endpoints. The API is strictly read-only.
- API keys, accounts, or per-key quotas. Access is anonymous with a soft
  per-IP rate limit; key issuance can be layered on later without breaking
  consumers.
- New query work. Every endpoint is backed by an existing `@explorer/db`
  query function.

## Architecture & boundaries

A new workspace package **`@explorer/api`** holds a framework-agnostic
**Hono app** built with `@hono/zod-openapi`. The app is exposed as a factory:

```ts
createApiApp({ db }: { db: Database }): OpenAPIHono
```

The `Database` is injected, not imported. This yields:

- **Isolated tests** — inject a seeded test DB and drive the app via
  `app.request(...)`: no server, no ports.
- **Reuse** — `apps/web` injects its existing pooled `getDb()`.
- **Portability** — the app lifts into a standalone `apps/api` service later
  by swapping only the entry adapter; no route logic changes.

`apps/web` mounts it through one thin catch-all handler:

```
apps/web/app/api/v1/[[...route]]/route.ts  →  hono/vercel handle(createApiApp({ db }))
```

The existing `apps/web/app/api/health` and `apps/web/app/api/latest` handlers
remain **app-internal** (infra health check and homepage feed aggregation).
They are explicitly *not* part of the public contract and are not versioned.

## Endpoints

All backed by existing `@explorer/db` queries.

| Method & path | Backed by | Notes |
|---|---|---|
| `GET /api/v1/blocks` | `getBlocks`, `getBlocksCount` | Paginated list. `?limit&offset&order` |
| `GET /api/v1/blocks/{id}` | `getBlockByHashOrNumber` | `id` = height or hash |
| `GET /api/v1/blocks/{id}/transactions` | `getBlockTransactions` | Coinbase first |
| `GET /api/v1/transactions` | `getTransactions`, `getTransactionsCount` | Paginated, non-coinbase. `?limit&offset&order` |
| `GET /api/v1/transactions/{hash}` | `getTransactionByHash` | Full detail, resolved ins/outs |
| `GET /api/v1/addresses/{address}` | `getAccountBalance` | Balance (raw + LNGX) |
| `GET /api/v1/addresses/{address}/transactions` | `getAccountTransactions` | Paginated history. `?limit&offset` |
| `GET /api/v1/supply` | `getCirculatingSupply` | Circulating (raw + LNGX) |
| `GET /api/v1/status` | `getMaxBlockNum`, `getBlocksCount`, `getTransactionsCount` | Chain height + counts |
| `GET /api/v1/openapi.json` | generated | OpenAPI 3.1 document |
| `GET /api/v1/docs` | Scalar | Interactive reference, self-hosted |

## Conventions

- **Versioning:** URI-based `/api/v1`. Additive changes stay in v1; breaking
  changes mint `/api/v2`.
- **Lists:** offset/limit envelope —
  `{ "data": [...], "pagination": { "total", "limit", "offset", "hasMore" } }`.
  `limit` defaults per resource, capped at 100. Out-of-range or non-integer
  params → `422`.
- **Single resources:** returned bare (no envelope). Missing → `404`.
- **Amounts:** every monetary value carries both the raw string and a
  formatted `…Lngx` string (raw ÷ 72,072,000 via the existing LNGX
  formatter), so consumers never re-implement the conversion.
- **Errors:** RFC 9457 `application/problem+json` —
  `{ type, title, status, detail, instance }`. A single error middleware maps
  validation failures (`422`), not-found (`404`), and unhandled errors (`500`)
  into that shape so every error path is uniform and appears in the spec.
- **Caching:** `Cache-Control: public` with a long `s-maxage` for immutable
  resources (a mined block/tx) and a short `s-maxage` for lists and status.
- **CORS:** open `GET` from any origin — it is a public read API.

## Rate limiting

A token-bucket middleware keyed by client IP, written behind a
`RateLimitStore` interface with an in-memory implementation:

```ts
interface RateLimitStore {
  take(key: string, cost?: number): Promise<{ ok: boolean; remaining: number; resetSeconds: number }>;
}
```

Responses carry `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset`.
Over-limit requests return `429` + `Retry-After`. The interface lets a shared
store (Redis, etc.) drop in later without touching route code — and covers the
Vercel-serverless case, where per-instance memory is not shared. On a
long-lived Railway container the in-memory limiter is exact.

## OpenAPI & docs

Routes are declared with `createRoute({ request, responses })` using Zod
schemas, so the OpenAPI 3.1 document is **generated**, not maintained.
`openapi.json` is served directly from the app; `/api/v1/docs` renders Scalar
against it. Shared response schemas — `Block`, `Transaction`, `Address`,
`Supply`, `Status`, `Pagination`, `Problem` — live in one `schemas.ts` and are
referenced by every route, producing a consistent `components` section.

## Testing

Vitest suite in `@explorer/api` seeds a test schema (reusing the
`resetTestSchema` + fixture pattern from `packages/db/src/queries.test.ts`) and
drives the app via `app.request()`:

- Happy path for every endpoint (correct shape, envelope, amount formatting).
- Error paths: `404` (missing block or transaction), `422` (bad pagination
  params), `429` (rate limit exceeded). Note: addresses never `404` — an
  unknown address returns balance `0` and an empty transaction list, matching
  `getAccountBalance` / `getAccountTransactions`.
- Problem-Details shape on all error responses.
- Pagination bounds (limit cap, offset beyond total, `hasMore` correctness).
- The generated `openapi.json` parses as a valid OpenAPI 3.1 document and
  contains every declared path and referenced component.

The suite is wired into the existing CI `verify` job. No AI-attribution in any
committed artifact (commits, code, docs).

## Package layout

```
packages/api/
  package.json            @explorer/api, private, ESM, exports createApiApp
  tsconfig.json           extends repo base (strict, NodeNext)
  src/
    app.ts                createApiApp({ db }) — assembles middleware + routes
    schemas.ts            shared Zod/OpenAPI schemas + Problem + Pagination
    format.ts             raw→LNGX formatting shared by responses
    problem.ts            RFC 9457 helpers + error middleware
    rate-limit.ts         RateLimitStore interface + in-memory store + middleware
    routes/
      blocks.ts
      transactions.ts
      addresses.ts
      meta.ts             supply, status, openapi.json, docs
  test/
    *.test.ts             app.request()-driven suite

apps/web/app/api/v1/[[...route]]/route.ts   thin hono/vercel adapter
```

## Dependencies

- `hono`, `@hono/zod-openapi`, `zod` — routing, validation, spec generation.
- `@scalar/hono-api-reference` — self-hosted docs UI.
- `@explorer/db` (workspace) — data access.

All pinned to current majors; Node 22; strict TypeScript with `.js` import
specifiers per the monorepo convention.
