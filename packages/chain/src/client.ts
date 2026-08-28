import BigNumber from "bignumber.js";
import type { LineageBlock, LineageNodeConfig, LineageTransaction } from "./types.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class LineageNodeClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: LineageNodeConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async getLatestBlock(): Promise<LineageBlock> {
    const res = await this.fetchImpl(`${this.config.storageNodeUrl}/latest_block`);
    const data = (await res.json()) as { content: { block: LineageBlock } };
    return data.content.block;
  }

  async getBlockRange(
    startBlock: number,
    endBlock: number,
  ): Promise<[string, Record<"block", LineageBlock>][]> {
    const blocks = [...Array(endBlock - startBlock + 1).keys()].map((b) => b + startBlock);
    const res = await this.fetchImpl(`${this.config.storageNodeUrl}/block_by_num`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(blocks),
    });
    const data = (await res.json()) as { content: [string, Record<"block", LineageBlock>][] };
    return data.content;
  }

  async getTransactionByHash(hash: string): Promise<[[string, LineageTransaction]]> {
    const res = await this.fetchImpl(`${this.config.storageNodeUrl}/blockchain_entry`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: `"${hash}"`,
    });
    const data = (await res.json()) as { content: [[string, LineageTransaction]] };
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
      const res = await this.fetchImpl(`${this.config.storageNodeUrl}/blockchain_entry`, {
        method: "POST",
        headers: JSON_HEADERS,
        body,
        signal: AbortSignal.timeout(30000),
      });
      const data = (await res.json()) as { content: [string, LineageTransaction][] };
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
