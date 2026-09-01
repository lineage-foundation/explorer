-- pg_trgm powers the trigram GIN index below (case-insensitive substring search
-- on item metadata). drizzle-kit does not model extensions, so this line is
-- added by hand; it is untracked by the snapshot and does not affect the
-- schema-drift gate.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IX_tx_in_prevout" ON "tx_in" USING btree ("previousOutTxHash","previousOutTxN");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IX_tx_out_genesisHash" ON "tx_out" USING btree ("genesisHash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IX_tx_out_itemMetadata_trgm" ON "tx_out" USING gin ("itemMetadata" gin_trgm_ops);