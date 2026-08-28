CREATE TABLE IF NOT EXISTS "block" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"num" integer NOT NULL,
	"hash" varchar NOT NULL,
	"previousHash" varchar,
	"timestamp" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"merkleRootHash" varchar,
	"bits" bigint,
	"nbTx" integer DEFAULT 0,
	"nonceAndMiningTxHash" jsonb,
	"seed" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "circulating_supply" (
	"id" integer PRIMARY KEY NOT NULL,
	"circulatingSupply" numeric NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coins_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" varchar NOT NULL,
	"date" timestamp NOT NULL,
	"outIds" jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transaction" (
	"id" serial PRIMARY KEY NOT NULL,
	"hash" varchar NOT NULL,
	"blockHash" varchar NOT NULL,
	"version" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"fees" jsonb,
	"druidInfo" jsonb,
	"coinbase" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tx_in" (
	"id" serial PRIMARY KEY NOT NULL,
	"txId" integer NOT NULL,
	"txHash" varchar NOT NULL,
	"previousOutTxHash" varchar,
	"previousOutTxN" integer,
	"script_signature" jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tx_in_expanded" (
	"id" serial PRIMARY KEY NOT NULL,
	"txId" integer NOT NULL,
	"txHash" varchar NOT NULL,
	"previousOutTxHash" varchar,
	"previousOutTxN" integer,
	"script_signature" jsonb NOT NULL,
	"outScriptPublicKey" varchar,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tx_out" (
	"id" serial PRIMARY KEY NOT NULL,
	"txId" integer NOT NULL,
	"txHash" varchar NOT NULL,
	"valueType" varchar NOT NULL,
	"amount" numeric,
	"locktime" varchar NOT NULL,
	"genesisHash" varchar,
	"scriptPublicKey" varchar,
	"itemMetadata" varchar,
	"n" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transaction" ADD CONSTRAINT "FK_08f3024b3fad3c62274225faf91" FOREIGN KEY ("blockHash") REFERENCES "public"."block"("hash") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tx_in" ADD CONSTRAINT "FK_tx_in_tx_hash_transaction_hash" FOREIGN KEY ("txHash") REFERENCES "public"."transaction"("hash") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tx_in_expanded" ADD CONSTRAINT "FK_0b1efa4b5ea4aa057d0f20e38e2" FOREIGN KEY ("txHash") REFERENCES "public"."transaction"("hash") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tx_out" ADD CONSTRAINT "FK_tx_out_tx_hash_transaction_hash" FOREIGN KEY ("txHash") REFERENCES "public"."transaction"("hash") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UK_block_hash" ON "block" USING btree ("hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UK_block_num" ON "block" USING btree ("num");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IX_ch_address_date" ON "coins_history" USING btree ("address","date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UK_transaction_hash" ON "transaction" USING btree ("hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IX_tx_out_txHash_n" ON "tx_out" USING btree ("txHash","n");