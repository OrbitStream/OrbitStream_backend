# 🌊 OrbitStream Backend

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js)](https://nodejs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?logo=nestjs)](https://nestjs.com/)
[![Stellar](https://img.shields.io/badge/Stellar-Soroban-7C68EE)](https://stellar.org/)

> **The off-chain API powering OrbitStream — real-time token streaming on Stellar.**

OrbitStream Backend is the NestJS service that bridges Soroban smart contracts with the OrbitStream frontend. It manages stream state, exposes a real-time WebSocket gateway for live balance updates, verifies on-chain transactions via Stellar Horizon, and provides Prometheus-grade observability.

---

## ✨ Features

- 🔐 **Wallet Authentication** — Stellar wallet-signed JWT login. No email, no password.
- 🌊 **Stream Management** — Full lifecycle API: create, pause, resume, cancel, and claim streams.
- ⚡ **Real-Time WebSocket** — Socket.io gateway pushes live stream_update, claimed, and status_change events to connected clients.
- 🔗 **Stellar Integration** — Horizon API helpers for account info, balance lookups, transaction verification, and Soroban contract event fetching.
- 🔔 **Webhook Engine** — HMAC-signed event handler for on-chain Stellar events with automatic retry logic.
- 📊 **Observability** — Prometheus metrics and liveness probe.

---

## 🗂️ Project Structure

\`\`\`
src/
├── auth/               # JWT wallet auth — controller, service, guard, strategy
├── streams/            # Stream lifecycle — CRUD, claimable calc, WebSocket gateway
├── stellar/            # Horizon + Soroban RPC helpers
├── webhook/            # HMAC-signed event ingestion with retry
├── monitoring/         # Health checks and Prometheus metrics
└── main.ts             # App entry point
\`\`\`

---

## 🚀 Getting Started

### Prerequisites
- Node.js >= 20
- PostgreSQL database
- A Stellar testnet account

### Installation

\`\`\`bash
npm install
\`\`\`

### Environment Setup

\`\`\`bash
cp .env.example .env
\`\`\`

Key variables:
\`\`\`env
PORT=3001
DATABASE_URL=postgresql://postgres:password@localhost:5432/orbitstream
JWT_SECRET=your-secret
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STREAM_CONTRACT_ID=your-deployed-contract-id
\`\`\`

### Running

\`\`\`bash
npm run start:dev    # development
npm run start:prod   # production
\`\`\`

---

## 📖 API Reference

All routes are prefixed with \`/api/v1\`.

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| \`POST\` | \`/auth/login\` | Wallet-signed login — returns JWT |

### Streams

| Method | Endpoint | Description |
|--------|----------|-------------|
| \`POST\` | \`/streams\` | Create a new token stream |
| \`GET\` | \`/streams\` | List all streams for the authenticated wallet |
| \`GET\` | \`/streams/:id\` | Get a single stream by ID |
| \`GET\` | \`/streams/:id/claimable\` | Calculate claimable tokens right now |
| \`PATCH\` | \`/streams/:id/claim\` | Record a claim transaction |
| \`PATCH\` | \`/streams/:id/pause\` | Pause an active stream |
| \`PATCH\` | \`/streams/:id/resume\` | Resume a paused stream |
| \`DELETE\` | \`/streams/:id\` | Cancel a stream |

### Monitoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| \`GET\` | \`/health\` | Liveness and database readiness probe |
| \`GET\` | \`/metrics\` | Prometheus-compatible metrics |

---

## ⚡ WebSocket Events

Connect to the WebSocket server at \`ws://localhost:3001\`.

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| \`subscribe_stream\` | \`streamId: string\` | Subscribe to live updates for a stream |
| \`unsubscribe_stream\` | \`streamId: string\` | Unsubscribe from a stream |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| \`stream_update\` | \`{ streamId, ...data }\` | Emitted on any stream state change |
| \`claimed\` | \`{ streamId, amount, recipient }\` | Emitted when tokens are claimed |
| \`status_change\` | \`{ streamId, status }\` | Emitted on pause, resume, or cancel |

---

## 🔗 Related Repositories

- [OrbitStream Contracts](https://github.com/OrbitStream/orbitstream-contracts) — Soroban smart contracts
- [OrbitStream Frontend](https://github.com/OrbitStream/orbitstream-frontend) — Web dashboard
- [OrbitStream Docs](https://github.com/OrbitStream/orbitstream-docs) — Documentation

---

## 📜 License

MIT License. Copyright (c) 2026 OrbitStream Protocol.
