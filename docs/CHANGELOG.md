# DenaNeya Platform Changelog & Release History

All notable changes to the DenaNeya payment management and orchestration platform are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0-rc1] — 2026-09-14
### Milestone M6: Security Hardening, Reconciliation, OpenAPI 3.1, Vercel & Comprehensive Documentation

#### Added
- **OpenAPI 3.1.0 Specifications**: Full specification covering all 16 endpoints across 7 resource domains (`Payments`, `Payment Links`, `Invoices`, `Webhooks`, `Devices`, `Gateways`, `Reconciliation`) generated in `docs/openapi.json` and `docs/openapi.yaml`.
- **Dynamic Spec Route Handler**: Implemented `apps/web/src/app/api/v1/openapi.json/route.ts` delivering the spec with aggressive edge caching and CORS headers.
- **Three-Way Reconciliation Suite**: Tri-directional batch reconciliation engine comparing internal payments against upstream gateway settlement statements and double-entry ledger journals.
- **Technical Architecture Diagrams**: 7 standalone Mermaid visual models in `docs/diagrams/` (`architecture.mmd`, `checkout-sequence.mmd`, `sms-collector-sequence.mmd`, `webhook-delivery-sequence.mmd`, `maker-checker-sequence.mmd`, `reconciliation-sequence.mmd`, `database-er.mmd`).
- **Complete Technical Documentation Suite**: 18 production-grade technical manuals in `docs/` covering architecture, database, security, threat modeling, APIs, webhooks, mobile collection, fraud prevention, gateways, deployment, Vercel, environment, disaster recovery, incident response, testing, and regulatory compliance.
- **Production Vercel Configuration**: `vercel.json` configured for Singapore (`sin1`) serverless region, co-located with Neon PostgreSQL (`ap-southeast-1`), hardened with HSTS, CSP, and permission policies.
- **Automated GitHub Actions CI/CD Pipeline**: `.github/workflows/ci.yml` providing 4 automated quality gates (`lint-and-typecheck`, `test-monorepo`, `test-android`, `secret-scan`).
- **Configuration Template Catalog**: `.env.example` documenting all 9 operational configuration domains with entropy guidelines.

#### Security
- Bitwise CIDR SSRF validation engine blocking loopback, private networks, and cloud metadata (`169.254.169.254`).
- Strict HTTP security headers enforced at the Vercel edge.

---

## [0.5.0] — 2026-09-13
### Milestone M5: Android SMS Collector Application & Keystore Attestation

#### Added
- **Native Android Collector App (`apps/android`)**: Jetpack Compose, Material 3, Clean Architecture, and SQLCipher Room database.
- **Hardware-Backed Cryptography**: Android Keystore EC P-256 asymmetric keypair generation using StrongBox / TEE hardware security modules.
- **Anti-Replay Protocol**: Canonical event envelope signing with monotonic sequence numbering, 128-bit UUID nonces, and timestamp validation windows.
- **QR Pairing Ceremony**: Ephemeral 15-minute token handshake for zero-credential mobile device onboarding.
- **Offline Resilient Queue**: WorkManager background synchronization with exponential backoff and battery optimization exemption.
- **Cross-Verification Test Harness**: `tsx test_cross_verification.mts` verifying Kotlin Android Keystore signatures in Node.js.

---

## [0.4.0] — 2026-09-12
### Milestone M4: Next.js Web Application, Hosted Checkout, Merchant Dashboard & REST API v1

#### Added
- **Hosted Checkout Experience (`/pay/:id`)**: Responsive, localized checkout portal supporting bKash, Nagad, Rocket, and card payment flows.
- **Merchant Administration Dashboard (`/dashboard`)**: Analytics, transaction lists, payment link generator, invoice manager, and device pairing interface.
- **Admin & Risk Review Console (`/admin`)**: Gateway health telemetry, audit log explorer, and Maker-Checker dual-control review queue.
- **REST API v1 Handlers**: Robust Next.js Route Handlers for `/api/v1/payments`, `/api/v1/payment-links`, `/api/v1/invoices`, `/api/v1/webhooks`, and `/api/v1/devices`.

#### Changed
- Enforced sliding window rate limiting on authentication and API endpoints.

---

## [0.3.0] — 2026-09-11
### Milestone M3: Gateway Adapters, Versioned SMS Parsers & Webhook Infrastructure

#### Added
- **Unified Gateway Adapter Package (`@denaneya/gateway-adapters`)**: Provider-agnostic adapter contract supporting SSLCOMMERZ, shurjoPay, aamarPay, bKash, and Nagad.
- **Versioned SMS Parser Engine (`@denaneya/sms-parser`)**: Robust regex parsing for bKash, Nagad, Rocket, and Upay telco notifications.
- **Rolling Balance-Chain Invariant**: Mathematical verification verifying that prior balance plus received amount minus fee equals new balance.
- **Transactional Outbox Engine (`@denaneya/webhooks`)**: At-least-once webhook delivery with HMAC-SHA256 signatures, exponential backoff (30s, 2m, 15m, 1h, 6h), and Dead Letter Queue routing.

---

## [0.2.0] — 2026-09-10
### Milestone M2: Payment Core State Machine, Double-Entry Ledger & Anti-Fraud Engine

#### Added
- **Core Domain Package (`@denaneya/payment-core`)**: Strict zero-float integer paisa arithmetic and explicit 11-state payment Finite State Machine.
- **Double-Entry Ledger Engine (`@denaneya/ledger`)**: 5-tier Chart of Accounts (Assets, Liabilities, Equity, Revenue, Expenses) with balanced journal entry validation.
- **12-Rule Anti-Fraud Engine (`@denaneya/fraud-engine`)**: Composite risk scoring (0–100), automated classification tiers (LOW, MEDIUM, HIGH, CRITICAL), and dual-control Maker-Checker review queue.

#### Security
- Added PostgreSQL deferred trigger enforcing that the sum of debits equals the sum of credits for every ledger transaction.

---

## [0.1.0] — 2026-09-09
### Milestone M1: Monorepo Foundation, Database Schema & Cryptographic Security

#### Added
- **Turborepo & pnpm Monorepo Setup**: Configured package workspaces, strict TypeScript compiler options, ESLint, and Vitest test runners.
- **Database Schema (`@denaneya/database`)**: 24 relational tables defined in Drizzle ORM for Neon Serverless PostgreSQL with primary keys, foreign keys, and unique indexes.
- **Cryptographic Engine (`@denaneya/security`)**: AES-256-GCM envelope encryption for sensitive credentials and Argon2id password hashing.
- **Brand Identity**: Established brand assets and slogan: *"দেনা-নেওয়া সহজ, হিসাব নিশ্চিত।"*
