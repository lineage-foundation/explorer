// Vendored from @lineage/sdk-js (github.com/lineage-foundation/sdk-js).
// The read-only explorer only needs these as TYPES — it never calls the SDK
// at runtime. TODO: once @lineage/sdk-js is published to npm, replace these
// local declarations with `import type { ITransaction } from "@lineage/sdk-js"`
// and `export type LineageTransaction = ITransaction`.
export interface LineageOutPoint {
  t_hash: string;
  n: number;
}

export interface LineageTxIn {
  previous_out: LineageOutPoint | null;
  script_signature: unknown;
}

export interface LineageAssetToken {
  Token: number;
}

export interface LineageAssetItem {
  Item: {
    amount: number;
    genesis_hash: string;
    metadata: string | null;
  };
}

export interface LineageTxOut {
  value: LineageAssetToken | LineageAssetItem;
  locktime: number;
  script_public_key: string | null;
}

export interface LineageTransaction {
  inputs: LineageTxIn[];
  outputs: LineageTxOut[];
  version: number;
  druid_info: unknown | null;
}

export interface LineageBlockHeader {
  version: number;
  bits: number;
  nonce_and_mining_tx_hash: unknown[];
  b_num: number;
  timestamp: number;
  seed_value: number[];
  previous_hash: string;
  txs_merkle_root_and_hash: [string, string];
}

export interface LineageBlock {
  header: LineageBlockHeader;
  transactions: string[];
}

export interface LineageNodeConfig {
  storageNodeUrl: string;
  mempoolNodeUrl?: string;
  issuedSupplyUrl?: string;
  totalSupplyUrl?: string;
  txHttpBatchSize?: number;
  txHttpConcurrency?: number;
  txHttpInterBatchDelayMs?: number;
  fetchImpl?: typeof fetch;
}
