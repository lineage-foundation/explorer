import { sql } from "drizzle-orm";
import {
  pgTable, serial, integer, varchar, timestamp, jsonb, boolean, numeric, bigint,
  uniqueIndex, index, foreignKey,
} from "drizzle-orm/pg-core";

export const block = pgTable(
  "block",
  {
    id: serial("id").primaryKey(),
    version: integer("version").notNull(),
    num: integer("num").notNull(),
    hash: varchar("hash").notNull(),
    previousHash: varchar("previousHash"),
    timestamp: timestamp("timestamp", { withTimezone: false }),
    createdAt: timestamp("createdAt", { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: false }).defaultNow().notNull(),
    merkleRootHash: varchar("merkleRootHash"),
    bits: bigint("bits", { mode: "bigint" }),
    nbTx: integer("nbTx").default(0),
    nonceAndMiningTxHash: jsonb("nonceAndMiningTxHash"),
    seed: jsonb("seed"),
  },
  (t) => ({
    hashUnique: uniqueIndex("UK_block_hash").on(t.hash),
    numUnique: uniqueIndex("UK_block_num").on(t.num),
    // Supports LIKE 'prefix%' search on block hashes under a non-C collation.
    // NOTE: drizzle-kit 0.24 omits the operator class from generated SQL, so the
    // `varchar_pattern_ops` class is applied by hand in the migration file.
    hashPrefix: index("IX_block_hash_prefix").on(t.hash.op("varchar_pattern_ops")),
  }),
);

export const transaction = pgTable(
  "transaction",
  {
    id: serial("id").primaryKey(),
    hash: varchar("hash").notNull(),
    blockHash: varchar("blockHash").notNull(),
    version: integer("version").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: false }).defaultNow().notNull(),
    fees: jsonb("fees"),
    druidInfo: jsonb("druidInfo"),
    coinbase: boolean("coinbase").default(false).notNull(),
  },
  (t) => ({
    hashUnique: uniqueIndex("UK_transaction_hash").on(t.hash),
    // Supports LIKE 'prefix%' search on transaction hashes under a non-C collation.
    hashPrefix: index("IX_transaction_hash_prefix").on(t.hash.op("varchar_pattern_ops")),
    blockFk: foreignKey({
      columns: [t.blockHash],
      foreignColumns: [block.hash],
      name: "FK_08f3024b3fad3c62274225faf91",
    }),
  }),
);

export const txIn = pgTable(
  "tx_in",
  {
    id: serial("id").primaryKey(),
    txId: integer("txId").notNull(),
    txHash: varchar("txHash").notNull(),
    previousOutTxHash: varchar("previousOutTxHash"),
    previousOutTxN: integer("previousOutTxN"),
    scriptSignature: jsonb("script_signature").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    txFk: foreignKey({
      columns: [t.txHash],
      foreignColumns: [transaction.hash],
      name: "FK_tx_in_tx_hash_transaction_hash",
    }),
    // Postgres does not auto-index FK columns; every tx-detail / account-history
    // lookup filters tx_in by txHash, so without this it seq-scans the table.
    txHashIdx: index("IX_tx_in_txHash").on(t.txHash),
    // Supports the spent-output EXISTS check (does any input spend this output?).
    prevOutIdx: index("IX_tx_in_prevout").on(t.previousOutTxHash, t.previousOutTxN),
  }),
);

export const txOut = pgTable(
  "tx_out",
  {
    id: serial("id").primaryKey(),
    txId: integer("txId").notNull(),
    txHash: varchar("txHash").notNull(),
    valueType: varchar("valueType").notNull(),
    amount: numeric("amount"),
    locktime: varchar("locktime").notNull(),
    genesisHash: varchar("genesisHash"),
    scriptPublicKey: varchar("scriptPublicKey"),
    itemMetadata: varchar("itemMetadata"),
    n: integer("n").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    txFk: foreignKey({
      columns: [t.txHash],
      foreignColumns: [transaction.hash],
      name: "FK_tx_out_tx_hash_transaction_hash",
    }),
    txHashNIdx: index("IX_tx_out_txHash_n").on(t.txHash, t.n),
    // Supports LIKE 'prefix%' address search under a non-C collation.
    scriptPubKeyPrefix: index("IX_tx_out_scriptPublicKey_prefix").on(t.scriptPublicKey.op("varchar_pattern_ops")),
    // Browse items by class (exact genesis hash).
    genesisIdx: index("IX_tx_out_genesisHash").on(t.genesisHash),
    // Trigram GIN index for case-insensitive substring search on item metadata
    // (ILIKE '%q%'). Requires the pg_trgm extension (enabled in migration 0003).
    itemMetadataTrgm: index("IX_tx_out_itemMetadata_trgm").using("gin", sql`${t.itemMetadata} gin_trgm_ops`),
  }),
);

export const txInExpanded = pgTable(
  "tx_in_expanded",
  {
    id: serial("id").primaryKey(),
    txId: integer("txId").notNull(),
    txHash: varchar("txHash").notNull(),
    previousOutTxHash: varchar("previousOutTxHash"),
    previousOutTxN: integer("previousOutTxN"),
    scriptSignature: jsonb("script_signature").notNull(),
    outScriptPublicKey: varchar("outScriptPublicKey"),
    createdAt: timestamp("createdAt", { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    txFk: foreignKey({
      columns: [t.txHash],
      foreignColumns: [transaction.hash],
      name: "FK_0b1efa4b5ea4aa057d0f20e38e2",
    }),
    // Same rationale as tx_in: loadTxDetails filters tx_in_expanded by txHash.
    txHashIdx: index("IX_tx_in_expanded_txHash").on(t.txHash),
  }),
);

export const coinsHistory = pgTable(
  "coins_history",
  {
    id: serial("id").primaryKey(),
    address: varchar("address").notNull(),
    date: timestamp("date", { withTimezone: false }).notNull(),
    // The block that produced this snapshot. Nullable so the migration needs no
    // backfill; a reorg rewind requires it (deletes snapshots by block_num) and
    // falls back to a full resync if any legacy row still has NULL here.
    blockNum: integer("block_num"),
    outIds: jsonb("outIds").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    addressDateIdx: index("IX_ch_address_date").on(t.address, t.date),
    blockNumIdx: index("IX_ch_block_num").on(t.blockNum),
  }),
);

export const circulatingSupply = pgTable("circulating_supply", {
  id: integer("id").primaryKey(),
  circulatingSupply: numeric("circulatingSupply").notNull(),
  // Protocol max total supply, sourced from the node's /v1/supply `total` (not
  // the genesis issuance). Nullable until the supply cron first records it.
  totalSupply: numeric("totalSupply"),
  createdAt: timestamp("createdAt", { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: false }).defaultNow().notNull(),
});

export type Block = typeof block.$inferSelect;
export type Transaction = typeof transaction.$inferSelect;
export type TxIn = typeof txIn.$inferSelect;
export type TxOut = typeof txOut.$inferSelect;
export type TxInExpanded = typeof txInExpanded.$inferSelect;
export type CoinsHistory = typeof coinsHistory.$inferSelect;
export type CirculatingSupply = typeof circulatingSupply.$inferSelect;
