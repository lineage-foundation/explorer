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
  }),
);

export const coinsHistory = pgTable(
  "coins_history",
  {
    id: serial("id").primaryKey(),
    address: varchar("address").notNull(),
    date: timestamp("date", { withTimezone: false }).notNull(),
    outIds: jsonb("outIds").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    addressDateIdx: index("IX_ch_address_date").on(t.address, t.date),
  }),
);

export const circulatingSupply = pgTable("circulating_supply", {
  id: integer("id").primaryKey(),
  circulatingSupply: numeric("circulatingSupply").notNull(),
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
