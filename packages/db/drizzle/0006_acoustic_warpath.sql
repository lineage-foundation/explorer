ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS "druid" varchar;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IX_transaction_druid" ON "transaction" USING btree ("druid");--> statement-breakpoint
UPDATE "transaction" SET "druid" = "druidInfo"->>'druid' WHERE "druidInfo" IS NOT NULL AND "druid" IS NULL;
