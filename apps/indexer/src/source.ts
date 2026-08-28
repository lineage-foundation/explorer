import type { LineageBlock, LineageTransaction } from "@explorer/chain";

export interface SourceClient {
  getLatestBlock(): Promise<LineageBlock>;
  getBlockRange(start: number, end: number): Promise<[string, Record<"block", LineageBlock>][]>;
  getTransactionsByHash(hashes: string[]): Promise<[string, LineageTransaction][]>;
  getCirculatingSupply(): Promise<string>;
}
