# OrbitStream Backend

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js)](https://nodejs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?logo=nestjs)](https://nestjs.com/)
[![Stellar](https://img.shields.io/badge/Stellar-Soroban-7C68EE)](https://stellar.org/)

> **The backend API powering OrbitStream — Stripe-like payments for the Stellar network.**

OrbitStream Backend is the NestJS service that handles merchant registration, checkout session management, Stellar payment detection via Horizon, and webhook dispatch. It's the engine that lets any merchant accept USDC/XLM payments in under 10 minutes.

---

## Features

- **Merchant API** — wallet-based registration, API key management, webhook configuration
- **Checkout Sessions** — create payment sessions with unique memos, auto-expiry, status polling
- **Payment Detection** — Horizon streaming with memo-based matching, Redis cursor persistence
- **Webhook Dispatch** — HMAC-SHA256 signed delivery with exponential backoff retry
- **Dual Auth** — JWT for merchant dashboard, API keys for programmatic access
- **Observability** — Prometheus metrics and liveness probes

---

## Project Structure

```
src/
├── auth/               # JWT wallet auth + API key guard
├── merchants/          # Registration, API keys, webhook config
├── checkout/           # Session CRUD, payment URL generation
├── payments/           # Payment detector (Horizon polling)
├── stellar/            # Horizon API helpers
├── webhook/            # HMAC-signed dispatch with retry
├── monitoring/         # Health checks and Prometheus metrics
├── db/                 # Drizzle schema + PostgreSQL client
└── main.ts             # NestJS bootstrap
```

---

## Getting Started

### Prerequisites
- Node.js >= 20
- PostgreSQL
- Redis
- Stellar testnet account

### Installation

```bash
npm install
```

### Environment Setup

```env
PORT=3001
DATABASE_URL=postgresql://postgres:password@localhost:5432/orbitstream
JWT_SECRET=change-me-in-production
STELLAR_NETWORK=TESTNET
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
PLATFORM_RECEIVING_ACCOUNT=<your-stellar-account>
REDIS_URL=redis://localhost:6379
CHECKOUT_SESSION_TTL_MINUTES=30
```

### Running

```bash
npm run start:dev    # development
npm run start:prod   # production
```

---

## API Reference

### Merchants

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/merchants/register` | — | Register merchant |
| `POST` | `/auth/login` | — | Wallet login, returns JWT |
| `GET` | `/merchants/me` | JWT | Get profile |
| `PATCH` | `/merchants/me` | JWT | Update profile |
| `POST` | `/merchants/me/api-keys` | JWT | Generate API key |
| `GET` | `/merchants/me/api-keys` | JWT | List keys |
| `DELETE` | `/merchants/me/api-keys/:id` | JWT | Revoke key |
| `PATCH` | `/merchants/me/webhook` | JWT | Set webhook URL |

### Checkout

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/v1/checkout/sessions` | API Key | Create session |
| `GET` | `/v1/checkout/sessions/:id` | — | Get status (public) |
| `POST` | `/v1/checkout/sessions/:id/cancel` | API Key | Cancel session |

### Monitoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Liveness probe |
| `GET` | `/metrics` | Prometheus metrics |

---

## Related Repositories

- [orbitstream_contracts](https://github.com/OrbitStream/orbitstream_contracts) — Escrow smart contract
- [orbitstream_frontend](https://github.com/OrbitStream/orbitstream_frontend) — Checkout UI + merchant dashboard
- [orbitstream_docs](https://github.com/OrbitStream/orbitstream_docs) — Documentation
- [orbitstream-sdk](https://github.com/OrbitStream/orbitstream-sdk) — JS/TS SDK

---

## License

MIT License. Copyright (c) 2026 OrbitStream.
