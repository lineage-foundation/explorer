import BigNumber from "bignumber.js";
import type { LineageBlock, LineageNodeConfig, LineageTransaction } from "./types.js";

const JSON_HEADERS = { "Content-Type": "application/json" };
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class LineageNodeClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: LineageNodeConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  /**
   * Fetch and JSON-parse a node response, tolerating the transient empty/error
   * bodies the nodes occasionally return under load. A non-2xx status, an empty
   * body, or invalid JSON is retried a few times with a short backoff; if it
   * never resolves, we throw a descriptive error (label + url + status/snippet)
   * rather than a bare `SyntaxError: Unexpected end of JSON input`, so a failing
   * ingest cycle is diagnosable.
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
    const data = await this.fetchJson<{ content: { block: LineageBlock } }>(
      `${this.config.storageNodeUrl}/latest_block`,
      undefined,
      "getLatestBlock",
      15000,
    );
    return data.content.block;
  }

  async getBlockRange(
    startBlock: number,
    endBlock: number,
  ): Promise<[string, Record<"block", LineageBlock>][]> {
    const blocks = [...Array(endBlock - startBlock + 1).keys()].map((b) => b + startBlock);
    const data = await this.fetchJson<{ content: [string, Record<"block", LineageBlock>][] }>(
      `${this.config.storageNodeUrl}/block_by_num`,
      { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(blocks) },
      "getBlockRange",
      30000,
    );
    return data.content;
  }

  async getTransactionByHash(hash: string): Promise<[[string, LineageTransaction]]> {
    const data = await this.fetchJson<{ content: [[string, LineageTransaction]] }>(
      `${this.config.storageNodeUrl}/blockchain_entry`,
      { method: "POST", headers: JSON_HEADERS, body: `"${hash}"` },
      "getTransactionByHash",
      30000,
    );
    return data.content;
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
      const body = `[${batchHashes.map((h) => `"${h}"`).join(",")}]`;
      const data = await this.fetchJson<{ content: [string, LineageTransaction][] }>(
        `${this.config.storageNodeUrl}/blockchain_entry`,
        { method: "POST", headers: JSON_HEADERS, body },
        "fetchBatch",
        30000,
      );
      return data.content;
    } catch {
      return [];
    }
  }

  getCirculatingSupply(): Promise<string> {
    return this.getIssuedSupply();
  }

  getIssuedSupply(): Promise<string> {
    const base = this.config.mempoolNodeUrl || this.config.storageNodeUrl;
    const url = this.config.issuedSupplyUrl || `${base}/issued_supply`;
    return this.fetchSupply(url);
  }

  getTotalSupply(): Promise<string> {
    const base = this.config.mempoolNodeUrl || this.config.storageNodeUrl;
    const url = this.config.totalSupplyUrl || `${base}/total_supply`;
    return this.fetchSupply(url);
  }

  private async fetchSupply(url: string): Promise<string> {
    try {
      const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(15000) });
      const text = await res.text();
      const match = text.match(/"content"\s*:\s*("?\d+"?)/);
      if (match?.[1]) {
        return new BigNumber(match[1].replace(/"/g, "")).toFixed(0);
      }
      try {
        const data = JSON.parse(text) as { content?: unknown };
        if (data?.content !== undefined && data?.content !== null) {
          return new BigNumber(String(data.content)).toFixed(0);
        }
      } catch {
        /* fall through to "0" */
      }
      return "0";
    } catch {
      return "0";
    }
  }
}
