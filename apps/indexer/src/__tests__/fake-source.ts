import type { LineageBlock, LineageBlockHeader, LineageTransaction } from "@explorer/chain";
import type { SourceClient } from "../source.js";

export function buildTokenTx(outputs: { address: string; amount: number }[]): LineageTransaction {
  return {
    version: 1,
    druid_info: null,
    inputs: [],
    outputs: outputs.map((o) => ({
      value: { Token: String(o.amount) },
      locktime: 0,
      script_public_key: o.address,
    })),
  };
}

export function buildSpendTx(
  spend: { prevHash: string; n: number },
  outputs: { address: string; amount: number }[],
): LineageTransaction {
  return {
    version: 1,
    druid_info: null,
    inputs: [{ previous_out: { t_hash: spend.prevHash, n: spend.n }, script_signature: { sig: "x" } }],
    outputs: outputs.map((o) => ({
      value: { Token: String(o.amount) },
      locktime: 0,
      script_public_key: o.address,
    })),
  };
}

export interface FakeBlockSpec {
  num: number;
  hash: string;
  previousHash: string;
  miningTxHash: string;
  txHashes: string[]; // block.transactions (non-coinbase)
}

export function buildBlock(spec: FakeBlockSpec): LineageBlock {
  const header: LineageBlockHeader = {
    version: 1,
    bits: 1,
    nonce_and_mining_tx_hash: ["nonce", spec.miningTxHash],
    b_num: spec.num,
    timestamp: 1_700_000_000 + spec.num,
    seed_value: [1, 2, 3],
    previous_hash: spec.previousHash,
    txs_merkle_root_and_hash: ["root", "merkle"],
  };
  return { header, transactions: spec.txHashes };
}

export class FakeSourceClient implements SourceClient {
  private blocks = new Map<number, [string, LineageBlock]>();
  private txs = new Map<string, LineageTransaction>();
  private supply = "0";
  private total = "0";

  addBlock(hash: string, block: LineageBlock): void {
    this.blocks.set(block.header.b_num, [hash, block]);
  }
  addTx(hash: string, tx: LineageTransaction): void {
    this.txs.set(hash, tx);
  }
  setSupply(value: string): void {
    this.supply = value;
  }
  setTotalSupply(value: string): void {
    this.total = value;
  }

  async getLatestBlock(): Promise<LineageBlock> {
    const max = Math.max(...this.blocks.keys());
    const entry = this.blocks.get(max);
    if (!entry) throw new Error("no blocks");
    return entry[1];
  }
  async getBlockRange(start: number, end: number): Promise<[string, Record<"block", LineageBlock>][]> {
    const out: [string, Record<"block", LineageBlock>][] = [];
    for (let i = start; i <= end; i++) {
      const entry = this.blocks.get(i);
      if (entry) out.push([entry[0], { block: entry[1] }]);
    }
    return out;
  }
  async getTransactionsByHash(hashes: string[]): Promise<[string, LineageTransaction][]> {
    return hashes.flatMap((h) => {
      const tx = this.txs.get(h);
      return tx ? [[h, tx] as [string, LineageTransaction]] : [];
    });
  }
  async getCirculatingSupply(): Promise<string> {
    return this.supply;
  }
  async getTotalSupply(): Promise<string> {
    return this.total;
  }
}
