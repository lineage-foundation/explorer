ALTER TABLE "coins_history" ADD COLUMN IF NOT EXISTS "block_num" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IX_ch_block_num" ON "coins_history" USING btree ("block_num");