import type { LineageBlock, LineageTxOut } from "@explorer/chain";

export interface BlockInsert {
  num: number;
  hash: string;
  previousHash: string;
  version: number;
  timestamp: Date;
  bits: bigint;
  merkleRootHash: string;
  nbTx: number;
  nonceAndMiningTxHash: unknown;
  seed: unknown;
}

export function mapBlockRow(hash: string, block: LineageBlock): BlockInsert {
  const h = block.header;
  return {
    num: h.b_num,
    hash,
    previousHash: h.previous_hash,
    version: h.version,
    timestamp: new Date(h.timestamp * 1000),
    bits: BigInt(h.bits),
    merkleRootHash: h.txs_merkle_root_and_hash[1],
    nbTx: block.transactions.length,
    nonceAndMiningTxHash: h.nonce_and_mining_tx_hash,
    seed: h.seed_value,
  };
}

export interface OutputInsert {
  txId: number;
  txHash: string;
  valueType: "token" | "item";
  amount: string;
  locktime: string;
  genesisHash: string | null;
  scriptPublicKey: string | null;
  itemMetadata: string | null;
  // The item an item output belongs to (see schema.txOut.itemGenesis).
  itemGenesis: string | null;
  n: number;
  isToken: boolean;
}

export function mapOutputRow(
  txId: number,
  txHash: string,
  output: LineageTxOut,
  n: number,
): OutputInsert {
  const common = {
    txId,
    txHash,
    locktime: String(output.locktime),
    scriptPublicKey: output.script_public_key,
    n,
  };
  if ("Token" in output.value) {
    return {
      ...common,
      valueType: "token",
      amount: output.value.Token, // already a precision-safe decimal string
      genesisHash: null,
      itemMetadata: null,
      itemGenesis: null,
      isToken: true,
    };
  }
  const item = output.value.Item;
  return {
    ...common,
    valueType: "item",
    amount: item.amount, // already a precision-safe decimal string
    genesisHash: item.genesis_hash,
    itemMetadata: item.metadata,
    // A creation output has no genesis hash on chain; the item is this transaction.
    itemGenesis: item.genesis_hash ?? txHash,
    isToken: false,
  };
}

/**
 * The DRUID of a two-way swap half, or null for an ordinary transaction. The
 * node's `druid_info` is untyped here, so anything but an object carrying a
 * non-empty string `druid` is treated as "not a swap half".
 */
export function druidOf(druidInfo: unknown): string | null {
  if (typeof druidInfo !== "object" || druidInfo === null) return null;
  const druid = (druidInfo as { druid?: unknown }).druid;
  return typeof druid === "string" && druid !== "" ? druid : null;
}
