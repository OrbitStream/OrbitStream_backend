# OrbitStream

**A developer-friendly payment gateway for Stellar — Stripe-like DX, Stellar-native rails.**

---

## The Problem

Stellar has the best payment infrastructure in crypto:

- **5-second finality** — near-instant settlement
- **$0.00001 transaction fees** — cheapest of any major chain
- **$83M+ USDC supply** with $4.2B total payment volume
- **MoneyGram Access** — cash rails at 350K+ locations globally
- **Mature anchor network** — fiat on/off ramps in 40+ countries
- **Built-in DEX** — native multi-asset support (USDC, EURC, XLM)
- **Regulatory-friendly** — compliance baked into SEP protocols

**But there is no merchant-facing product layer.**

A business that wants to accept USDC on Stellar today must build payment detection, confirmation logic, checkout UI, and settlement flows from scratch. The gap between "Stellar can move money" and "a merchant can accept Stellar payments in 10 minutes" is enormous.

Solana Pay has a merchant SDK but lacks Stellar's fiat infrastructure (SEPs, anchors, MoneyGram). No one has built a Stripe-like checkout layer on top of Stellar's existing rails.

---

## The Solution

OrbitStream provides the missing merchant layer:

| Capability | Description |
|---|---|
| **JS/React SDK** | `<OrbitStreamCheckout amount={25} currency="USDC" />` — drop a payment widget on any page |
| **Hosted checkout page** | Shareable payment link (like Stripe Payment Links) |
| **Embeddable widget** | Modal/inline checkout that handles wallet connection + payment |
| **Webhook notifications** | Confirmed payment events delivered to merchant's endpoint |
| **Merchant dashboard** | Transaction history, settlements, payment status, analytics |
| **Multi-asset support** | Accept USDC, EURC, or XLM; display in merchant's preferred fiat currency |

### How It Works

```
Customer                    OrbitStream              Merchant
--------                    ----------------              --------
   |                                |                          |
   |  Click "Pay"                   |                          |
   |------------------------------->|                          |
   |                                |                          |
   |  Checkout page/widget loads    |                          |
   |<-------------------------------|                          |
   |                                |                          |
   |  Select asset (USDC/XLM)       |                          |
   |  Connect wallet or scan QR     |                          |
   |------------------------------->|                          |
   |                                |                          |
   |  Sign payment transaction      |                          |
   |------------------------------->|                          |
   |                                |  Monitor ledger for      |
   |                                |  payment confirmation    |
   |                                |                          |
   |                                |  Webhook: payment.confirmed
   |                                |------------------------->|
   |                                |                          |
   |  Payment confirmed screen      |                          |
   |<-------------------------------|                          |
```

### Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    OrbitStream                          │
├──────────────┬──────────────┬──────────────┬────────────────┤
│  Frontend    │  Backend     │  Indexer     │  Dashboard     │
│              │              │              │                │
│  - React SDK │  - Payment   │  - Stellar   │  - Merchant    │
│  - Checkout  │    detection │    ledger    │    portal      │
│    page      │  - Webhook   │    watcher   │  - Analytics   │
│  - Widget    │    dispatch  │  - Event     │  - Settings    │
│  - QR codes  │  - Session   │    indexing  │  - Webhooks    │
│              │    mgmt      │  - Tx history│    config      │
├──────────────┴──────────────┴──────────────┴────────────────┤
│                    Stellar Network                           │
│  - Stellar SDK (JS/Python)                                  │
│  - SEP-24 (fiat on/off ramps)                               │
│  - Stellar Asset Contract (Soroban)                         │
│  - Built-in DEX (multi-asset)                               │
│  - Anchor Network (fiat settlement)                         │
└─────────────────────────────────────────────────────────────┘
```

**Stack:**
- **Frontend:** React/TypeScript SDK, embeddable widget (Web Components for framework-agnostic use)
- **Backend:** Node.js or Go — payment session management, webhook dispatch, merchant API
- **Indexer:** Stellar ledger watcher — monitors accounts for incoming payments, confirms finality
- **Dashboard:** Next.js web app — merchant portal for transactions, settings, analytics
- **Smart Contracts (optional):** Soroban contracts for escrow, dispute resolution, or subscription logic

---

## MVP Scope

### Phase 1 — Core Checkout (Weeks 1-4)

| Deliverable | Description |
|---|---|
| Payment session API | Create checkout session → returns payment URL |
| Hosted checkout page | Customer-facing page: shows amount, asset options, QR code, wallet connect |
| Stellar payment detection | Backend monitors Stellar account for incoming payment matching session |
| Webhook dispatch | `payment.confirmed` event sent to merchant's configured endpoint |
| JS SDK (v0.1) | `createCheckout({ amount, currency, onSuccess })` — basic integration |
| Testnet support | Full flow on Stellar testnet |

### Phase 2 — Merchant Experience (Weeks 5-8)

| Deliverable | Description |
|---|---|
| Merchant dashboard | Auth, transaction history, API key management |
| Payment links | Generate shareable URLs (no code required) |
| Embeddable widget | `<script>` tag + `<orbitstream-checkout>` custom element |
| Multi-asset support | Accept USDC, EURC, XLM — auto-convert display currency |
| Mainnet launch | Production deployment |

### Phase 3 — Advanced Features (Weeks 9-12)

| Deliverable | Description |
|---|---|
| Subscriptions | Recurring billing on Soroban (time-locked payments) |
| Invoicing | Generate and send invoices with payment links |
| Fiat settlement | Merchant receives USD/EUR via SEP-24 anchor integration |
| WooCommerce plugin | Install-and-configure for WooCommerce stores |
| SDK expansion | Python, Go SDKs |

---

## Competitive Landscape

| Feature | OrbitStream | Solana Pay | Stripe (Fiat) | NOWPayments |
|---|---|---|---|---|
| **Settlement speed** | ~5 sec | <1 sec | 2-7 days | Minutes-hours |
| **Transaction fee** | $0.00001 | $0.00025 | 2.9% + $0.30 | 0.5-1% |
| **Fiat on/off ramps** | Native (SEPs, anchors, MoneyGram) | Limited | Built-in | Limited |
| **Hosted checkout** | Yes | No (SDK only) | Yes | Yes |
| **Embedded widget** | Yes | No | Yes | Yes |
| **Webhook system** | Yes | No (polling) | Yes | Yes |
| **Merchant dashboard** | Yes | No | Yes | Yes |
| **Multi-currency display** | Yes (via built-in DEX) | SOL, USDC | 135+ fiat | Crypto only |
| **Regulatory compliance** | Built into SEPs | Minimal | Full PCI/AML | KYC optional |
| **Physical cash rails** | MoneyGram (350K locations) | No | No | No |

**OrbitStream's moat:** It's the only solution that combines Stripe-like developer experience with Stellar's native fiat infrastructure. Generic crypto processors (NOWPayments, BitPay) don't use Stellar's SEPs or anchors. Solana Pay has better SDK but no fiat settlement story. Stripe is fiat-only.

---

## Stellar-Specific Advantages

### SEP Protocol Integration

| SEP | How OrbitStream Uses It |
|---|---|
| **SEP-10** | Authentication — merchants and customers prove Stellar account ownership |
| **SEP-12** | KYC data collection for fiat settlement (anchor compliance) |
| **SEP-24** | Hosted deposit/withdrawal — merchant fiat settlement via anchor iframe |
| **SEP-31** | Cross-border payments — enable international merchant settlement |

### Built-in DEX

Stellar has a native decentralized exchange. OrbitStream can:
- Accept any Stellar asset and auto-convert to merchant's preferred currency
- Show prices in local fiat using DEX order books
- Route payments through the best available path

### Muxed Accounts

Each checkout session can use a unique muxed account (sub-account of a single Stellar account), making it trivial to match incoming payments to specific orders without on-chain state.

### Claimable Balances

For escrow-like flows (marketplace, freelance), OrbitStream can use Claimable Balances to hold funds with time-locked or conditional release — no smart contract required.

---

## Grant Pitch

### For Stellar Community Fund (SCF)

> Stellar has the best payment rails in crypto — sub-5-second settlement, $0.00001 fees, $83M+ USDC supply, MoneyGram cash rails in 350K+ locations, and mature anchor networks in 40+ countries. But there is no merchant-facing product layer. A business that wants to accept USDC on Stellar today must build payment detection, confirmation logic, and checkout UI from scratch.
>
> OrbitStream bridges this gap with a Stripe-like developer experience: a hosted checkout page, embeddable widget, JS SDK, and webhook system — so any merchant can start accepting Stellar payments in under 10 minutes.
>
> Unlike generic crypto processors (NOWPayments, BitPay), OrbitStream is Stellar-native — it uses SEP protocols for fiat settlement, the built-in DEX for multi-asset support, and muxed accounts for payment matching. Unlike Solana Pay, it offers a complete merchant dashboard and leverages Stellar's mature fiat infrastructure.
>
> This project fills a clear gap in the Stellar ecosystem: strong payment infrastructure with zero merchant tooling on top. It benefits every Stellar anchor, wallet, and USDC holder by expanding where Stellar payments are accepted.

### Key Differentiators for Grant Reviewers

1. **No existing SCF competitor** — streaming payments has Fluxity + two other funded projects. Merchant gateway is true white space.
2. **Composable with existing ecosystem** — enhances every anchor, wallet, and SEP integration
3. **Clear user story** — "A coffee shop in Buenos Aires accepts USDC via a QR code, settles in ARS via a Stellar anchor"
4. **Measurable impact** — merchant count, transaction volume, developer integrations
5. **Sustainable model** — transaction fee (0.5%) or SaaS tiers post-grant

---

## Sustainability Plan

### During Grant Period
- Free tier: unlimited transactions, basic dashboard
- Focus on adoption and ecosystem integration

### Post-Grant Revenue Model

| Tier | Price | Includes |
|---|---|---|
| **Free** | $0/mo | 100 transactions/mo, hosted checkout, basic webhooks |
| **Pro** | $29/mo | 10K transactions/mo, custom branding, advanced analytics, priority support |
| **Enterprise** | Custom | Unlimited transactions, SLA, custom integrations, fiat settlement |

**Transaction fee option:** 0.5% per transaction on free tier (competitive with Stripe's 2.9%). Pro/Enterprise tiers waive the per-transaction fee.

---

## Success Metrics

| Metric | Target (6 months post-launch) |
|---|---|
| Merchant signups | 500+ |
| Active merchants (monthly) | 100+ |
| Transaction volume | $500K+ cumulative |
| Developer integrations | 50+ (SDK installs) |
| Checkout page conversions | >60% (pay after viewing checkout) |

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **Low merchant adoption** | Target crypto-native merchants first (NFT creators, Web3 SaaS, DAOs). Expand to traditional merchants via MoneyGram fiat settlement story. |
| **Soroban ecosystem immaturity** | Core MVP uses Stellar classic transactions + SEPs. Soroban only for advanced features (subscriptions, escrow). |
| **Anchor availability** | Start with USDC (Circle) as primary asset. Add fiat settlement as anchors become available per region. |
| **Competition from Solana Pay** | Differentiate on fiat infrastructure (SEPs, MoneyGram, anchors). Solana Pay lacks this. |
| **Regulatory uncertainty** | Leverage Stellar's compliance-friendly design. SEP-12 handles KYC. Partner with licensed anchors for fiat. |

---

## Open Questions

- [ ] Should the MVP target crypto-native merchants (easier) or traditional merchants (bigger impact)?
- [ ] Should the hosted checkout be self-hostable or SaaS-only?
- [ ] Which anchors to partner with for fiat settlement MVP?
- [ ] Should we build a Shopify plugin in parallel with WooCommerce?
- [ ] What's the right fee model — transaction fee, SaaS tier, or hybrid?
