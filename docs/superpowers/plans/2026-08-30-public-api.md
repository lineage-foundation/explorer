# Public REST API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a versioned, OpenAPI-3.1-documented, read-only public REST API (`/api/v1/*`) over the existing chain data, built as a standalone `@explorer/api` Hono app mounted in `apps/web`.

**Architecture:** A new workspace package `@explorer/api` exports `createApiApp({ db })`, an `OpenAPIHono` app whose routes are declared with Zod schemas — so the OpenAPI document is generated from the same schemas that validate requests. The `Database` is injected, so the app is unit-tested via `app.request()` and reused by `apps/web` through one thin `hono/vercel` catch-all handler. Errors are RFC 9457 `application/problem+json`; a soft in-memory per-IP token-bucket limits abuse behind a swappable store interface.

**Tech Stack:** TypeScript (strict, ESM), Hono 4 + `@hono/zod-openapi`, Zod, `@scalar/hono-api-reference`, Drizzle (`@explorer/db`), Vitest.

## Global Constraints

- Node `>=22`; package manager `pnpm@9.12.0`. Copy verbatim, do not bump.
- Strict TypeScript: `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `moduleResolution: Bundler`. Every relative import uses a `.js` specifier that resolves to the `.ts` source (repo convention).
- ESLint bans: `@typescript-eslint/no-explicit-any` is an **error**; `no-console` is an **error** except `console.warn`/`console.error`.
- All money/amount values are **strings**, never JS `number`. `bits` (a Postgres `bigint`) serializes with `.toString()`.
- LNGX conversion: `formatLngx(raw)` = `raw ÷ coinFraction` (`72072000`), reused from `@explorer/config` (centralized in Task 3). Every raw amount field is paired with a `…Lngx` string field.
- Errors are RFC 9457 `application/problem+json` with `{ type, title, status, detail?, instance? }`.
- OpenAPI document is **3.1.0**.
- All public routes live under the literal path prefix `/api/v1`.
- **No AI attribution** anywhere — commits, code comments, docs. **No legacy-brand strings** (`aiblock`, `aibcoin`, `@2waychain`, `2wayjs`, `ablock`) — CI greps for these.
- `z` MUST be imported from `@hono/zod-openapi` (its Zod is extended with `.openapi()`), never from `zod` directly, in any file that builds route/response schemas.

## File Structure

```
packages/api/
  package.json            @explorer/api — private ESM, exports ./src/index.ts, test + typecheck scripts
  tsconfig.json           extends @explorer/config/tsconfig
  vitest.config.ts        globalSetup resets the test schema; fileParallelism false
  test/
    setup.ts              globalSetup: set DATABASE_URL + resetTestSchema
    fixtures.ts           seedFixtures(db) — delete-all + insert canonical rows
    problem.test.ts       404 shape (Task 1)
    rate-limit.test.ts    429 + headers (Task 2)
    schemas.test.ts       query coercion/bounds + classifyTxType (Task 4)
    blocks.test.ts        (Task 5)
    transactions.test.ts  (Task 6)
    addresses.test.ts     (Task 7)
    meta.test.ts          supply/status/openapi/docs (Task 8)
  src/
    index.ts              re-exports createApiApp + public types
    problem.ts            Problem type, ProblemError, problemJson()
    rate-limit.ts         RateLimitStore, createMemoryStore, rateLimit() middleware
    app.ts                createApiApp({ db, rateLimit? }) — assembles middleware + routes
    schemas.ts            all Zod/OpenAPI schemas + query schemas + listSchema()
    helpers.ts            CACHE constants + classifyTxType()
    routes/
      blocks.ts           registerBlocks(app, db)
      transactions.ts     registerTransactions(app, db) + serializeTransaction()
      addresses.ts        registerAddresses(app, db)
      meta.ts             registerMeta(app, db) — supply, status, openapi.json, docs

packages/config/src/format.ts     formatLngx (moved here in Task 3)
apps/web/lib/format.ts            re-exports formatLngx from @explorer/config (Task 3)
apps/web/app/api/v1/[[...route]]/route.ts   hono/vercel adapter (Task 9)
apps/web/e2e/api.spec.ts          end-to-end API checks (Task 9)
```

Each task ends with `pnpm -F @explorer/api test` (or the noted scope) green and a commit.

**Test DB:** tests expect `TEST_DATABASE_URL` (falls back to `postgres://explorer:explorer@127.0.0.1:5432/explorer_test`). Locally this repo has used port **5433**; export `TEST_DATABASE_URL=postgres://explorer:explorer@127.0.0.1:5433/explorer_test` when running tasks on this machine.

---

### Task 1: Scaffold `@explorer/api` + Problem-Details core

**Files:**
- Create: `packages/api/package.json`, `packages/api/tsconfig.json`, `packages/api/vitest.config.ts`, `packages/api/test/setup.ts`
- Create: `packages/api/src/problem.ts`, `packages/api/src/app.ts`, `packages/api/src/index.ts`
- Test: `packages/api/test/problem.test.ts`

**Interfaces:**
- Produces: `createApiApp({ db }: { db: Database; rateLimit?: RateLimitOptions }): OpenAPIHono`
- Produces: `class ProblemError extends Error` with `constructor(status: number, title: string, detail?: string)` and readonly `status`, `title`, `detail`.
- Produces: `problemJson(c: Context, status: number, title: string, detail?: string, extraHeaders?: Record<string,string>): Response`

- [ ] **Step 1: Create the package manifest**

`packages/api/package.json`:
```json
{
  "name": "@explorer/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@explorer/config": "workspace:^",
    "@explorer/db": "workspace:^",
    "@hono/zod-openapi": "^0.18.0",
    "@scalar/hono-api-reference": "^0.5.0",
    "hono": "^4.6.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "vitest": "^2.1.1"
  }
}
```

- [ ] **Step 2: Create tsconfig and vitest config**

`packages/api/tsconfig.json`:
```json
{
  "extends": "@explorer/config/tsconfig",
  "compilerOptions": { "outDir": "dist", "rootDir": "." },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/api/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/setup.ts"],
    testTimeout: 30000,
    fileParallelism: false,
  },
});
```

`packages/api/test/setup.ts`:
```ts
import { resetTestSchema } from "@explorer/db/test-support";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";

export default async function setup(): Promise<void> {
  process.env.DATABASE_URL = TEST_DB_URL;
  await resetTestSchema(TEST_DB_URL);
}
```

Add `"./test-support": "./src/test-support.ts"` is already exported by `@explorer/db` — verify with `cat packages/db/package.json`.

- [ ] **Step 3: Install dependencies**

Run: `pnpm install`
Expected: lockfile updates, `@explorer/api` linked into the workspace.

- [ ] **Step 4: Write the failing test**

`packages/api/test/problem.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createDb } from "@explorer/db";
import { createApiApp } from "../src/index.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";

describe("problem details", () => {
  it("returns RFC 9457 problem+json for an unknown route", async () => {
    const { db } = createDb(URL);
    const app = createApiApp({ db });
    const res = await app.request("/api/v1/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    const body = await res.json();
    expect(body).toMatchObject({ title: "Not Found", status: 404 });
    expect(body.instance).toBe("/api/v1/does-not-exist");
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm -F @explorer/api exec vitest run problem`
Expected: FAIL — `createApiApp` not found / module missing.

- [ ] **Step 6: Implement `problem.ts`**

`packages/api/src/problem.ts`:
```ts
import type { Context } from "hono";

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
}

export class ProblemError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail?: string,
  ) {
    super(title);
    this.name = "ProblemError";
  }
}

export function problemJson(
  c: Context,
  status: number,
  title: string,
  detail?: string,
  extraHeaders?: Record<string, string>,
): Response {
  const body: Problem = {
    type: "about:blank",
    title,
    status,
    ...(detail ? { detail } : {}),
    instance: new URL(c.req.url).pathname,
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/problem+json", ...extraHeaders },
  });
}
```

- [ ] **Step 7: Implement `app.ts` (minimal core)**

`packages/api/src/app.ts`:
```ts
import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import type { Database } from "@explorer/db";
import { ProblemError, problemJson } from "./problem.js";

export interface ApiDeps {
  db: Database;
}

export function createApiApp({ db: _db }: ApiDeps): OpenAPIHono {
  const app = new OpenAPIHono({
    defaultHook: (result) => {
      if (!result.success) {
        const detail = result.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ");
        throw new ProblemError(422, "Invalid request", detail);
      }
    },
  });

  app.use("/api/v1/*", cors({ origin: "*", allowMethods: ["GET", "OPTIONS"] }));

  app.onError((err, c) => {
    if (err instanceof ProblemError) {
      return problemJson(c, err.status, err.title, err.detail);
    }
    console.error(err);
    return problemJson(c, 500, "Internal Server Error");
  });

  app.notFound((c) => problemJson(c, 404, "Not Found", `No route for ${new URL(c.req.url).pathname}`));

  return app;
}
```

Note: `_db` is unused for now (prefixed to satisfy lint). Later tasks drop the underscore and pass `db` to route registrars.

- [ ] **Step 8: Implement `index.ts`**

`packages/api/src/index.ts`:
```ts
export { createApiApp } from "./app.js";
export type { ApiDeps } from "./app.js";
export { ProblemError } from "./problem.js";
export type { Problem } from "./problem.js";
```

- [ ] **Step 9: Run test to verify it passes**

Run: `pnpm -F @explorer/api exec vitest run problem`
Expected: PASS.

- [ ] **Step 10: Typecheck**

Run: `pnpm -F @explorer/api typecheck`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add packages/api pnpm-lock.yaml
git commit -m "feat(api): scaffold @explorer/api with RFC 9457 problem details"
```

---

### Task 2: Per-IP rate-limit middleware

**Files:**
- Create: `packages/api/src/rate-limit.ts`
- Modify: `packages/api/src/app.ts`
- Test: `packages/api/test/rate-limit.test.ts`

**Interfaces:**
- Produces: `interface RateLimitStore { take(key: string, limit: number, windowSeconds: number): { ok: boolean; remaining: number; resetSeconds: number } }`
- Produces: `createMemoryStore(): RateLimitStore`
- Produces: `interface RateLimitOptions { limit?: number; windowSeconds?: number; store?: RateLimitStore }`
- Produces: `rateLimit(opts?: RateLimitOptions): MiddlewareHandler`
- Consumes: `ProblemError`/`problemJson` from `./problem.js`. `createApiApp` gains optional `rateLimit?: RateLimitOptions`.

- [ ] **Step 1: Write the failing test**

`packages/api/test/rate-limit.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createDb } from "@explorer/db";
import { createApiApp } from "../src/index.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";

function app() {
  const { db } = createDb(URL);
  return createApiApp({ db, rateLimit: { limit: 2, windowSeconds: 60 } });
}

describe("rate limiting", () => {
  it("allows requests up to the limit and sets RateLimit headers", async () => {
    const a = app();
    const res = await a.request("/api/v1/nope", { headers: { "x-forwarded-for": "1.1.1.1" } });
    expect(res.headers.get("RateLimit-Limit")).toBe("2");
    expect(res.headers.get("RateLimit-Remaining")).toBe("1");
  });

  it("returns 429 problem+json with Retry-After once the bucket is empty", async () => {
    const a = app();
    const headers = { "x-forwarded-for": "2.2.2.2" };
    await a.request("/api/v1/nope", { headers });
    await a.request("/api/v1/nope", { headers });
    const res = await a.request("/api/v1/nope", { headers });
    expect(res.status).toBe(429);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(res.headers.get("Retry-After")).not.toBeNull();
    const body = await res.json();
    expect(body).toMatchObject({ title: "Too Many Requests", status: 429 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @explorer/api exec vitest run rate-limit`
Expected: FAIL — headers absent / third request not 429 (no limiter yet).

- [ ] **Step 3: Implement `rate-limit.ts`**

`packages/api/src/rate-limit.ts`:
```ts
import type { MiddlewareHandler } from "hono";
import { problemJson } from "./problem.js";

export interface RateLimitStore {
  take(
    key: string,
    limit: number,
    windowSeconds: number,
  ): { ok: boolean; remaining: number; resetSeconds: number };
}

export function createMemoryStore(): RateLimitStore {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    take(key, limit, windowSeconds) {
      const now = Date.now();
      const existing = buckets.get(key);
      if (!existing || existing.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
        return { ok: true, remaining: limit - 1, resetSeconds: windowSeconds };
      }
      existing.count += 1;
      const resetSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      if (existing.count > limit) return { ok: false, remaining: 0, resetSeconds };
      return { ok: true, remaining: limit - existing.count, resetSeconds };
    },
  };
}

export interface RateLimitOptions {
  limit?: number;
  windowSeconds?: number;
  store?: RateLimitStore;
}

export function rateLimit(opts: RateLimitOptions = {}): MiddlewareHandler {
  const limit = opts.limit ?? 120;
  const windowSeconds = opts.windowSeconds ?? 60;
  const store = opts.store ?? createMemoryStore();
  return async (c, next) => {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    const key = forwarded && forwarded.length > 0 ? forwarded : "unknown";
    const result = store.take(key, limit, windowSeconds);
    c.header("RateLimit-Limit", String(limit));
    c.header("RateLimit-Remaining", String(result.remaining));
    c.header("RateLimit-Reset", String(result.resetSeconds));
    if (!result.ok) {
      return problemJson(c, 429, "Too Many Requests", "Rate limit exceeded. Retry later.", {
        "Retry-After": String(result.resetSeconds),
        "RateLimit-Limit": String(limit),
        "RateLimit-Remaining": "0",
        "RateLimit-Reset": String(result.resetSeconds),
      });
    }
    await next();
  };
}
```

- [ ] **Step 4: Wire the limiter into `app.ts`**

In `packages/api/src/app.ts`, update the imports and `ApiDeps`, and add the middleware after the `cors` line:
```ts
import { rateLimit, type RateLimitOptions } from "./rate-limit.js";
```
```ts
export interface ApiDeps {
  db: Database;
  rateLimit?: RateLimitOptions;
}

export function createApiApp({ db: _db, rateLimit: rl }: ApiDeps): OpenAPIHono {
```
Add directly below the existing `app.use("/api/v1/*", cors(...))` line:
```ts
  app.use("/api/v1/*", rateLimit(rl));
```
Export the option type from `index.ts`:
```ts
export type { RateLimitOptions } from "./rate-limit.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm -F @explorer/api exec vitest run rate-limit`
Expected: PASS. Also re-run `problem` to confirm no regression: `pnpm -F @explorer/api test`.

- [ ] **Step 6: Commit**

```bash
git add packages/api
git commit -m "feat(api): add swappable per-IP token-bucket rate limiter"
```

---

### Task 3: Centralize `formatLngx` in `@explorer/config`

**Files:**
- Create: `packages/config/src/format.ts`
- Modify: `packages/config/src/index.ts`, `packages/config/package.json`
- Modify: `apps/web/lib/format.ts`
- Test: `packages/config/test/format.test.ts`

**Interfaces:**
- Produces: `formatLngx(rawAmount: string | null): string` exported from `@explorer/config`.
- `apps/web/lib/format.ts` keeps exporting `formatLngx` (re-export) so its existing importers are unchanged.

- [ ] **Step 1: Write the failing test**

`packages/config/test/format.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { formatLngx } from "../src/index.js";

describe("formatLngx", () => {
  it("divides a raw amount by the coin fraction", () => {
    expect(formatLngx("72072000")).toBe("1");
    expect(formatLngx("144144000")).toBe("2");
  });
  it("returns 0 for null", () => {
    expect(formatLngx(null)).toBe("0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @explorer/config exec vitest run format`
Expected: FAIL — `formatLngx` not exported from config.

- [ ] **Step 3: Add bignumber dependency to config**

In `packages/config/package.json`, add to a new `dependencies` block:
```json
  "dependencies": {
    "bignumber.js": "^11.1.5"
  },
```
Then run `pnpm install`.

- [ ] **Step 4: Implement `packages/config/src/format.ts`**

```ts
import BigNumber from "bignumber.js";
import { getSupplyConstants } from "./constants.js";

const FRACTION = new BigNumber(getSupplyConstants().coinFraction.toString());
const FMT = { groupSeparator: ",", groupSize: 3, decimalSeparator: "." } as const;

export function formatLngx(rawAmount: string | null): string {
  if (rawAmount === null) return "0";
  const value = new BigNumber(rawAmount).dividedBy(FRACTION);
  if (!value.isFinite()) return "0";
  return value.toFormat(FMT);
}
```

- [ ] **Step 5: Export it from config**

In `packages/config/src/index.ts`, add:
```ts
export * from "./format.js";
```

- [ ] **Step 6: Re-export from the web helper**

In `apps/web/lib/format.ts`, remove the local `formatLngx` implementation and its now-unused `BigNumber`/`FRACTION`/`FMT` (only if nothing else in the file uses them — `truncateHash`, `relativeTime`, `absoluteTime`, `txTypeLabel` do not). Replace the `import BigNumber ...` + `getSupplyConstants` lines and the `formatLngx` function with:
```ts
export { formatLngx } from "@explorer/config";
```
Leave the other helpers untouched.

- [ ] **Step 7: Run tests to verify**

Run: `pnpm -F @explorer/config exec vitest run format`
Expected: PASS.
Run: `pnpm -F @explorer/web test`
Expected: PASS (web importers of `formatLngx` still resolve).

- [ ] **Step 8: Typecheck the touched packages**

Run: `pnpm -F @explorer/config typecheck && pnpm -F @explorer/web typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/config apps/web/lib/format.ts pnpm-lock.yaml
git commit -m "refactor(config): centralize formatLngx for reuse by web and api"
```

---

### Task 4: Shared schemas + helpers

**Files:**
- Create: `packages/api/src/schemas.ts`, `packages/api/src/helpers.ts`
- Test: `packages/api/test/schemas.test.ts`

**Interfaces:**
- Produces (schemas.ts): `ListQuery`, `AccountTxQuery`, `ProblemSchema`, `PaginationSchema`, `BlockSummarySchema`, `BlockSchema`, `BlockTxSchema`, `TransactionSummarySchema`, `TransactionSchema`, `AddressSchema`, `SupplySchema`, `StatusSchema`, and `listSchema(item, name)`.
- Produces (helpers.ts): `CACHE = { resource: 3600, list: 10, status: 5 }`, `classifyTxType(valueType: string | undefined, coinbase: boolean): "token" | "item" | "coinbase" | "unknown"`.

- [ ] **Step 1: Write the failing test**

`packages/api/test/schemas.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ListQuery } from "../src/schemas.js";
import { classifyTxType } from "../src/helpers.js";

describe("ListQuery", () => {
  it("coerces strings and applies defaults", () => {
    expect(ListQuery.parse({})).toEqual({ limit: 25, offset: 0, order: "desc" });
    expect(ListQuery.parse({ limit: "5", offset: "10", order: "asc" })).toEqual({
      limit: 5, offset: 10, order: "asc",
    });
  });
  it("rejects out-of-range and invalid values", () => {
    expect(ListQuery.safeParse({ limit: "0" }).success).toBe(false);
    expect(ListQuery.safeParse({ limit: "101" }).success).toBe(false);
    expect(ListQuery.safeParse({ order: "sideways" }).success).toBe(false);
  });
});

describe("classifyTxType", () => {
  it("classifies by coinbase then value type", () => {
    expect(classifyTxType("token", true)).toBe("coinbase");
    expect(classifyTxType("token", false)).toBe("token");
    expect(classifyTxType("item", false)).toBe("item");
    expect(classifyTxType(undefined, false)).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @explorer/api exec vitest run schemas`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `helpers.ts`**

`packages/api/src/helpers.ts`:
```ts
export const CACHE = { resource: 3600, list: 10, status: 5 } as const;

export function classifyTxType(
  valueType: string | undefined,
  coinbase: boolean,
): "token" | "item" | "coinbase" | "unknown" {
  if (coinbase) return "coinbase";
  if (valueType === "token") return "token";
  if (valueType === "item") return "item";
  return "unknown";
}
```

- [ ] **Step 4: Implement `schemas.ts`**

`packages/api/src/schemas.ts`:
```ts
import { z } from "@hono/zod-openapi";

export const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export const AccountTxQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export const ProblemSchema = z
  .object({
    type: z.string().openapi({ example: "about:blank" }),
    title: z.string(),
    status: z.number().int(),
    detail: z.string().optional(),
    instance: z.string().optional(),
  })
  .openapi("Problem");

export const PaginationSchema = z
  .object({
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
    hasMore: z.boolean(),
  })
  .openapi("Pagination");

const TxType = z.enum(["token", "item", "coinbase", "unknown"]);

export const BlockSummarySchema = z
  .object({
    num: z.number().int(),
    hash: z.string(),
    previousHash: z.string().nullable(),
    timestamp: z.string().datetime().nullable(),
    version: z.number().int(),
    nbTx: z.number().int().nullable(),
  })
  .openapi("BlockSummary");

export const BlockSchema = BlockSummarySchema.extend({
  merkleRootHash: z.string().nullable(),
  bits: z.string().nullable(),
}).openapi("Block");

export const BlockTxSchema = z
  .object({
    hash: z.string(),
    blockHash: z.string(),
    version: z.number().int(),
    timestamp: z.string().datetime().nullable(),
    type: TxType,
    coinbase: z.boolean(),
  })
  .openapi("BlockTransaction");

export const TransactionSummarySchema = z
  .object({
    hash: z.string(),
    blockHash: z.string(),
    version: z.number().int(),
    timestamp: z.string().datetime().nullable(),
    type: TxType,
  })
  .openapi("TransactionSummary");

const TxInputSchema = z.object({
  fromAddress: z.string().nullable(),
  amount: z.string().nullable(),
  amountLngx: z.string().nullable(),
  previousOutTxHash: z.string().nullable(),
  previousOutTxN: z.number().int().nullable(),
});

const TxOutputSchema = z.object({
  n: z.number().int(),
  valueType: z.string(),
  amount: z.string().nullable(),
  amountLngx: z.string().nullable(),
  address: z.string().nullable(),
  locktime: z.string(),
  genesisHash: z.string().nullable(),
  itemMetadata: z.string().nullable(),
});

export const TransactionSchema = z
  .object({
    hash: z.string(),
    blockHash: z.string(),
    version: z.number().int(),
    timestamp: z.string().datetime().nullable(),
    type: TxType,
    inputs: z.array(TxInputSchema),
    outputs: z.array(TxOutputSchema),
  })
  .openapi("Transaction");

export const AddressSchema = z
  .object({
    address: z.string(),
    balance: z.string(),
    balanceLngx: z.string(),
  })
  .openapi("Address");

export const SupplySchema = z
  .object({
    circulating: z.string(),
    circulatingLngx: z.string(),
    ticker: z.string(),
  })
  .openapi("Supply");

export const StatusSchema = z
  .object({
    network: z.string(),
    ticker: z.string(),
    height: z.number().int().nullable(),
    blocks: z.number().int(),
    transactions: z.number().int(),
  })
  .openapi("Status");

export function listSchema<T extends z.ZodTypeAny>(item: T, name: string) {
  return z.object({ data: z.array(item), pagination: PaginationSchema }).openapi(name);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm -F @explorer/api exec vitest run schemas`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm -F @explorer/api typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/api
git commit -m "feat(api): add shared OpenAPI schemas and query helpers"
```

---

### Task 5: Blocks routes

**Files:**
- Create: `packages/api/src/routes/blocks.ts`
- Create: `packages/api/test/fixtures.ts`
- Modify: `packages/api/src/app.ts`
- Test: `packages/api/test/blocks.test.ts`

**Interfaces:**
- Produces: `registerBlocks(app: OpenAPIHono, db: Database): void`. Registers `GET /api/v1/blocks`, `GET /api/v1/blocks/{id}`, `GET /api/v1/blocks/{id}/transactions`.
- Produces (fixtures.ts): `seedFixtures(db: Database): Promise<void>` — deletes all rows then inserts the canonical fixture set (blocks 1 & 2; `tx_1` on block 1; `tx_cb` coinbase + `tx_2` on block 2; one `tx_out` for `tx_1`; `tx_in` rows; `tx_in_expanded` for `tx_2`; `circulating_supply` = "12345"; `coins_history` addr_1 → [1]).
- Consumes: `getBlocks`, `getBlockByHashOrNumber`, `getBlockTransactions` from `@explorer/db`.

- [ ] **Step 1: Create the fixtures helper**

`packages/api/test/fixtures.ts`:
```ts
import type { Database } from "@explorer/db";
import { schema } from "@explorer/db";

export async function seedFixtures(db: Database): Promise<void> {
  const { block, transaction, txIn, txOut, txInExpanded, coinsHistory, circulatingSupply } = schema;
  await db.delete(txInExpanded);
  await db.delete(txIn);
  await db.delete(txOut);
  await db.delete(transaction);
  await db.delete(coinsHistory);
  await db.delete(circulatingSupply);
  await db.delete(block);

  await db.insert(block).values([
    { version: 1, num: 1, hash: "b_hash_1", timestamp: new Date("2024-01-01T00:00:00Z"), nbTx: 1 },
    { version: 1, num: 2, hash: "b_hash_2", previousHash: "b_hash_1", timestamp: new Date("2024-01-02T00:00:00Z"), nbTx: 1 },
  ]);
  await db.insert(transaction).values([
    { hash: "tx_1", blockHash: "b_hash_1", version: 1, coinbase: false },
    { hash: "tx_cb", blockHash: "b_hash_2", version: 1, coinbase: true },
    { hash: "tx_2", blockHash: "b_hash_2", version: 1, coinbase: false },
  ]);
  await db.insert(txOut).values([
    { txId: 1, txHash: "tx_1", valueType: "token", amount: "500", locktime: "0", scriptPublicKey: "addr_1", n: 0 },
  ]);
  await db.insert(txIn).values([
    { txId: 1, txHash: "tx_1", scriptSignature: {} },
    { txId: 3, txHash: "tx_2", scriptSignature: {}, previousOutTxHash: "tx_1", previousOutTxN: 0 },
  ]);
  await db.insert(txInExpanded).values([
    { txId: 3, txHash: "tx_2", scriptSignature: {}, previousOutTxHash: "tx_1", previousOutTxN: 0, outScriptPublicKey: "addr_1" },
  ]);
  await db.insert(circulatingSupply).values([{ id: 1, circulatingSupply: "12345" }]);
  await db.insert(coinsHistory).values([
    { address: "addr_1", date: new Date("2024-01-03T00:00:00Z"), outIds: [1] },
  ]);
}
```

- [ ] **Step 2: Write the failing test**

`packages/api/test/blocks.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, type Database } from "@explorer/db";
import { createApiApp } from "../src/index.js";
import { seedFixtures } from "./fixtures.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";
let handle: { db: Database; close: () => Promise<void> };
const app = () => createApiApp({ db: handle.db });

beforeAll(async () => {
  handle = createDb(URL);
  await seedFixtures(handle.db);
});
afterAll(async () => { await handle.close(); });

describe("blocks routes", () => {
  it("lists blocks with a pagination envelope", async () => {
    const res = await app().request("/api/v1/blocks?limit=10");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].num).toBe(2);
    expect(body.pagination).toMatchObject({ total: 2, limit: 10, offset: 0, hasMore: false });
  });

  it("returns a single block by number with bits as a string", async () => {
    const res = await app().request("/api/v1/blocks/1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ num: 1, hash: "b_hash_1" });
    expect(body.timestamp).toBe("2024-01-01T00:00:00.000Z");
  });

  it("404s an unknown block as problem+json", async () => {
    const res = await app().request("/api/v1/blocks/999999");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
  });

  it("lists a block's transactions with the coinbase first", async () => {
    const res = await app().request("/api/v1/blocks/2/transactions");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.map((t: { hash: string }) => t.hash)).toEqual(["tx_cb", "tx_2"]);
    expect(body.data[0]).toMatchObject({ type: "coinbase", coinbase: true });
  });

  it("422s an invalid limit as problem+json", async () => {
    const res = await app().request("/api/v1/blocks?limit=abc");
    expect(res.status).toBe(422);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm -F @explorer/api exec vitest run blocks`
Expected: FAIL — blocks routes not registered (404 for `/api/v1/blocks`).

- [ ] **Step 4: Implement `routes/blocks.ts`**

`packages/api/src/routes/blocks.ts`:
```ts
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Database } from "@explorer/db";
import { getBlocks, getBlockByHashOrNumber, getBlockTransactions } from "@explorer/db";
import {
  ListQuery, BlockSummarySchema, BlockSchema, BlockTxSchema, ProblemSchema, listSchema,
} from "../schemas.js";
import { CACHE, classifyTxType } from "../helpers.js";
import { ProblemError } from "../problem.js";

const idParam = z.object({ id: z.string().openapi({ param: { name: "id", in: "path" }, example: "1" }) });
const problem404 = {
  404: { content: { "application/problem+json": { schema: ProblemSchema } }, description: "Not found" },
};

export function registerBlocks(app: OpenAPIHono, db: Database): void {
  app.openapi(
    createRoute({
      method: "get", path: "/api/v1/blocks", tags: ["Blocks"],
      summary: "List blocks",
      request: { query: ListQuery },
      responses: {
        200: { content: { "application/json": { schema: listSchema(BlockSummarySchema, "BlockList") } }, description: "A page of blocks" },
      },
    }),
    async (c) => {
      const { limit, offset, order } = c.req.valid("query");
      const { blocks, pagination } = await getBlocks(db, { limit, offset, order });
      c.header("Cache-Control", `public, s-maxage=${CACHE.list}`);
      return c.json({
        data: blocks.map((b) => ({
          num: b.num, hash: b.hash, previousHash: b.previousHash,
          timestamp: b.timestamp ? b.timestamp.toISOString() : null,
          version: b.version, nbTx: b.nbTx,
        })),
        pagination: { ...pagination, hasMore: pagination.hasMore ?? false },
      });
    },
  );

  app.openapi(
    createRoute({
      method: "get", path: "/api/v1/blocks/{id}", tags: ["Blocks"],
      summary: "Get a block by height or hash",
      request: { params: idParam },
      responses: {
        200: { content: { "application/json": { schema: BlockSchema } }, description: "A block" },
        ...problem404,
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const b = await getBlockByHashOrNumber(db, id);
      if (!b) throw new ProblemError(404, "Block not found", `No block for '${id}'`);
      c.header("Cache-Control", `public, s-maxage=${CACHE.resource}`);
      return c.json({
        num: b.num, hash: b.hash, previousHash: b.previousHash,
        timestamp: b.timestamp ? b.timestamp.toISOString() : null,
        version: b.version, nbTx: b.nbTx,
        merkleRootHash: b.merkleRootHash,
        bits: b.bits !== null ? b.bits.toString() : null,
      });
    },
  );

  app.openapi(
    createRoute({
      method: "get", path: "/api/v1/blocks/{id}/transactions", tags: ["Blocks"],
      summary: "List a block's transactions",
      request: { params: idParam },
      responses: {
        200: { content: { "application/json": { schema: z.object({ data: z.array(BlockTxSchema) }).openapi("BlockTransactionList") } }, description: "The block's transactions" },
        ...problem404,
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const found = await getBlockTransactions(db, id);
      if (!found) throw new ProblemError(404, "Block not found", `No block for '${id}'`);
      c.header("Cache-Control", `public, s-maxage=${CACHE.resource}`);
      return c.json({
        data: found.transactions.map((t) => ({
          hash: t.hash, blockHash: t.blockHash, version: t.version,
          timestamp: t.timestamp ? t.timestamp.toISOString() : null,
          type: classifyTxType(t.txType, t.coinbase),
          coinbase: t.coinbase,
        })),
      });
    },
  );
}
```

- [ ] **Step 5: Wire `registerBlocks` into `app.ts`**

In `packages/api/src/app.ts`: drop the underscore so the db is passed, import the registrar, and call it before `return app`.
```ts
import { registerBlocks } from "./routes/blocks.js";
```
Change the destructure back to `db` and add the call:
```ts
export function createApiApp({ db, rateLimit: rl }: ApiDeps): OpenAPIHono {
```
```ts
  registerBlocks(app, db);

  return app;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm -F @explorer/api exec vitest run blocks`
Expected: PASS (all five cases). Then `pnpm -F @explorer/api test` to confirm no regressions.

- [ ] **Step 7: Typecheck**

Run: `pnpm -F @explorer/api typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/api
git commit -m "feat(api): add blocks endpoints"
```

---

### Task 6: Transactions routes (+ coinbase on TxDetail)

**Files:**
- Modify: `packages/db/src/queries.ts` (add `coinbase` to `TxDetail` and `loadTxDetails`)
- Modify: `packages/db/src/queries.test.ts` (assert the new field)
- Create: `packages/api/src/routes/transactions.ts`
- Modify: `packages/api/src/app.ts`
- Test: `packages/api/test/transactions.test.ts`

**Interfaces:**
- Modifies: `TxDetail` gains `coinbase: boolean`.
- Produces: `registerTransactions(app: OpenAPIHono, db: Database): void` — `GET /api/v1/transactions`, `GET /api/v1/transactions/{hash}`.
- Produces: `serializeTransaction(t: TxDetail)` — exported from `routes/transactions.ts`, reused by addresses in Task 7.

- [ ] **Step 1: Write the failing db test**

In `packages/db/src/queries.test.ts`, extend the existing detail test (`"returns full transaction detail or null"`) with a coinbase assertion:
```ts
  it("returns full transaction detail or null", async () => {
    const tx = await getTransactionByHash(db(), "tx_1");
    expect(tx?.outs[0]?.amount).toBe("500");
    expect(tx?.coinbase).toBe(false);
    expect(await getTransactionByHash(db(), "nope")).toBeNull();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm -F @explorer/db exec vitest run queries`
Expected: FAIL — `coinbase` is `undefined` on `TxDetail`.

- [ ] **Step 3: Add `coinbase` to `TxDetail` and the query**

In `packages/db/src/queries.ts`, add `coinbase: boolean;` to the `TxDetail` interface (right after `timestamp: Date | null;`):
```ts
export interface TxDetail {
  blockHash: string; hash: string; version: number; timestamp: Date | null;
  coinbase: boolean;
  fees: unknown; druidInfo: unknown;
```
In `loadTxDetails`, add `coinbase: transaction.coinbase,` to the `select({...})`:
```ts
      hash: transaction.hash, blockHash: transaction.blockHash, version: transaction.version,
      coinbase: transaction.coinbase,
      fees: transaction.fees, druidInfo: transaction.druidInfo, timestamp: block.timestamp,
```
In the final `return txs.map((t) => ({ ... }))`, add `coinbase: t.coinbase,` next to `version`:
```ts
    blockHash: t.blockHash, hash: t.hash, version: t.version, coinbase: t.coinbase, timestamp: t.timestamp,
```

- [ ] **Step 4: Run db tests to verify they pass**

Run: `pnpm -F @explorer/db exec vitest run queries`
Expected: PASS.

- [ ] **Step 5: Write the failing api test**

`packages/api/test/transactions.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, type Database } from "@explorer/db";
import { createApiApp } from "../src/index.js";
import { seedFixtures } from "./fixtures.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";
let handle: { db: Database; close: () => Promise<void> };
const app = () => createApiApp({ db: handle.db });

beforeAll(async () => { handle = createDb(URL); await seedFixtures(handle.db); });
afterAll(async () => { await handle.close(); });

describe("transactions routes", () => {
  it("lists non-coinbase transactions", async () => {
    const res = await app().request("/api/v1/transactions?limit=10");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.map((t: { hash: string }) => t.hash)).toEqual(["tx_2", "tx_1"]);
    expect(body.pagination.total).toBe(2);
  });

  it("returns full transaction detail with resolved inputs and amounts", async () => {
    const res = await app().request("/api/v1/transactions/tx_2");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ hash: "tx_2", type: "unknown" });
    expect(body.inputs[0]).toMatchObject({ fromAddress: "addr_1", amount: "500" });
    expect(typeof body.inputs[0].amountLngx).toBe("string");
  });

  it("serializes outputs with address and amountLngx", async () => {
    const res = await app().request("/api/v1/transactions/tx_1");
    const body = await res.json();
    expect(body.outputs[0]).toMatchObject({ n: 0, valueType: "token", amount: "500", address: "addr_1" });
    expect(typeof body.outputs[0].amountLngx).toBe("string");
  });

  it("404s an unknown transaction", async () => {
    const res = await app().request("/api/v1/transactions/nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm -F @explorer/api exec vitest run transactions`
Expected: FAIL — routes not registered.

- [ ] **Step 7: Implement `routes/transactions.ts`**

`packages/api/src/routes/transactions.ts`:
```ts
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Database, TxDetail } from "@explorer/db";
import { getTransactions, getTransactionByHash } from "@explorer/db";
import { formatLngx } from "@explorer/config";
import {
  ListQuery, TransactionSummarySchema, TransactionSchema, ProblemSchema, listSchema,
} from "../schemas.js";
import { CACHE, classifyTxType } from "../helpers.js";
import { ProblemError } from "../problem.js";

export function serializeTransaction(t: TxDetail) {
  return {
    hash: t.hash,
    blockHash: t.blockHash,
    version: t.version,
    timestamp: t.timestamp ? t.timestamp.toISOString() : null,
    type: classifyTxType(t.outs[0]?.valueType, t.coinbase),
    inputs: t.ins.map((i) => ({
      fromAddress: i.fromAddress,
      amount: i.amount,
      amountLngx: i.amount !== null ? formatLngx(i.amount) : null,
      previousOutTxHash: i.previousOutTxHash,
      previousOutTxN: i.previousOutTxN,
    })),
    outputs: t.outs.map((o) => ({
      n: o.n,
      valueType: o.valueType,
      amount: o.amount,
      amountLngx: o.amount !== null ? formatLngx(o.amount) : null,
      address: o.scriptPublicKey,
      locktime: o.locktime,
      genesisHash: o.genesisHash,
      itemMetadata: o.itemMetadata,
    })),
  };
}

const hashParam = z.object({
  hash: z.string().openapi({ param: { name: "hash", in: "path" }, example: "tx_2" }),
});

export function registerTransactions(app: OpenAPIHono, db: Database): void {
  app.openapi(
    createRoute({
      method: "get", path: "/api/v1/transactions", tags: ["Transactions"],
      summary: "List transactions (excludes coinbase)",
      request: { query: ListQuery },
      responses: {
        200: { content: { "application/json": { schema: listSchema(TransactionSummarySchema, "TransactionList") } }, description: "A page of transactions" },
      },
    }),
    async (c) => {
      const { limit, offset, order } = c.req.valid("query");
      const { transactions, pagination } = await getTransactions(db, { limit, offset, order });
      c.header("Cache-Control", `public, s-maxage=${CACHE.list}`);
      return c.json({
        data: transactions.map((t) => ({
          hash: t.hash, blockHash: t.blockHash, version: t.version,
          timestamp: t.timestamp ? t.timestamp.toISOString() : null,
          type: classifyTxType(t.txType, false),
        })),
        pagination: { ...pagination, hasMore: pagination.hasMore ?? false },
      });
    },
  );

  app.openapi(
    createRoute({
      method: "get", path: "/api/v1/transactions/{hash}", tags: ["Transactions"],
      summary: "Get a transaction by hash",
      request: { params: hashParam },
      responses: {
        200: { content: { "application/json": { schema: TransactionSchema } }, description: "A transaction" },
        404: { content: { "application/problem+json": { schema: ProblemSchema } }, description: "Not found" },
      },
    }),
    async (c) => {
      const { hash } = c.req.valid("param");
      const tx = await getTransactionByHash(db, hash);
      if (!tx) throw new ProblemError(404, "Transaction not found", `No transaction for '${hash}'`);
      c.header("Cache-Control", `public, s-maxage=${CACHE.resource}`);
      return c.json(serializeTransaction(tx));
    },
  );
}
```

- [ ] **Step 8: Wire into `app.ts`**

```ts
import { registerTransactions } from "./routes/transactions.js";
```
```ts
  registerBlocks(app, db);
  registerTransactions(app, db);

  return app;
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `pnpm -F @explorer/api exec vitest run transactions`
Expected: PASS. Then `pnpm -F @explorer/db test && pnpm -F @explorer/api test`.

- [ ] **Step 10: Typecheck**

Run: `pnpm -F @explorer/db typecheck && pnpm -F @explorer/api typecheck`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add packages/db packages/api
git commit -m "feat(api): add transactions endpoints; expose coinbase on tx detail"
```

---

### Task 7: Addresses routes

**Files:**
- Create: `packages/api/src/routes/addresses.ts`
- Modify: `packages/api/src/app.ts`
- Test: `packages/api/test/addresses.test.ts`

**Interfaces:**
- Produces: `registerAddresses(app: OpenAPIHono, db: Database): void` — `GET /api/v1/addresses/{address}`, `GET /api/v1/addresses/{address}/transactions`.
- Consumes: `getAccountBalance`, `getAccountTransactions` from `@explorer/db`; `serializeTransaction` from `routes/transactions.js`; `AccountTxQuery` from `schemas.js`.

- [ ] **Step 1: Write the failing test**

`packages/api/test/addresses.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, type Database } from "@explorer/db";
import { createApiApp } from "../src/index.js";
import { seedFixtures } from "./fixtures.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";
let handle: { db: Database; close: () => Promise<void> };
const app = () => createApiApp({ db: handle.db });

beforeAll(async () => { handle = createDb(URL); await seedFixtures(handle.db); });
afterAll(async () => { await handle.close(); });

describe("addresses routes", () => {
  it("returns a balance with LNGX formatting", async () => {
    const res = await app().request("/api/v1/addresses/addr_1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ address: "addr_1", balance: "500" });
    expect(typeof body.balanceLngx).toBe("string");
  });

  it("returns balance 0 for an unknown address (never 404)", async () => {
    const res = await app().request("/api/v1/addresses/nobody");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ address: "nobody", balance: "0" });
  });

  it("lists an address's transactions", async () => {
    const res = await app().request("/api/v1/addresses/addr_1/transactions");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].hash).toBe("tx_1");
    expect(body.pagination.total).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm -F @explorer/api exec vitest run addresses`
Expected: FAIL — routes not registered.

- [ ] **Step 3: Implement `routes/addresses.ts`**

`packages/api/src/routes/addresses.ts`:
```ts
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Database } from "@explorer/db";
import { getAccountBalance, getAccountTransactions } from "@explorer/db";
import { formatLngx } from "@explorer/config";
import { AccountTxQuery, AddressSchema, TransactionSchema, listSchema } from "../schemas.js";
import { CACHE } from "../helpers.js";
import { serializeTransaction } from "./transactions.js";

const addressParam = z.object({
  address: z.string().openapi({ param: { name: "address", in: "path" }, example: "addr_1" }),
});

export function registerAddresses(app: OpenAPIHono, db: Database): void {
  app.openapi(
    createRoute({
      method: "get", path: "/api/v1/addresses/{address}", tags: ["Addresses"],
      summary: "Get an address balance",
      request: { params: addressParam },
      responses: {
        200: { content: { "application/json": { schema: AddressSchema } }, description: "The address balance" },
      },
    }),
    async (c) => {
      const { address } = c.req.valid("param");
      const { balance } = await getAccountBalance(db, address);
      c.header("Cache-Control", `public, s-maxage=${CACHE.list}`);
      return c.json({ address, balance, balanceLngx: formatLngx(balance) });
    },
  );

  app.openapi(
    createRoute({
      method: "get", path: "/api/v1/addresses/{address}/transactions", tags: ["Addresses"],
      summary: "List an address's transactions",
      request: { params: addressParam, query: AccountTxQuery },
      responses: {
        200: { content: { "application/json": { schema: listSchema(TransactionSchema, "AddressTransactionList") } }, description: "A page of the address's transactions" },
      },
    }),
    async (c) => {
      const { address } = c.req.valid("param");
      const { limit, offset } = c.req.valid("query");
      const { transactions, pagination } = await getAccountTransactions(db, address, { limit, offset });
      c.header("Cache-Control", `public, s-maxage=${CACHE.list}`);
      return c.json({
        data: transactions.map(serializeTransaction),
        pagination: { ...pagination, hasMore: pagination.hasMore ?? false },
      });
    },
  );
}
```

- [ ] **Step 4: Wire into `app.ts`**

```ts
import { registerAddresses } from "./routes/addresses.js";
```
```ts
  registerBlocks(app, db);
  registerTransactions(app, db);
  registerAddresses(app, db);

  return app;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm -F @explorer/api exec vitest run addresses`
Expected: PASS. Then `pnpm -F @explorer/api test`.

- [ ] **Step 6: Typecheck**

Run: `pnpm -F @explorer/api typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/api
git commit -m "feat(api): add address balance and history endpoints"
```

---

### Task 8: Meta routes — supply, status, OpenAPI doc, docs UI

**Files:**
- Create: `packages/api/src/routes/meta.ts`
- Modify: `packages/api/src/app.ts`
- Test: `packages/api/test/meta.test.ts`

**Interfaces:**
- Produces: `registerMeta(app: OpenAPIHono, db: Database): void` — `GET /api/v1/supply`, `GET /api/v1/status`, `GET /api/v1/openapi.json` (3.1), `GET /api/v1/docs` (Scalar).
- Consumes: `getCirculatingSupply`, `getMaxBlockNum`, `getBlocksCount`, `getTransactionsCount`, and `TOKEN_TICKER`, `NETWORK_DISPLAY_NAME` from `@explorer/config`; `apiReference` from `@scalar/hono-api-reference`.

- [ ] **Step 1: Write the failing test**

`packages/api/test/meta.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, type Database } from "@explorer/db";
import { createApiApp } from "../src/index.js";
import { seedFixtures } from "./fixtures.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";
let handle: { db: Database; close: () => Promise<void> };
const app = () => createApiApp({ db: handle.db });

beforeAll(async () => { handle = createDb(URL); await seedFixtures(handle.db); });
afterAll(async () => { await handle.close(); });

describe("meta routes", () => {
  it("returns circulating supply with LNGX + ticker", async () => {
    const res = await app().request("/api/v1/supply");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ circulating: "12345", ticker: "LNGX" });
    expect(typeof body.circulatingLngx).toBe("string");
  });

  it("returns chain status", async () => {
    const res = await app().request("/api/v1/status");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ network: "Lineage", ticker: "LNGX", height: 2, blocks: 2, transactions: 3 });
  });

  it("serves an OpenAPI 3.1 document covering every path", async () => {
    const res = await app().request("/api/v1/openapi.json");
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.openapi).toBe("3.1.0");
    for (const path of [
      "/api/v1/blocks", "/api/v1/blocks/{id}", "/api/v1/blocks/{id}/transactions",
      "/api/v1/transactions", "/api/v1/transactions/{hash}",
      "/api/v1/addresses/{address}", "/api/v1/addresses/{address}/transactions",
      "/api/v1/supply", "/api/v1/status",
    ]) {
      expect(Object.keys(doc.paths)).toContain(path);
    }
    expect(doc.components.schemas).toHaveProperty("Problem");
  });

  it("serves the Scalar docs page as HTML", async () => {
    const res = await app().request("/api/v1/docs");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm -F @explorer/api exec vitest run meta`
Expected: FAIL — meta routes/doc not registered.

- [ ] **Step 3: Implement `routes/meta.ts`**

`packages/api/src/routes/meta.ts`:
```ts
import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import type { Database } from "@explorer/db";
import {
  getCirculatingSupply, getMaxBlockNum, getBlocksCount, getTransactionsCount,
} from "@explorer/db";
import { formatLngx, TOKEN_TICKER, NETWORK_DISPLAY_NAME } from "@explorer/config";
import { SupplySchema, StatusSchema } from "../schemas.js";
import { CACHE } from "../helpers.js";

export function registerMeta(app: OpenAPIHono, db: Database): void {
  app.openapi(
    createRoute({
      method: "get", path: "/api/v1/supply", tags: ["Chain"],
      summary: "Circulating supply",
      responses: {
        200: { content: { "application/json": { schema: SupplySchema } }, description: "Circulating supply" },
      },
    }),
    async (c) => {
      const { circulatingSupply } = await getCirculatingSupply(db);
      c.header("Cache-Control", `public, s-maxage=${CACHE.list}`);
      return c.json({
        circulating: circulatingSupply,
        circulatingLngx: formatLngx(circulatingSupply),
        ticker: TOKEN_TICKER,
      });
    },
  );

  app.openapi(
    createRoute({
      method: "get", path: "/api/v1/status", tags: ["Chain"],
      summary: "Chain and indexer status",
      responses: {
        200: { content: { "application/json": { schema: StatusSchema } }, description: "Chain status" },
      },
    }),
    async (c) => {
      const [height, blocks, transactions] = await Promise.all([
        getMaxBlockNum(db), getBlocksCount(db), getTransactionsCount(db),
      ]);
      c.header("Cache-Control", `public, s-maxage=${CACHE.status}`);
      return c.json({ network: NETWORK_DISPLAY_NAME, ticker: TOKEN_TICKER, height, blocks, transactions });
    },
  );

  app.doc31("/api/v1/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "Lineage Explorer API",
      version: "1.0.0",
      description: "Read-only public REST API for the Lineage block explorer.",
    },
    servers: [{ url: "/" }],
  });

  app.get("/api/v1/docs", apiReference({ url: "/api/v1/openapi.json" }));
}
```

Note: if the installed `@scalar/hono-api-reference` rejects the `{ url }` option (older major), the failing `docs` test will show it — switch to `apiReference({ spec: { url: "/api/v1/openapi.json" } })`.

- [ ] **Step 4: Wire into `app.ts`**

```ts
import { registerMeta } from "./routes/meta.js";
```
```ts
  registerBlocks(app, db);
  registerTransactions(app, db);
  registerAddresses(app, db);
  registerMeta(app, db);

  return app;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm -F @explorer/api exec vitest run meta`
Expected: PASS. Then the full suite: `pnpm -F @explorer/api test`.

- [ ] **Step 6: Typecheck**

Run: `pnpm -F @explorer/api typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/api
git commit -m "feat(api): add supply/status endpoints and OpenAPI 3.1 doc + Scalar UI"
```

---

### Task 9: Mount the API in `apps/web` + end-to-end checks

**Files:**
- Modify: `apps/web/package.json` (add `@explorer/api`, `hono`)
- Modify: `apps/web/next.config.mjs` (add `@explorer/api` to `transpilePackages`)
- Create: `apps/web/app/api/v1/[[...route]]/route.ts`
- Modify: `README.md` (add an API section pointer)
- Test: `apps/web/e2e/api.spec.ts`

**Interfaces:**
- Consumes: `createApiApp` from `@explorer/api`; `getDb` from `apps/web/lib/db.js`; `handle` from `hono/vercel`.

- [ ] **Step 1: Add dependencies to web**

In `apps/web/package.json` `dependencies`, add:
```json
    "@explorer/api": "workspace:*",
    "hono": "^4.6.0",
```
Run `pnpm install`.

- [ ] **Step 2: Add `@explorer/api` to `transpilePackages`**

In `apps/web/next.config.mjs`, extend the array:
```js
  transpilePackages: ["@explorer/config", "@explorer/db", "@explorer/ui", "@explorer/api"],
```

- [ ] **Step 3: Create the catch-all route handler**

`apps/web/app/api/v1/[[...route]]/route.ts`:
```ts
import { handle } from "hono/vercel";
import { createApiApp } from "@explorer/api";
import { getDb } from "../../../../lib/db.js";

export const dynamic = "force-dynamic";

let handler: ((req: Request) => Response | Promise<Response>) | null = null;

function getHandler(): (req: Request) => Response | Promise<Response> {
  if (!handler) handler = handle(createApiApp({ db: getDb().db }));
  return handler;
}

export function GET(req: Request): Response | Promise<Response> {
  return getHandler()(req);
}

export function OPTIONS(req: Request): Response | Promise<Response> {
  return getHandler()(req);
}
```
The db handle is created lazily on first request so `next build` (which runs with `DATABASE_URL` unset) does not construct it.

- [ ] **Step 4: Write the failing e2e spec**

`apps/web/e2e/api.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test("status endpoint returns chain status", async ({ request }) => {
  const res = await request.get("/api/v1/status");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty("height");
  expect(body).toHaveProperty("ticker", "LNGX");
});

test("openapi document is 3.1 and lists blocks", async ({ request }) => {
  const res = await request.get("/api/v1/openapi.json");
  expect(res.status()).toBe(200);
  const doc = await res.json();
  expect(doc.openapi).toBe("3.1.0");
  expect(Object.keys(doc.paths)).toContain("/api/v1/blocks");
});

test("unknown block is problem+json 404", async ({ request }) => {
  const res = await request.get("/api/v1/blocks/999999");
  expect(res.status()).toBe(404);
  expect(res.headers()["content-type"]).toContain("application/problem+json");
});
```

- [ ] **Step 5: Run the e2e suite to verify the new spec passes**

Run (on this machine, seeded DB on 5433):
```bash
DATABASE_URL=postgres://explorer:explorer@127.0.0.1:5433/explorer_test pnpm -F @explorer/web e2e
```
Expected: all e2e tests pass, including the three new API checks. (The `e2e` script seeds the DB before Playwright starts `next dev`.)

- [ ] **Step 6: Document the API in the README**

In `README.md`, add a short section after the existing usage docs:
```markdown
## Public API

A read-only REST API is served under `/api/v1`. Interactive docs (Scalar) are
at `/api/v1/docs` and the OpenAPI 3.1 document at `/api/v1/openapi.json`.
Access is anonymous with a soft per-IP rate limit.
```

- [ ] **Step 7: Full local verification**

Run:
```bash
pnpm typecheck
pnpm lint
env -u DATABASE_URL pnpm -F @explorer/web build
git grep -niE "aiblock|aibcoin|@2waychain|2wayjs|ablock" -- ':!.github/workflows/ci.yml' && echo FOUND || echo CLEAN
```
Expected: typecheck/lint clean, web build compiles, grep prints `CLEAN`.

- [ ] **Step 8: Commit**

```bash
git add apps/web README.md pnpm-lock.yaml
git commit -m "feat(web): mount public API under /api/v1 with e2e coverage"
```

- [ ] **Step 9: Push and confirm CI**

```bash
git push origin main
```
Watch the run to green (both `verify` and `e2e` jobs):
```bash
gh run watch "$(gh run list --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status --compact
```
Expected: `verify` and `e2e` both succeed.

---

## Self-Review

**Spec coverage:**
- Package `@explorer/api` with injected DB, `app.request()`-testable, portable → Tasks 1–8. ✓
- Mounted in web via one `hono/vercel` catch-all → Task 9. ✓
- Endpoints: blocks (Task 5), transactions (Task 6), addresses (Task 7), supply + status (Task 8). ✓
- Conventions: URI `/api/v1` (all route paths); offset/limit envelope + `hasMore` (schemas + every list route); single resources bare; amounts raw + `…Lngx` (Tasks 6–8); RFC 9457 problem+json (Task 1, used everywhere); 422 on bad params (defaultHook, tested Task 5); Cache-Control per resource class (`CACHE`); CORS open GET (Task 1). ✓
- Rate limiting behind `RateLimitStore` with in-memory impl + headers + 429 (Task 2). ✓
- OpenAPI 3.1 generated + Scalar docs (Task 8). ✓
- Testing incl. generated-doc validity + all error paths + CI wiring (Tasks 1–9). ✓
- `/api/health` & `/api/latest` left untouched/internal. ✓ (no task modifies them)

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output. ✓

**Type consistency:** `createApiApp({ db, rateLimit? })`, `registerBlocks/Transactions/Addresses/Meta(app, db)`, `serializeTransaction(t: TxDetail)`, `classifyTxType(valueType, coinbase)`, `TxDetail.coinbase` (added Task 6, consumed Tasks 6–7), `formatLngx` (config, Task 3) — names/signatures match across tasks. Route paths in Task 8's OpenAPI-coverage test exactly match those declared in Tasks 5–8. ✓
