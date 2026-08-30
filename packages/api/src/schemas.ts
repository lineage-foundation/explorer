import { z } from "@hono/zod-openapi";

const PageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export const AccountTxQuery = PageQuery;

export const ListQuery = PageQuery.extend({
  order: z.enum(["asc", "desc"]).default("desc"),
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
  })
  .openapi("BlockTransaction");

export const TransactionSummarySchema = z
  .object({
    hash: z.string(),
    blockHash: z.string(),
    version: z.number().int(),
    timestamp: z.string().datetime().nullable(),
    type: TxType,
  })
  .openapi("TransactionSummary");

const TxInputSchema = z.object({
  fromAddress: z.string().nullable(),
  amount: z.string().nullable(),
  amountLngx: z.string().nullable(),
  previousOutTxHash: z.string().nullable(),
  previousOutTxN: z.number().int().nullable(),
});

const TxOutputSchema = z.object({
  n: z.number().int(),
  valueType: z.string(),
  amount: z.string().nullable(),
  amountLngx: z.string().nullable(),
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
    inputs: z.array(TxInputSchema),
    outputs: z.array(TxOutputSchema),
  })
  .openapi("Transaction");

export const AddressSchema = z
  .object({
    address: z.string(),
    balance: z.string(),
    balanceLngx: z.string(),
  })
  .openapi("Address");

export const SupplySchema = z
  .object({
    circulating: z.string(),
    circulatingLngx: z.string(),
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

export function listSchema<T extends z.ZodTypeAny>(item: T, name: string) {
  return z.object({ data: z.array(item), pagination: PaginationSchema }).openapi(name);
}
