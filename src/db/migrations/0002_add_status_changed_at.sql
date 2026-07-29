ALTER TABLE "checkout_sessions" ADD COLUMN "status_changed_at" timestamp with time zone DEFAULT now() NOT NULL;
