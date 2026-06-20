ALTER TYPE "public"."session_status" ADD VALUE 'processing' BEFORE 'paid';--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_tx_hash_unique";--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payment_idempotency_key" UNIQUE("tx_hash","session_id");