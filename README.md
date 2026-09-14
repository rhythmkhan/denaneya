# DenaNeya (দেনা-নেওয়া) — Bangladesh Payment Orchestration & Counter Automation Platform

<div align="center">

> **"দেনা-নেওয়া সহজ, হিসাব নিশ্চিত।"**  
> *Seamless Payments, Guaranteed Accounting.*

[![CI/CD Pipeline](https://github.com/rhythmkhan/denaneya/actions/workflows/ci.yml/badge.svg)](https://github.com/rhythmkhan/denaneya/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![pnpm Version](https://img.shields.io/badge/pnpm-11.17.0-orange.svg)](https://pnpm.io/)
[![Turborepo](https://img.shields.io/badge/turborepo-2.10.12-ef4444.svg)](https://turbo.build/repo)
[![Next.js](https://img.shields.io/badge/Next.js-15.1.7-black.svg)](https://nextjs.org/)
[![Vitest](https://img.shields.io/badge/Vitest-3.2.7-729B1B.svg)](https://vitest.dev/)
[![Android API](https://img.shields.io/badge/Android-API%2035%20(15)-green.svg)](https://developer.android.com)

**DenaNeya** is an enterprise-grade, multi-tenant payment management and orchestration platform engineered specifically for Bangladesh's unique dual digital economy: unifying formal Commercial Payment Gateways (SSLCOMMERZ, shurjoPay, aamarPay, bKash PGW, Nagad PGW) with in-store Mobile Financial Services (MFS: bKash, Nagad, Rocket, Upay) counter automation.

</div>

---

## ⚠️ Regulatory Safety & Operating Model Disclosure

```
================================================================================
CRITICAL OPERATIONAL DISCLOSURE: SOFTWARE / ORCHESTRATION MODE ONLY
================================================================================
DenaNeya operates strictly as a software orchestration and transaction
management gateway. By default and by architecture:

    REGULATED_FEATURES_ENABLED=false

1. NON-CUSTODIAL: DenaNeya NEVER holds, custody, or pools merchant or consumer
   funds at any point in the transaction lifecycle.
2. DIRECT-TO-MERCHANT SETTLEMENT: Customer settlements flow directly through
   licensed payment service providers (PSPs) and payment system operators (PSOs)
   directly into the merchant's regulated bank account or MFS merchant wallet.
3. NO E-MONEY ISSUANCE: DenaNeya does not issue electronic money, stored-value
   wallets, or credit lines.
================================================================================
```

---

## 📑 Table of Contents

- [Core Value Proposition](#-core-value-proposition)
- [System Architecture](#-system-architecture)
- [Monorepo Structure](#-monorepo-structure)
- [Key Features](#-key-features)
- [Technology Stack](#-technology-stack)
- [Installation & Local Development](#-installation--local-development)
- [Environment Configuration](#-environment-configuration)
- [Database Setup & Migrations](#-database-setup--migrations)
- [Testing Guide](#-testing-guide)
- [Production Deployment](#-production-deployment)
- [Security Architecture & Notes](#-security-architecture--notes)
- [API & Integration Documentation](#-api--integration-documentation)
- [Troubleshooting & FAQ](#-troubleshooting--faq)
- [Author & Maintenance](#-author--maintenance)

---

## 🚀 Core Value Proposition

In Bangladesh, over 70% of retail transactions occur over Mobile Financial Services (bKash, Nagad, Rocket, Upay) via consumer Cash-Out or Send-Money, while modern e-commerce relies on Payment Gateway aggregators (SSLCOMMERZ, shurjoPay, aamarPay).

DenaNeya solves this bifurcation:
1. **Unifies All Gateways**: Single normalized REST API (`/api/v1/payments`) supporting automated failover and dynamic routing between gateways.
2. **Automates Retail Counter MFS**: Dedicated native Android Collector application captures transaction SMS notifications, cryptographically signs them using the hardware Keystore (EC P-256), and reconciles counter payments in real time.
3. **Zero-Float Financial Math**: All currency calculations are executed in minor integer units (`BigInt Paisa`), mathematically guaranteeing zero floating-point drift across 10,000+ transaction batches.
4. **Immutable Double-Entry Ledger**: Every state transition generates balanced debit/credit journal entries (`Assets = Liabilities + Equity`).
5. **Anti-Fraud Engine & Dual Control**: 12 deterministic heuristic rules evaluate risk scores (0–100) with a Maker-Checker queue for manual approvals.

---

## 🏗️ System Architecture

```mermaid
C4Context
    title DenaNeya High-Level Platform Architecture

    Person(customer, "Customer / Payer", "Initiates payment via checkout page or retail MFS transfer")
    Person(merchant, "Merchant Admin", "Manages invoices, keys, webhooks, and settles accounts")
    Person(checker, "Risk Reviewer / Checker", "Authorizes flagged high-risk or manual payments")

    System(denaneya, "DenaNeya Platform", "Multi-tenant orchestration engine, double-entry ledger, anti-fraud engine, and REST API")

    System_Ext(pgw, "Commercial Gateways", "SSLCOMMERZ, shurjoPay, aamarPay, bKash PGW, Nagad PGW")
    System_Ext(android, "Android SMS Collector", "Dedicated phone on retail counter; signs SMS via Android Keystore EC P-256")
    System_Ext(db, "Neon Serverless PostgreSQL", "Stores 24 relational domain entities with Drizzle ORM")
    System_Ext(queue, "Upstash QStash", "Serverless message queue for webhook retry and reconciliation jobs")
    System_Ext(webhookDest, "Merchant Backend", "Receives HMAC-SHA256 signed event webhooks")

    Rel(customer, denaneya, "Submits card / PGW / MFS checkout", "HTTPS")
    Rel(merchant, denaneya, "Accesses dashboard and API", "HTTPS / Bearer Auth")
    Rel(checker, denaneya, "Performs dual-control approvals", "HTTPS / MFA")
    Rel(denaneya, pgw, "Initiates & verifies payments", "HTTPS / JSON / RSA")
    Rel(android, denaneya, "Uploads signed SMS events", "HTTPS / EC P-256 Signature")
    Rel(denaneya, db, "ACID ledger & payment state", "Postgres Wire / SSL")
    Rel(denaneya, queue, "Enqueues outbox events & retries", "HTTPS / REST")
    Rel(denaneya, webhookDest, "Delivers signed webhooks", "HTTPS / POST HMAC-SHA256")
```

---

## 📂 Monorepo Structure

Managed via **Turborepo** and **pnpm workspaces**:

```
h:\DenaNeya/
├── apps/
│   ├── web/                           # Next.js 15 App Router (Dashboard, Checkout, REST API v1, Docs)
│   └── android/                       # Native Android Jetpack Compose MFS SMS Collector App
├── packages/
│   ├── payment-core/                  # Paisa math, 11-state FSM, currency types, core Zod schemas
│   ├── ledger/                        # Immutable double-entry bookkeeping engine, 5-tier accounts
│   ├── security/                      # AES-256-GCM envelope encryption, Argon2id, SSRF guard, RBAC
│   ├── sms-parser/                    # Versioned MFS SMS regex parsers, balance chaining, deduplication
│   ├── fraud-engine/                  # 12-rule risk scoring engine (0-100), Maker-Checker dual control
│   ├── gateway-adapters/              # Unified GatewayAdapter interface, SSLCOMMERZ, bKash, Nagad, etc.
│   ├── webhooks/                      # Transactional outbox engine, HMAC-SHA256 signing, exponential retry
│   ├── observability/                 # Structured JSON logging, OpenTelemetry tracing, correlation IDs
│   ├── reconciliation/                # Three-way reconciliation engine and auto-healing worker
│   ├── database/                      # Drizzle ORM schemas (24 tables), migrations, pool connection
│   └── tsconfig/                      # Shared TypeScript base configurations
├── docs/                              # 18 production documentation guides & OpenAPI 3.1 specs
│   ├── ARCHITECTURE.md                # C4 diagrams, FSM states, trust tiers, concurrency guarantees
│   ├── DATABASE.md                    # Database ERD, table specs, Drizzle schemas, check constraints
│   ├── SECURITY.md                    # OWASP ASVS/MASVS, encryption, Argon2id, SSRF guard
│   ├── API.md                         # REST API v1 specification, RFC 7807 problem details
│   ├── WEBHOOKS.md                    # Outbox pattern, HMAC signatures in 5 languages, DLQ
│   ├── ANDROID-SMS-AUTOMATION.md      # Keystore EC P-256, QR pairing, Room DB, WorkManager
│   ├── FRAUD-PREVENTION.md            # 12 fraud rules, risk scores, Maker-Checker runbook
│   ├── GATEWAY-INTEGRATIONS.md        # Adapter matrix (SSLCOMMERZ, bKash, Nagad, shurjoPay, etc.)
│   └── VERCEL.md                      # Deployment configuration, Singapore sin1, edge headers
├── tests/
│   └── e2e/                           # 5-Tier E2E test suite (388 tests, 100% pass)
│       ├── tier1-features/            # 33 individual feature suites (F01–F33)
│       ├── tier2-boundary/            # Boundary value analysis & corner cases
│       ├── tier3-pairwise/            # Cross-feature interaction combinations
│       ├── tier4-workloads/           # Real-world merchant operational journeys
│       └── tier5-adversarial/         # Concurrency races (128 parallel), Monte Carlo
├── vercel.json                        # Vercel deployment specification (sin1, security headers)
├── .env.example                       # Comprehensive environment variable template
├── pnpm-workspace.yaml                # Workspace definitions
├── package.json                       # Monorepo root scripts & dependencies
└── turbo.json                         # Turborepo task pipeline configuration
```

---

## ⚡ Key Features

| Category | Capability | Specification |
|---|---|---|
| **Currency & Math** | Pure BigInt Paisa Math | Minor integer units (1 BDT = 100 Paisa), 0 float arithmetic, zero drift |
| **State Machine** | Strict 11-State FSM | `CREATED` $\to$ `PENDING` $\to$ `AUTHORIZED` $\to$ `COMPLETED` / `FAILED` / `REFUNDED` |
| **Ledger** | Double-Entry Accounting | Multi-currency, 5-tier Chart of Accounts, balanced journal verification |
| **Gateways** | Unified Adapters | SSLCOMMERZ, shurjoPay, aamarPay, bKash PGW, Nagad PGW with health checks |
| **Android Automation** | Counter MFS Capture | bKash, Nagad, Rocket, Upay SMS parsing; EC P-256 hardware attestation |
| **Fraud Prevention** | 12 Real-Time Heuristics | Velocity checks, IP country mismatch, dormant surge, Maker-Checker review |
| **Webhooks** | Transactional Outbox | HMAC-SHA256 signature, exponential backoff, dead-letter queue (DLQ) |
| **Invoicing & Links** | Digital B2B Invoices | Multi-line item invoices, printable receipts, dynamic QR payment links |
| **Security** | Zero-Trust Architecture | Argon2id passwords, AES-256-GCM envelope encryption, RFC 1918 SSRF guard |
| **Reconciliation** | Three-Way Financial Recon | Gateway statement vs Ledger vs Outbox with auto-healing settlement |

---

## 🛠️ Technology Stack

- **Frontend / Fullstack**: Next.js 15.1.7 (App Router, Server Actions, Route Handlers), React 19, Tailwind CSS v4, Lucide React
- **Mobile**: Android Jetpack Compose, Kotlin 2.0, Android Keystore EC P-256, Room DB, WorkManager
- **Database**: PostgreSQL 17 / Neon Serverless (Singapore `sin1`), Drizzle ORM 0.39
- **Authentication**: NextAuth / Auth.js, Jose (JWT), WebCrypto API, TOTP MFA
- **Message Queues**: Upstash QStash (Serverless Webhook Dispatcher & Delayed Retries)
- **Monorepo Tooling**: pnpm 11.17.0, Turborepo 2.10.12, TypeScript 5.7
- **Testing**: Vitest 3.2.7, tsx 4.19, JNI/Robolectric mock harnesses

---

## 💻 Installation & Local Development

### Prerequisites
- **Node.js**: `v20.x` or `v22.x` (LTS recommended; tested on `v22.20.0`)
- **pnpm**: `v11.17.0` (`corepack enable pnpm` or `npm install -g pnpm@11.17.0`)
- **Java JDK**: `17` or `21` (Temurin) if building the Android app
- **Android SDK**: Build Tools 35.0.0, API Level 35

### Step-by-Step Setup

```bash
# 1. Clone repository
git clone https://github.com/rhythmkhan/denaneya.git
cd denaneya

# 2. Install workspace dependencies
pnpm install

# 3. Create local environment configuration
cp .env.example .env.local

# 4. Generate necessary cryptographic master secrets
# Generate a 32-byte hex key for ENCRYPTION_MASTER_KEY:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate a 32-byte hex key for NEXTAUTH_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 5. Push database schemas (when running local or Neon PostgreSQL)
pnpm db:migrate
pnpm db:seed

# 6. Start Turborepo development servers
pnpm dev
```

The web application runs at:
- **Public Marketing & Documentation**: [http://localhost:3000](http://localhost:3000)
- **Merchant Dashboard**: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
- **System Admin & Fraud Review**: [http://localhost:3000/admin](http://localhost:3000/admin)
- **Hosted Checkout Simulator**: [http://localhost:3000/checkout](http://localhost:3000/checkout)
- **OpenAPI 3.1 Specification**: [http://localhost:3000/api/v1/openapi.json](http://localhost:3000/api/v1/openapi.json)

---

## 🔐 Environment Configuration

Key configuration parameters (see [`.env.example`](./.env.example) and [`docs/ENVIRONMENT.md`](./docs/ENVIRONMENT.md) for the full 9-domain dictionary):

| Variable | Required | Description | Example / Default |
|---|---|---|---|
| `NODE_ENV` | Yes | Runtime environment | `production` / `development` |
| `NEXT_PUBLIC_APP_URL` | Yes | Base canonical URL of the application | `https://denaneya.vercel.app` |
| `REGULATED_FEATURES_ENABLED` | Yes | Operational safety flag; must remain `false` | `false` |
| `DATABASE_URL` | Yes | Pooled connection string for serverless functions | `postgres://user:pass@host/db?sslmode=require` |
| `DIRECT_URL` | Yes | Direct unpooled connection string for migrations | `postgres://user:pass@host/db?sslmode=require` |
| `NEXTAUTH_SECRET` | Yes | 32-byte hex secret for JWT session encryption | `openssl rand -hex 32` |
| `ENCRYPTION_MASTER_KEY` | Yes | 32-byte hex secret for AES-256-GCM envelope encryption | `openssl rand -hex 32` |
| `WEBHOOK_SIGNING_SECRET` | Yes | Shared secret for signing outbound webhook payloads | `whsec_...` |
| `DEVICE_PAIRING_SECRET` | Yes | Secret for generating one-time QR pairing tokens | `pairing_secret_...` |
| `QSTASH_URL` | Optional | Upstash QStash API URL for asynchronous retries | `https://qstash.upstash.io/v2` |
| `QSTASH_TOKEN` | Optional | Upstash QStash Bearer token | `mock_qstash_token` |
| `SSLCOMMERZ_STORE_ID` | Optional | SSLCOMMERZ Sandbox Merchant ID | `denan66000sandbox` |
| `BKASH_APP_KEY` | Optional | bKash Checkout Sandbox App Key | `bkash_sandbox_app_key` |
| `NAGAD_MERCHANT_ID` | Optional | Nagad PGW Sandbox Merchant ID | `683002007104225` |

---

## 🧪 Testing Guide

DenaNeya features an industry-leading **5-Tier End-to-End Test Suite** with 388 requirement-driven, opaque-box tests covering all edge cases, boundary values, and high-concurrency races.

```bash
# Run all workspace unit and integration tests (22 suites, 345+ tests)
pnpm test

# Run code coverage report
pnpm test:coverage

# Run entire 5-Tier E2E test suite (388 tests, 100% pass)
pnpm test:e2e

# Run specific E2E tiers:
pnpm test:e2e --tier=1      # Tier 1: 33 Feature Suites (F01–F33, 165 tests)
pnpm test:e2e --tier=2      # Tier 2: Boundary Value Analysis (6 suites, 165 tests)
pnpm test:e2e --tier=3      # Tier 3: Pairwise Combinations (7 suites, 37 tests)
pnpm test:e2e --tier=4      # Tier 4: Real-World Merchant Workloads (15 scenarios)
pnpm test:e2e --tier=5      # Tier 5: Adversarial Hardening (128 parallel concurrency races)

# Run Android native unit tests
cd apps/android && ./gradlew testDebugUnitTest
```

---

## 🚀 Production Deployment

### Vercel Deployment

The application is architected for zero-configuration serverless deployment on **Vercel** targeting the Singapore region (`sin1` — closest to Dhaka with lowest latency).

1. **Link to Vercel**:
   ```bash
   pnpm vercel link
   ```
2. **Configure Environment Variables**:
   In Vercel Dashboard $\to$ Project Settings $\to$ Environment Variables, configure the variables defined in `.env.example`.
3. **Deploy**:
   ```bash
   pnpm vercel deploy --prod
   ```

### Security Headers Configured in `vercel.json`:
- `Content-Security-Policy`: Disallows untrusted frames, external scripts, and unsafe object rendering.
- `Strict-Transport-Security`: `max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options`: `nosniff`
- `X-Frame-Options`: `DENY`
- `Referrer-Policy`: `strict-origin-when-cross-origin`
- `Permissions-Policy`: Disables unnecessary browser capabilities (`camera=()`, `microphone=()`).

---

## 🔒 Security Architecture & Notes

DenaNeya implements defense-in-depth across all system layers:

1. **Zero Floating-Point Money Arithmetic**:
   All monetary amounts are strictly 64-bit integer paisa. Floating-point types are prohibited at both TypeScript and database schema levels.
2. **Hardware Attestation & Digital Signatures**:
   The Android Collector uses the Android Keystore to generate non-exportable EC P-256 keys. Every SMS event is signed and verified on the server before entering the transaction processing pipeline.
3. **Anti-Replay Protection**:
   All incoming requests enforce monotonic sequence numbering, one-time nonces, and timestamp validation within a 300-second drift tolerance window.
4. **SSRF Guard**:
   All outgoing webhook and IPN dispatchers inspect resolved DNS addresses before making HTTP requests, strictly blocking RFC 1918 private IP ranges, loopback (`127.0.0.1`), link-local metadata (`169.254.169.254`), and non-standard IP notations.
5. **AES-256-GCM Envelope Encryption**:
   Merchant gateway credentials and API keys are envelope-encrypted using AES-256-GCM with distinct IVs and authentication tags.
6. **Argon2id Password Hashing**:
   All user passwords are hashed using memory-hard Argon2id with cryptographically generated salts.
7. **Rate Limiting & Anti-Brute Force**:
   Token bucket rate limiters protect all authentication routes (`/api/v1/auth/*`), payment endpoints, and device pairing channels.

---

## 📖 API & Integration Documentation

Comprehensive documentation is available in the [`docs/`](./docs/) directory:
- [REST API v1 Specification](./docs/API.md) & [OpenAPI 3.1 Document](./docs/openapi.json)
- [Webhook Architecture & Verification Guide](./docs/WEBHOOKS.md)
- [Gateway Integrations & Adapters Guide](./docs/GATEWAY-INTEGRATIONS.md)
- [Android SMS Collector Integration Guide](./docs/ANDROID-SMS-AUTOMATION.md)
- [Double-Entry Ledger Specification](./docs/ARCHITECTURE.md#ledger)
- [Database Schema & Migrations](./docs/DATABASE.md)

---

## ❓ Troubleshooting & FAQ

### 1. `pnpm approve-builds` prompt on new installations
**Symptom**: `[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: ...`  
**Resolution**: Run `pnpm approve-builds --all` to authorize verified workspace build scripts.

### 2. Android Lint reporting ChromeOS Telephony Warning
**Symptom**: `Permission exists without corresponding hardware <uses-feature android:name="android.hardware.telephony" required="false">`  
**Resolution**: Ensure `apps/android/app/src/main/AndroidManifest.xml` includes `<uses-feature android:name="android.hardware.telephony" android:required="false" />`.

### 3. Database connection pool exhaustion
**Symptom**: `Error: timeout exceeded when connecting to database`  
**Resolution**: Ensure `DATABASE_URL` uses the pooled PgBouncer endpoint (`-pooler.ap-southeast-1.aws.neon.tech`) for serverless functions, and `DIRECT_URL` is used only for DDL migrations.

### 4. Webhook delivery failing with SSRF Error
**Symptom**: `SSRF Blocked: URL resolves to private or loopback address`  
**Resolution**: For local testing, webhooks cannot point to `localhost` or `127.0.0.1`. Use a secure tunnel such as Cloudflare Tunnels or ngrok.

---

## 👤 Author & Maintenance

- **Owner / Lead Architect**: [Rhythm Khan](https://github.com/rhythmkhan)
- **Repository**: [https://github.com/rhythmkhan/denaneya](https://github.com/rhythmkhan/denaneya)
- **License**: MIT
