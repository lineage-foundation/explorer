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
