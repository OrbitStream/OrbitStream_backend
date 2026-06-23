CREATE TYPE "public"."api_key_environment" AS ENUM('testnet', 'mainnet');--> statement-breakpoint
CREATE TYPE "public"."merchant_role" AS ENUM('admin', 'merchant', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('pending', 'paid', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."webhook_delivery_status" AS ENUM('pending', 'delivered', 'failed', 'dead');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"environment" "api_key_environment" DEFAULT 'testnet' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid,
	"ip_address" text,
	"user_agent" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"amount" numeric(36, 7) NOT NULL,
	"asset_code" text NOT NULL,
	"asset_issuer" text,
	"receiving_account" text NOT NULL,
	"memo" text,
	"status" "session_status" DEFAULT 'pending' NOT NULL,
	"success_url" text,
	"cancel_url" text,
	"metadata" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" text NOT NULL,
	"business_name" text NOT NULL,
	"email" text NOT NULL,
	"role" "merchant_role" DEFAULT 'merchant' NOT NULL,
	"webhook_url" text,
	"webhook_secret" text,
	"logo_url" text,
	"cors_origins" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchants_wallet_address_unique" UNIQUE("wallet_address"),
	CONSTRAINT "merchants_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"tx_hash" text NOT NULL,
	"amount" numeric(36, 7) NOT NULL,
	"asset_code" text NOT NULL,
	"asset_issuer" text,
	"sender_address" text NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint
CREATE TABLE "webhook_dead_letters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"delivery_id" uuid NOT NULL,
	"session_id" uuid,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reason" text NOT NULL,
	"retried_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_dead_letters_delivery_id_unique" UNIQUE("delivery_id")
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"session_id" uuid,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"delivery_id" uuid NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"status" "webhook_delivery_status" DEFAULT 'pending' NOT NULL,
	"response_status" integer,
	"attempt_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"delivered_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_deliveries_delivery_id_unique" UNIQUE("delivery_id")
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_session_id_checkout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_dead_letters" ADD CONSTRAINT "webhook_dead_letters_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_dead_letters" ADD CONSTRAINT "webhook_dead_letters_session_id_checkout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_session_id_checkout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE cascade ON UPDATE no action;