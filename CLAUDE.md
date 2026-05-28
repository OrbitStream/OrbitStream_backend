# OrbitStream Backend

## Project
Backend API for OrbitStream — a Stripe-like merchant payment gateway for Stellar.

## Stack
- Node.js 20+
- TypeScript
- NestJS 10
- Drizzle ORM
- PostgreSQL
- Redis
- Stellar SDK (@stellar/stellar-sdk)

## Architecture
Three core services:
1. **Merchant API** — registration, API key management, webhook configuration
2. **Checkout API** — session creation, payment URL generation, session status
3. **Payment Detector** — Horizon streaming, memo-based payment matching, webhook dispatch

## Database Schema
### merchants
id, wallet_address (unique), business_name, email, webhook_url, webhook_secret, logo_url, created_at

### api_keys
id, merchant_id (FK), key_prefix, key_hash, environment (testnet/mainnet), is_active, created_at

### checkout_sessions
id, merchant_id (FK), amount, asset_code, asset_issuer, receiving_account, memo, status (pending/paid/expired/cancelled), success_url, cancel_url, metadata (jsonb), expires_at, created_at

### payments
id, session_id (FK), merchant_id (FK), tx_hash (unique), amount, asset_code, asset_issuer, sender_address, confirmed_at, created_at

### webhook_deliveries
id, merchant_id (FK), event, payload (jsonb), response_status, delivered_at, attempts, next_retry_at, created_at

## Folder Structure
src/
  main.ts                    - NestJS bootstrap
  app.module.ts              - root module
  auth/                      - JWT wallet auth + API key guard
  merchants/                 - merchant registration, API keys, webhook config
  checkout/                  - checkout session CRUD
  payments/                  - payment detection service (Horizon streaming)
  stellar/                   - Stellar Horizon/Soroban helpers
  webhook/                   - webhook dispatch with HMAC signing
  monitoring/                - health checks, Prometheus metrics
  db/                        - Drizzle schema + client
  api/middleware/             - rate limiting, error handler

## Auth
Two auth modes:
1. **JWT** — wallet-based login for merchant dashboard (sign challenge, get JWT)
2. **API Key** — for programmatic access (Authorization: Bearer sk_test_...)

## Key Rules
- Never hold private keys — backend constructs unsigned txns, customer wallet signs
- Payment detection uses Horizon streaming with Redis cursor persistence
- Memo-based payment matching (each session gets unique memo)
- All webhook payloads signed with HMAC-SHA256
- Sessions expire after CHECKOUT_SESSION_TTL_MINUTES (default 30)
- Validate all inputs with class-validator
- Rate limit all endpoints

## Environment Variables
DATABASE_URL=
REDIS_URL=
JWT_SECRET=
STELLAR_NETWORK=TESTNET
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
PLATFORM_RECEIVING_ACCOUNT=
CHECKOUT_SESSION_TTL_MINUTES=30
PORT=3001
