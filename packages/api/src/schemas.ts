import { z } from "@hono/zod-openapi";

// Cap offset so a public, unauthenticated deep-offset request can't force
// Postgres to scan-and-discard an unbounded number of rows per call. Beyond
// this a client should narrow its query rather than page linearly.
const MAX_OFFSET = 100_000;

export const PageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(MAX_OFFSET).default(0),
});

export const AccountTxQuery = PageQuery;

export const ListQuery = PageQuery.extend({
  order: z.enum(["asc", "desc"]).default("desc"),
});

// `q` (metadata substring) and `genesis` (item class) are both optional here so
// OpenAPI documents them as optional query params; the route enforces that at
// least one is supplied (a cross-field rule kept out of the schema so the query
// stays a plain object for param generation).
export const ItemQuery = PageQuery.extend({
  q: z.string().min(1).max(128).optional().openapi({ param: { name: "q", in: "query" }, example: "sword" }),
  genesis: z.string().min(1).max(128).optional().openapi({ param: { name: "genesis", in: "query" }, example: "g7f3c2a8" }),
  spent: z.enum(["true", "false"]).optional().openapi({
    param: { name: "spent", in: "query" }, example: "false",
    description: "Only spent (`true`) or only unspent (`false`) outputs. Unspent outputs are the current holders.",
  }),
});

export const ProblemSchema = z
  .object({
    type: z.string().openapi({ example: "about:blank" }),
    title: z.string(),
    status: z.number().int(),
    detail: z.string().optional(),
    instance: z.string().optional(),
  })
  .openapi("Problem");

export const PaginationSchema = z
  .object({
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
    hasMore: z.boolean(),
  })
  .openapi("Pagination");

const TxType = z.enum(["token", "item", "coinbase", "unknown"]);

const DruidField = z.string().nullable().openapi({
  description: "DRUID shared by the halves of a two-way trade; null for an ordinary transaction.",
});

export const BlockSummarySchema = z
  .object({
    num: z.number().int(),
    hash: z.string(),
    previousHash: z.string().nullable(),
    timestamp: z.string().datetime().nullable(),
    version: z.number().int(),
    nbTx: z.number().int().nullable(),
  })
  .openapi("BlockSummary");

export const BlockSchema = BlockSummarySchema.extend({
  merkleRootHash: z.string().nullable(),
  bits: z.string().nullable(),
}).openapi("Block");

export const BlockTxSchema = z
  .object({
    hash: z.string(),
    blockHash: z.string(),
    version: z.number().int(),
    timestamp: z.string().datetime().nullable(),
    type: TxType,
    coinbase: z.boolean(),
    druid: DruidField,
  })
  .openapi("BlockTransaction");

export const TransactionSummarySchema = z
  .object({
    hash: z.string(),
    blockHash: z.string(),
    version: z.number().int(),
    timestamp: z.string().datetime().nullable(),
    type: TxType,
    druid: DruidField,
  })
  .openapi("TransactionSummary");

const TxInputSchema = z.object({
  fromAddress: z.string().nullable(),
  valueType: z.string().nullable().openapi({ description: "Asset kind of the spent output: \"token\" or \"item\"; null if unresolved." }),
  genesisHash: z.string().nullable(),
  amount: z.string().nullable(),
  amountLngx: z.string().nullable().openapi({ description: "LNGX-formatted amount; null for items." }),
  previousOutTxHash: z.string().nullable(),
  previousOutTxN: z.number().int().nullable(),
});

const TxOutputSchema = z.object({
  n: z.number().int(),
  valueType: z.string(),
  amount: z.string().nullable(),
  amountLngx: z.string().nullable().openapi({ description: "LNGX-formatted amount; null for items." }),
  address: z.string().nullable(),
  locktime: z.string(),
  genesisHash: z.string().nullable(),
  itemMetadata: z.string().nullable(),
});

export const TransactionSchema = z
  .object({
    hash: z.string(),
    blockHash: z.string(),
    version: z.number().int(),
    timestamp: z.string().datetime().nullable(),
    type: TxType,
    druid: DruidField,
    inputs: z.array(TxInputSchema),
    outputs: z.array(TxOutputSchema),
  })
  .openapi("Transaction");

export const AddressTransactionSchema = TransactionSchema.extend({
  blockNum: z.number().int(),
  balanceAfter: z.string(),
  balanceAfterLngx: z.string(),
}).openapi("AddressTransaction");

export const AddressSchema = z
  .object({
    address: z.string(),
    balance: z.string(),
    balanceLngx: z.string(),
  })
  .openapi("Address");

export const ItemOutputSchema = z
  .object({
    genesisHash: z.string().nullable().openapi({
      description: "The item this output belongs to: the hash of its create transaction, including on the creation output itself.",
    }),
    metadata: z.string().nullable().openapi({
      description: "The output's own metadata or, failing that, the item's metadata from its creation output.",
    }),
    address: z.string().nullable(),
    amount: z.string().nullable(),
    amountLngx: z.string().nullable().openapi({ description: "Always null: an item quantity is not a token amount." }),
    spent: z.boolean(),
    txHash: z.string(),
    n: z.number().int(),
    blockNum: z.number().int(),
    blockHash: z.string(),
    timestamp: z.string().datetime().nullable(),
  })
  .openapi("ItemOutput");

const ItemHolderSchema = z.object({ address: z.string(), amount: z.string() });

export const ItemSchema = z
  .object({
    genesisHash: z.string(),
    metadata: z.string().nullable(),
    totalAmount: z.string().openapi({ description: "Units created, as a decimal string." }),
    creator: z.string().nullable(),
    blockNum: z.number().int(),
    blockHash: z.string(),
    timestamp: z.string().datetime().nullable(),
    holderCount: z.number().int(),
    holders: z.array(ItemHolderSchema).openapi({ description: "Current holders, largest first (at most 100)." }),
  })
  .openapi("Item");

export const ItemTransferSchema = z
  .object({
    txHash: z.string(),
    blockNum: z.number().int(),
    blockHash: z.string(),
    timestamp: z.string().datetime().nullable(),
    from: z.array(z.string()).openapi({
      description: "Input addresses that spent this item in the transaction. Empty for the create transaction.",
    }),
    to: z.array(z.object({ address: z.string().nullable(), amount: z.string() })),
    druid: z.string().nullable().openapi({ description: "Set when the transaction is one half of a two-way trade." }),
    created: z.boolean().openapi({ description: "True for the transaction that created the item." }),
  })
  .openapi("ItemTransfer");

export const AddressItemSchema = z
  .object({
    genesisHash: z.string(),
    amount: z.string(),
    metadata: z.string().nullable(),
  })
  .openapi("AddressItem");

export const SupplySchema = z
  .object({
    circulating: z.string(),
    circulatingLngx: z.string(),
    total: z.string().nullable(),
    totalLngx: z.string().nullable(),
    ticker: z.string(),
  })
  .openapi("Supply");

export const StatusSchema = z
  .object({
    network: z.string(),
    ticker: z.string(),
    height: z.number().int().nullable(),
    blocks: z.number().int(),
    transactions: z.number().int(),
  })
  .openapi("Status");

const TradeAssetSchema = z.object({
  kind: z.enum(["token", "item"]),
  amount: z.string(),
  amountLngx: z.string().nullable().openapi({ description: "LNGX-formatted amount; null for items." }),
  genesisHash: z.string().nullable(),
  metadata: z.string().nullable(),
});

const TradeLegSchema = z.object({
  from: z.array(z.string()).nullable().openapi({
    description: "Input addresses of the transaction that pays this leg; null when no indexed transaction does.",
  }),
  to: z.string(),
  txHash: z.string().nullable(),
  met: z.boolean(),
  asset: TradeAssetSchema,
});

export const TradeSchema = z
  .object({
    druid: z.string(),
    participants: z.number().int(),
    complete: z.boolean().openapi({
      description: "Every expected transaction is indexed and every leg is met.",
    }),
    blockNum: z.number().int(),
    blockHash: z.string(),
    timestamp: z.string().datetime().nullable(),
    legs: z.array(TradeLegSchema),
    transactions: z.array(z.string()),
  })
  .openapi("Trade");

export function listSchema<T extends z.ZodTypeAny>(item: T, name: string) {
  return z.object({ data: z.array(item), pagination: PaginationSchema }).openapi(name);
}
