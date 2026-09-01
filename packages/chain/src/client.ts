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
   * Fetch a `/v1` response and hand its validated body text to `parse`,
   * tolerating the transient empty/error bodies the nodes occasionally return
   * under load. A non-2xx status (with its `application/problem+json` body), an
   * empty body, or a `parse` that throws (e.g. malformed JSON) is retried a few
   * times with a short backoff; if it never resolves we throw a descriptive
   * error (label + url + status/snippet) rather than a bare `SyntaxError`, so a
   * failing cycle is diagnosable. `parse` returning normally ends the retry loop
   * — so a caller that treats a well-formed-but-incomplete body as a valid
   * result (not a transient failure) must return, not throw, for that case.
   */
  private async fetchWithRetry<T>(
    url: string,
    init: RequestInit | undefined,
    label: string,
    timeoutMs: number | undefined,
    parse: (text: string) => T,
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
        return parse(text);
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt < MAX_ATTEMPTS) await delay(RETRY_BACKOFF_MS * attempt);
      }
    }
    throw new Error(`${label} request to ${url} failed after ${MAX_ATTEMPTS} attempts: ${lastError}`);
  }

  private fetchJson<T>(
    url: string,
    init: RequestInit | undefined,
    label: string,
    timeoutMs?: number,
  ): Promise<T> {
    return this.fetchWithRetry(url, init, label, timeoutMs, (text) => JSON.parse(text) as T);
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

  // A batch failure propagates (after `fetchWithRetry`'s retries) rather than
  // being swallowed to `[]`: an empty result is indistinguishable from "the node
  // has none of these txs", which would let the ingestor persist a permanently
  // incomplete block. Letting it throw makes the ingest cycle retry instead.
  // Keys the node genuinely lacks are simply omitted from a successful response,
  // so a short (but non-throwing) result still means "these specific txs are
  // absent" — only transport/HTTP failures reject.
  private async fetchBatch(batchHashes: string[]): Promise<[string, LineageTransaction][]> {
    const entries = await this.fetchJson<BlockchainEntry<LineageTransaction>[]>(
      `${this.config.storageNodeUrl}/v1/blockchain-entries/query`,
      { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ keys: batchHashes }) },
      "fetchBatch",
      30000,
    );
    return entries.map((entry) => [entry.key, entry.data]);
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
   *
   * Network, timeout, non-2xx, and empty-body failures propagate (via
   * `fetchWithRetry`, after its retries) rather than collapsing to `"0"`: the
   * supply cron's own error handler then skips the write and preserves the
   * last-good value. We return `"0"` only when the field is genuinely absent
   * from a valid, non-empty body.
   */
  private fetchSupplyField(url: string, field: "issued" | "total"): Promise<string> {
    return this.fetchWithRetry(url, undefined, `getSupply(${field})`, 15000, (text) => {
      const match = text.match(new RegExp(`"${field}"\\s*:\\s*(\\d+)`));
      return match?.[1] ? new BigNumber(match[1]).toFixed(0) : "0";
    });
  }
}
