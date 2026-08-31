CREATE INDEX IF NOT EXISTS "IX_block_hash_prefix" ON "block" USING btree ("hash" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IX_transaction_hash_prefix" ON "transaction" USING btree ("hash" varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IX_tx_out_scriptPublicKey_prefix" ON "tx_out" USING btree ("scriptPublicKey" varchar_pattern_ops);
