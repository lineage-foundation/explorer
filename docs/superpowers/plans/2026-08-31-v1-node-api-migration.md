# LineageNodeClient `/v1` Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the explorer's `LineageNodeClient` from the fleet node's legacy RPC API to its new `/v1` REST API, keeping the client's public interface identical so the indexer and web are unaffected.

**Architecture:** Rewrite the client's HTTP calls and response mapping for `/v1` (plain JSON, `application/problem+json` errors), preserving every method signature/return shape. Supply integers exceed `2^53`, so `/v1/supply` is parsed from raw text. Then drop the now-obsolete supply-URL config/env plumbing.

**Tech Stack:** TypeScript (strict, ESM), `@explorer/chain` (`LineageNodeClient`), `@explorer/indexer` config, Vitest.

## Global Constraints

- Strict TypeScript (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, Bundler); ESM; every relative import uses a `.js` specifier resolving to `.ts`.
- ESLint: `@typescript-eslint/no-explicit-any` is an error; `no-console` is an error except `console.warn`/`console.error`.
- No AI attribution in commits/code/docs — commit messages carry NO `Co-Authored-By: Claude`/`Claude-Session`/Anthropic trailer. No legacy-brand strings (CI rebrand grep in `.github/workflows/ci.yml` is authoritative).
- The public `LineageNodeClient` method signatures and return shapes are UNCHANGED (interface-stable migration).
- Supply/amounts are strings via bignumber; supply values exceed `2^53` and MUST be parsed from raw text, never `res.json()`.
- No API-key support.
- Live-verified `/v1` shapes: `GET /v1/blocks/latest` → `{ block: { block: <blk> } }`; `GET /v1/blocks?num=…` → `[{ key, item_meta, data: { block: <blk> } }]` (`key` = block hash); `POST /v1/blockchain-entries/query {keys}` → `[{ key, item_meta, data: <tx> }]` (missing keys omitted); `GET /v1/supply` → `{ total, issued }`.
- Local nodes: storage `http://localhost:3001`, mempool `http://localhost:3003` (the `/v1` fleet is running).

## File Structure

```
packages/chain/src/client.ts             modify — /v1 endpoints, response mapping, block-range chunking, raw-text supply
packages/chain/src/client.test.ts         modify — assert /v1 requests/responses, big-int supply, chunking
packages/chain/src/types.ts               modify — LineageNodeConfig drops issuedSupplyUrl/totalSupplyUrl; refresh vendoring comment
apps/indexer/src/config.ts                modify — IndexerConfig + loadConfig drop the two supply URLs
apps/indexer/src/index.ts                 modify — construct client without the two supply URLs
.env.example                              modify — remove the two supply-URL lines
turbo.json                                modify — passThroughEnv drops the two supply vars
README.md                                 modify — update node-API notes (drop supply-URL vars)
```

---

### Task 1: Migrate `LineageNodeClient` to the `/v1` API

**Files:**
- Modify: `packages/chain/src/client.ts`
- Test: `packages/chain/src/client.test.ts`

**Interfaces:**
- Produces (unchanged signatures): `getLatestBlock(): Promise<LineageBlock>`, `getBlockRange(start, end): Promise<[string, Record<"block", LineageBlock>][]>`, `getTransactionsByHash(hashes, batchSize?): Promise<[string, LineageTransaction][]>`, `getCirculatingSupply()/getIssuedSupply()/getTotalSupply(): Promise<string>`. The singular `getTransactionByHash` is REMOVED (dead code; its endpoint no longer exists).
- Consumes: `LineageNodeConfig` (still has the now-unused `issuedSupplyUrl`/`totalSupplyUrl` optional fields — removed in Task 2).

- [ ] **Step 1: Rewrite the test file for `/v1`**

Replace the entire contents of `packages/chain/src/client.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { LineageNodeClient } from "./client.js";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
function textResponse(text: string): Response {
  return new Response(text, { status: 200, headers: { "content-type": "application/json" } });
}

describe("LineageNodeClient", () => {
  it("fetches the latest block from /v1/blocks/latest (unwraps block.block)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ block: { block: { header: { b_num: 42 }, transactions: [] } } }),
    );
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", fetchImpl });
    const block = await client.getLatestBlock();
    expect(block.header.b_num).toBe(42);
    expect(fetchImpl.mock.calls[0]![0]).toBe("http://node/v1/blocks/latest");
  });

  it("GETs /v1/blocks?num=… and maps entries to [hash, {block}]", async () => {
    const entries = [
      { key: "h3", item_meta: { type: "block", block_num: 3, tx_len: 1 }, data: { block: { header: { b_num: 3 } } } },
      { key: "h4", item_meta: { type: "block", block_num: 4, tx_len: 1 }, data: { block: { header: { b_num: 4 } } } },
      { key: "h5", item_meta: { type: "block", block_num: 5, tx_len: 1 }, data: { block: { header: { b_num: 5 } } } },
    ];
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(entries));
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", fetchImpl });
    const range = await client.getBlockRange(3, 5);
    expect(fetchImpl.mock.calls[0]![0]).toBe("http://node/v1/blocks?num=3&num=4&num=5");
    expect(range).toEqual([
      ["h3", { block: { header: { b_num: 3 } } }],
      ["h4", { block: { header: { b_num: 4 } } }],
      ["h5", { block: { header: { b_num: 5 } } }],
    ]);
  });

  it("chunks a large block range into multiple GETs of <=100 heights", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", fetchImpl });
    await client.getBlockRange(0, 150);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const first = fetchImpl.mock.calls[0]![0] as string;
    const second = fetchImpl.mock.calls[1]![0] as string;
    expect(first).toContain("num=0");
    expect(first).toContain("num=99");
    expect(first).not.toContain("num=100");
    expect(second).toContain("num=100");
    expect(second).toContain("num=150");
  });

  it("POSTs {keys} to /v1/blockchain-entries/query and maps entries to [hash, tx]", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([{ key: "h1", item_meta: { type: "tx", block_num: 0, tx_num: 0 }, data: { inputs: [], outputs: [], version: 0, druid_info: null } }]),
    );
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", fetchImpl });
    const result = await client.getTransactionsByHash(["h1"]);
    expect(fetchImpl.mock.calls[0]![0]).toBe("http://node/v1/blockchain-entries/query");
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body)).toEqual({ keys: ["h1"] });
    expect(result).toEqual([["h1", { inputs: [], outputs: [], version: 0, druid_info: null }]]);
  });

  it("tolerates a failing batch by returning no entries for it", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse([{ key: "h1", item_meta: {}, data: { inputs: [] } }]))
      .mockRejectedValue(new Error("boom"));
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", fetchImpl, txHttpBatchSize: 1, txHttpConcurrency: 2 });
    const result = await client.getTransactionsByHash(["h1", "h2"]);
    expect(result).toEqual([["h1", { inputs: [] }]]);
  });

  it("parses supply from /v1/supply raw text, preserving digits beyond 2^53", async () => {
    const big = { total: 360360000000000000, issued: 90091258856512411 };
    // Emit the exact large integers as raw JSON text (no JS-number round-trip).
    const raw = `{"total":360360000000000000,"issued":90091258856512411}`;
    const fetchImpl = vi.fn().mockResolvedValue(textResponse(raw));
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", mempoolNodeUrl: "http://mempool", fetchImpl });
    expect(await client.getIssuedSupply()).toBe("90091258856512411");
    expect(await client.getTotalSupply()).toBe("360360000000000000");
    expect(fetchImpl.mock.calls[0]![0]).toBe("http://mempool/v1/supply");
    // Sanity: JSON.parse would have corrupted these.
    expect(String(big.issued)).not.toBe("90091258856512411");
  });

  it("retries a transient empty body and then succeeds", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ block: { block: { header: { b_num: 7 }, transactions: [] } } }));
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", fetchImpl });
    const block = await client.getLatestBlock();
    expect(block.header.b_num).toBe(7);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws a descriptive error (not a raw SyntaxError) when the body stays empty", async () => {
    const fetchImpl = vi.fn().mockImplementation(() => new Response("", { status: 200 }));
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", fetchImpl });
    await expect(client.getLatestBlock()).rejects.toThrow(
      /getLatestBlock request to http:\/\/node\/v1\/blocks\/latest failed after 3 attempts: empty response body \(HTTP 200\)/,
    );
    await expect(client.getLatestBlock()).rejects.not.toThrow(/Unexpected end of JSON input/);
  });

  it("surfaces a non-2xx problem+json status with a body snippet", async () => {
    const fetchImpl = vi.fn().mockImplementation(
      () => new Response(JSON.stringify({ title: "Not Found", status: 404 }), { status: 404 }),
    );
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", fetchImpl });
    await expect(client.getBlockRange(1, 1)).rejects.toThrow(/HTTP 404: /);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm -F @explorer/chain exec vitest run`
Expected: FAIL — client still calls the old endpoints / has no `/v1` behavior.

- [ ] **Step 3: Rewrite `client.ts` for `/v1`**

Replace the entire contents of `packages/chain/src/client.ts`:
```ts
import BigNumber from "bignumber.js";
import type { LineageBlock, LineageNodeConfig, LineageTransaction } from "./types.js";

const JSON_HEADERS = { "Content-Type": "application/json" };
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 200;
// Heights per `/v1/blocks?num=…` GET, kept small so the URL never approaches
// server query-string limits on a full ingest range.
const BLOCK_NUM_CHUNK = 100;

// A `/v1` blockchain entry: a block's `data` is `{ block: … }`; a tx's `data`
// is the transaction itself. `item_meta` is ignored by the explorer.
interface BlockchainEntry<T> {
  key: string;
  item_meta: unknown;
  data: T;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class LineageNodeClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: LineageNodeConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  /**
   * Fetch and JSON-parse a `/v1` response, tolerating the transient empty/error
   * bodies the nodes occasionally return under load. A non-2xx status (with its
   * `application/problem+json` body), an empty body, or invalid JSON is retried
   * a few times with a short backoff; if it never resolves we throw a
   * descriptive error (label + url + status/snippet) rather than a bare
   * `SyntaxError`, so a failing ingest cycle is diagnosable.
   */
  private async fetchJson<T>(
    url: string,
    init: RequestInit | undefined,
    label: string,
    timeoutMs?: number,
  ): Promise<T> {
    let lastError = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const signal = timeoutMs !== undefined ? AbortSignal.timeout(timeoutMs) : undefined;
        const res = await this.fetchImpl(url, signal ? { ...init, signal } : init);
        const text = await res.text();
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
        }
        if (text.trim() === "") {
          throw new Error(`empty response body (HTTP ${res.status})`);
        }
        return JSON.parse(text) as T;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt < MAX_ATTEMPTS) await delay(RETRY_BACKOFF_MS * attempt);
      }
    }
    throw new Error(`${label} request to ${url} failed after ${MAX_ATTEMPTS} attempts: ${lastError}`);
  }

  async getLatestBlock(): Promise<LineageBlock> {
    const data = await this.fetchJson<{ block: { block: LineageBlock } }>(
      `${this.config.storageNodeUrl}/v1/blocks/latest`,
      undefined,
      "getLatestBlock",
      15000,
    );
    return data.block.block;
  }

  async getBlockRange(
    startBlock: number,
    endBlock: number,
  ): Promise<[string, Record<"block", LineageBlock>][]> {
    const out: [string, Record<"block", LineageBlock>][] = [];
    for (let from = startBlock; from <= endBlock; from += BLOCK_NUM_CHUNK) {
      const to = Math.min(from + BLOCK_NUM_CHUNK - 1, endBlock);
      const query = [...Array(to - from + 1).keys()].map((b) => `num=${b + from}`).join("&");
      const entries = await this.fetchJson<BlockchainEntry<{ block: LineageBlock }>[]>(
        `${this.config.storageNodeUrl}/v1/blocks?${query}`,
        undefined,
        "getBlockRange",
        30000,
      );
      for (const entry of entries) out.push([entry.key, { block: entry.data.block }]);
    }
    return out;
  }

  async getTransactionsByHash(
    hashes: string[],
    batchSize?: number,
  ): Promise<[string, LineageTransaction][]> {
    if (hashes.length === 0) return [];
    const effectiveBatchSize = Math.max(1, batchSize ?? this.config.txHttpBatchSize ?? 200);
    const concurrency = Math.max(1, this.config.txHttpConcurrency ?? 4);
    const interBatchDelayMs = this.config.txHttpInterBatchDelayMs ?? 0;

    const batches: string[][] = [];
    for (let i = 0; i < hashes.length; i += effectiveBatchSize) {
      batches.push(hashes.slice(i, i + effectiveBatchSize));
    }

    const all: [string, LineageTransaction][] = [];
    for (let i = 0; i < batches.length; i += concurrency) {
      const window = batches.slice(i, i + concurrency);
      const settled = await Promise.all(window.map((batch) => this.fetchBatch(batch)));
      for (const part of settled) all.push(...part);
      if (i + concurrency < batches.length && interBatchDelayMs > 0) {
        await delay(interBatchDelayMs);
      }
    }
    return all;
  }

  private async fetchBatch(batchHashes: string[]): Promise<[string, LineageTransaction][]> {
    try {
      const entries = await this.fetchJson<BlockchainEntry<LineageTransaction>[]>(
        `${this.config.storageNodeUrl}/v1/blockchain-entries/query`,
        { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ keys: batchHashes }) },
        "fetchBatch",
        30000,
      );
      return entries.map((entry) => [entry.key, entry.data]);
    } catch {
      return [];
    }
  }

  getCirculatingSupply(): Promise<string> {
    return this.getIssuedSupply();
  }

  getIssuedSupply(): Promise<string> {
    const base = this.config.mempoolNodeUrl || this.config.storageNodeUrl;
    return this.fetchSupplyField(`${base}/v1/supply`, "issued");
  }

  getTotalSupply(): Promise<string> {
    const base = this.config.mempoolNodeUrl || this.config.storageNodeUrl;
    return this.fetchSupplyField(`${base}/v1/supply`, "total");
  }

  /**
   * `/v1/supply` returns `total`/`issued` as JSON integers that exceed 2^53, so
   * `JSON.parse` would lose precision. Read the response as raw text and extract
   * the requested field's digit run, then hand the string to BigNumber.
   */
  private async fetchSupplyField(url: string, field: "issued" | "total"): Promise<string> {
    try {
      const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(15000) });
      const text = await res.text();
      const match = text.match(new RegExp(`"${field}"\\s*:\\s*(\\d+)`));
      if (match?.[1]) return new BigNumber(match[1]).toFixed(0);
      return "0";
    } catch {
      return "0";
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm -F @explorer/chain exec vitest run`
Expected: PASS (all cases). Then `pnpm -F @explorer/chain typecheck` — no errors.

- [ ] **Step 5: Confirm the indexer still type-checks (interface stable)**

Run: `pnpm -F @explorer/indexer typecheck`
Expected: no errors (the `SourceClient` interface and all consumed method shapes are unchanged; `getTransactionByHash` was not part of that interface).

- [ ] **Step 6: Commit**

```bash
git add packages/chain/src/client.ts packages/chain/src/client.test.ts
git commit -m "feat(chain): migrate LineageNodeClient to the fleet /v1 REST API"
```

---

### Task 2: Drop obsolete supply-URL config + env plumbing, and smoke-test live

**Files:**
- Modify: `packages/chain/src/types.ts`
- Modify: `apps/indexer/src/config.ts`
- Modify: `apps/indexer/src/index.ts`
- Modify: `.env.example`
- Modify: `turbo.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: the migrated `LineageNodeClient` from Task 1 (no longer reads `issuedSupplyUrl`/`totalSupplyUrl`).
- Produces: `LineageNodeConfig` and `IndexerConfig` without `issuedSupplyUrl`/`totalSupplyUrl`.

- [ ] **Step 1: Remove the fields from `LineageNodeConfig`**

In `packages/chain/src/types.ts`, delete the `issuedSupplyUrl?` and `totalSupplyUrl?` lines from `LineageNodeConfig`:
```ts
export interface LineageNodeConfig {
  storageNodeUrl: string;
  mempoolNodeUrl?: string;
  txHttpBatchSize?: number;
  txHttpConcurrency?: number;
  txHttpInterBatchDelayMs?: number;
  fetchImpl?: typeof fetch;
}
```
Also refresh the vendoring comment at the top of `types.ts` to note the `/v1` source (replace the "once @lineage/sdk-js is published" wording with a note that the SDK is at v2.0.0 on the `/v1` API and the explorer still vendors only the types, never the SDK runtime).

- [ ] **Step 2: Remove the fields from the indexer config**

In `apps/indexer/src/config.ts`, delete the `issuedSupplyUrl?` and `totalSupplyUrl?` lines from `IndexerConfig`, and delete these two lines from `loadConfig`'s returned object:
```ts
    issuedSupplyUrl: env.LINEAGE_ISSUED_SUPPLY_URL,
    totalSupplyUrl: env.LINEAGE_TOTAL_SUPPLY_URL,
```

- [ ] **Step 3: Stop passing them when constructing the client**

In `apps/indexer/src/index.ts`, remove the two lines from the `new LineageNodeClient({...})` call:
```ts
  const source = new LineageNodeClient({
    storageNodeUrl: config.storageNodeUrl,
    mempoolNodeUrl: config.mempoolNodeUrl,
    txHttpBatchSize: config.txHttpBatchSize,
    txHttpConcurrency: config.txHttpConcurrency,
    txHttpInterBatchDelayMs: config.txHttpInterBatchDelayMs,
  });
```

- [ ] **Step 4: Remove the env vars from `.env.example` and `turbo.json`**

In `.env.example`, delete the three lines:
```
# Optional explicit overrides (default: derived as ${mempool||storage}/issued_supply etc.)
# LINEAGE_ISSUED_SUPPLY_URL=
# LINEAGE_TOTAL_SUPPLY_URL=
```
In `turbo.json`, delete the two `passThroughEnv` entries `"LINEAGE_ISSUED_SUPPLY_URL"` and `"LINEAGE_TOTAL_SUPPLY_URL"`.

- [ ] **Step 5: Update the README**

In `README.md`, find any mention of `LINEAGE_ISSUED_SUPPLY_URL` / `LINEAGE_TOTAL_SUPPLY_URL` or the old node endpoints and update the node-integration description to state that the indexer talks to the fleet **`/v1` REST API** (`/v1/blocks/*`, `/v1/blockchain-entries/query`, `/v1/supply`) and that supply comes from the mempool node's `/v1/supply`. Remove the two supply-URL override vars from any env table. (Run `grep -n "SUPPLY_URL\|issued_supply\|total_supply\|block_by_num\|latest_block\|blockchain_entry" README.md` to find every spot.)

- [ ] **Step 6: Typecheck, lint, build, and run the suites**

Run:
```bash
pnpm typecheck
pnpm lint
pnpm -F @explorer/chain test
TEST_DATABASE_URL=postgres://explorer:explorer@127.0.0.1:5433/explorer_test pnpm -F @explorer/indexer test
env -u DATABASE_URL pnpm -F @explorer/web build
# Run the same rebrand grep the CI 'verify' job runs (pattern lives in .github/workflows/ci.yml); expect no matches.
```
Expected: typecheck/lint clean; chain + indexer tests pass; web build compiles; rebrand grep prints `CLEAN`. (If `apps/indexer/src/__tests__/config.test.ts` asserts the removed fields, update it so it no longer expects `issuedSupplyUrl`/`totalSupplyUrl`.)

- [ ] **Step 7: Smoke-test the real client against the live `/v1` fleet**

The `/v1` fleet is running on `localhost:3001`/`:3003`. Run this one-off (not committed) to confirm the migrated client works end-to-end:
```bash
cat > /Users/barry/.claude/jobs/2477eeda/tmp/v1-smoke.ts <<'EOF'
import { LineageNodeClient } from "@explorer/chain";
const c = new LineageNodeClient({ storageNodeUrl: "http://localhost:3001", mempoolNodeUrl: "http://localhost:3003" });
const latest = await c.getLatestBlock();
console.error("latest b_num:", latest.header.b_num);
const range = await c.getBlockRange(0, 1);
console.error("range:", range.map(([hash]) => hash));
const supply = await c.getCirculatingSupply();
console.error("circulating supply:", supply);
if (typeof latest.header.b_num !== "number" || range.length !== 2 || !/^\d+$/.test(supply)) {
  console.error("SMOKE FAIL"); process.exit(1);
}
console.error("SMOKE OK");
EOF
pnpm -F @explorer/indexer exec tsx /Users/barry/.claude/jobs/2477eeda/tmp/v1-smoke.ts
```
Expected: prints a real `latest b_num`, two block hashes for range `[0,1]`, a numeric circulating-supply string, and `SMOKE OK`. (This is verification only — do not commit the script.)

- [ ] **Step 8: Commit**

```bash
git add packages/chain/src/types.ts apps/indexer/src/config.ts apps/indexer/src/index.ts .env.example turbo.json README.md
# plus apps/indexer/src/__tests__/config.test.ts if it was updated in Step 6
git commit -m "chore: drop obsolete supply-URL config now that the client uses /v1/supply"
```

- [ ] **Step 9: Push and confirm CI**

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
- Interface-stable migration of every method to `/v1` (blocks/latest, blocks?num, blockchain-entries/query, supply) → Task 1. ✓
- Block unwrap depth (`data.block.block` for latest, `data.block` for range entries), tx `data` used directly, entry `key`=hash → Task 1 (code + tests). ✓
- Block-range chunking (≤100 heights per GET) → Task 1 (code + a chunking test). ✓
- `application/problem+json` non-2xx handled by `fetchJson` → Task 1 (kept; a 404 test). ✓
- Supply parsed from raw text (>2^53 preserved) → Task 1 (code + a big-int test). ✓
- Drop singular `getTransactionByHash` (dead code) → Task 1. ✓
- Config/env cleanup (LineageNodeConfig, IndexerConfig, index.ts, .env.example, turbo.json, README) → Task 2. ✓
- No API-key support → not added anywhere. ✓
- Live smoke against the running `/v1` fleet → Task 2 Step 7. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full file/edit content; commands have expected output. ✓

**Type consistency:** `BlockchainEntry<T>` used for both block (`data: { block: LineageBlock }`) and tx (`data: LineageTransaction`) entries. `getBlockRange` returns `[string, Record<"block", LineageBlock>][]` (unchanged). `fetchSupplyField(url, "issued"|"total")` used by both supply getters. `LineageNodeConfig` fields removed in Task 2 are not referenced by the Task 1 client. ✓
