# OrbitStream Backend

## Project
Backend API for OrbitStream — a token streaming payroll platform on Stellar.

## Stack
- Node.js 20+
- TypeScript
- Express.js
- Drizzle ORM
- PostgreSQL
- Redis
- Stellar SDK (@stellar/stellar-sdk)

## Architecture
Three main services:
1. API — REST endpoints + WebSocket for real-time updates
2. Indexer — polls Stellar Horizon, processes contract events into DB
3. Runway Monitor — background job, alerts employers when streams run low

## Database Schema
### employers
id, wallet_address, org_name, logo_url, created_at

### employees
id, wallet_address, display_name, email, employer_id, created_at

### streams
id (mirrors contract stream_id), employer_id, employee_id, token,
rate_per_second, deposited, withdrawn, start_time, end_time, status,
last_indexed_at

### claims
id, stream_id, amount, tx_hash, claimed_at

### notifications
id, user_id, type, message, read, created_at

## Folder Structure
src/
  index.ts
  config.ts
  api/
    routes/
      auth.ts
      streams.ts
      employers.ts
      employees.ts
    middleware/
      auth.ts
      rateLimit.ts
      errorHandler.ts
  services/
    streamService.ts
    authService.ts
    notificationService.ts
  indexer/
    listener.ts
    processor.ts
  models/
  db/
    schema.ts
    index.ts
    migrations/
  notifications/
    email.ts
    runwayMonitor.ts
  utils/
    rateCalculator.ts
    stellar.ts

## Auth
- Wallet-based auth only (no passwords)
- User signs a challenge message with Freighter
- Backend verifies signature using stellar-sdk
- Returns JWT access token + refresh token

## Key Rules
- Never trust frontend-reported amounts, always verify with chain
- Indexer is source of truth for stream state
- All endpoints require JWT except /auth/challenge and /auth/verify
- Rate limit all endpoints
- Validate all inputs with zod
- Use drizzle for all DB operations, never raw SQL

## Environment Variables
DATABASE_URL=
REDIS_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=
STELLAR_NETWORK=testnet
CONTRACT_ID=
HORIZON_URL=https://horizon-testnet.stellar.org
EMAIL_API_KEY=
PORT=3001
