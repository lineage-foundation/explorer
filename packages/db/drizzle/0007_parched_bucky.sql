ALTER TABLE "tx_out" ADD COLUMN IF NOT EXISTS "itemGenesis" varchar;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IX_tx_out_itemGenesis" ON "tx_out" USING btree ("itemGenesis");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IX_tx_out_item_creation" ON "tx_out" USING btree ("id") WHERE "tx_out"."valueType" = 'item' AND "tx_out"."genesisHash" IS NULL;--> statement-breakpoint
UPDATE "tx_out" SET "itemGenesis" = coalesce("genesisHash", "txHash") WHERE "valueType" = 'item' AND "itemGenesis" IS NULL;
