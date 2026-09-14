# DenaNeya — Requirement-Driven Opaque-Box E2E Test Suite Infrastructure

**Document Version**: 1.0.0  
**Author**: E2E Test Architecture Explorer (`explorer_e2e_infra`)  
**Workspace**: `h:\DenaNeya\`  
**Target File**: `h:\DenaNeya\TEST_INFRA.md`  
**Execution Context**: Vitest Test Runner / Node 22 / Turborepo Workspaces  
**Governing Documents**: `h:\DenaNeya\ORIGINAL_REQUEST.md`, `h:\DenaNeya\.agents\orchestrator_1\PROJECT.md`  

---

## 1. Executive Summary & Testing Philosophy

### 1.1 Opaque-Box & Requirement-Driven Testing Mandate
DenaNeya ("দেনা-নেওয়া সহজ, হিসাব নিশ্চিত।") is a production-grade, multi-tenant payment management and orchestration platform designed to handle real merchant money across Bangladesh. In financial infrastructure, software failures cause direct economic loss, regulatory penalties, and reputational damage.

The DenaNeya End-to-End (E2E) Test Suite is constructed with a strict **opaque-box (black-box)**, **requirement-driven** testing philosophy:
1. **Opaque-Box Boundary**: Tests interact with the platform exclusively via observable public boundaries: REST APIs (`/api/v1/*`), domain contracts (exported interfaces of shared packages), public database state changes (via read-only verification queries), web pages (HTTP status, DOM structure, response headers), and signed device payloads. Tests **never** reach into internal private state, rely on private implementation details, or monkey-patch private methods.
2. **Zero-Compromise Financial Invariants**: Every financial transition must obey mathematical invariants:
   - Money is strictly 64-bit integer minor units (paisa, where 1 BDT = 100 paisa) with zero floating-point math.
   - Double-entry ledger entries must always balance: $\sum \text{Debits} == \sum \text{Credits}$.
   - Settlement is atomic: payment status update, ledger posting, transaction consumption, and outbox event occur within a single database transaction.
   - Idempotency guarantees exactly-once business effect under arbitrary retries or race conditions.
3. **Traceability to Original Requirements**: Every test case maps directly to an authoritative requirement in `ORIGINAL_REQUEST.md` (R1–R5, AC) and the 33 features cataloged in `PROJECT.md`.

---

### 1.2 The 4-Tier Test Pyramid (+ Tier 5 Adversarial Hook)

```
                       +-----------------------------------+
                       |  Tier 5: Adversarial Hardening    |  (M7: Penetration, 100+ Concurrency Races,
                       |         (White-Box Challengers)   |   Chaos Injection, Memory Leaks)
                       +-----------------------------------+
                       |  Tier 4: Real-World Scenarios     |  (15 Complex Multi-Step End-to-End Workflows,
                       |       (Real-World Workloads)      |   Business Journeys, Field Operations)
                       +-----------------------------------+
                       |  Tier 3: Pairwise Combinations    |  (35 Cross-Feature Interactions, Orthogonal
                       |        (Cross-Feature Matrix)     |   Array Combinations, Edge Couplings)
                       +-----------------------------------+
                       |  Tier 2: Boundary & Corner Cases  |  (165 Tests: 33 Features x >=5 Tests, Extreme
                       |      (Boundary Value Analysis)    |   Limits, Clock Skew, Unicode, Malformed)
                       +-----------------------------------+
                       |  Tier 1: Feature Coverage (Core)  |  (165 Tests: 33 Features x >=5 Tests, Happy Path,
                       |      (Category-Partition Method)  |   Nominal Flows, Primary State Verification)
                       +-----------------------------------+
```

#### Test Hierarchy Catalog Summary:
| Tier | Testing Method | Target Focus | Test Count | Milestone Availability |
|---|---|---|---|---|
| **Tier 1** | Category-Partition (Ostrand-Balcer) | Nominal feature contracts & functional specifications | **165 tests** (33 features × 5) | Progressive (M1 to M6) |
| **Tier 2** | Boundary Value Analysis (BVA) | Extremes, overflows, timeouts, clock drifts, illegal state transitions | **165 tests** (33 features × 5) | Progressive (M1 to M6) |
| **Tier 3** | Pairwise Combinatorial Design | Cross-module feature interactions & multi-system couplings | **35 tests** (Cross-cutting) | M3 to M6 |
| **Tier 4** | Real-World Workload Testing | Realistic business workflows, operational lifecycle journeys | **15 tests** (E2E workflows) | M4 to M6 |
| **Tier 5** | Adversarial Coverage Hardening | Concurrency races (20x TrxID, 100+ parallel requests), white-box chaos | Hooked in M7 | M7 |
| **TOTAL** | **Comprehensive E2E Suite** | **Exhaustive platform verification** | **380 tests** | **100% Pass in M7** |

---

### 1.3 Methodology Definitions

1. **Category-Partition Method (Ostrand & Balcer)**:
   - Identify functional parameters and environmental conditions for each feature.
   - Partition parameter spaces into disjoint equivalence classes (valid, boundary, invalid).
   - Generate test specifications combining valid categories for Tier 1 and invalid/exceptional categories for Tier 2.

2. **Boundary Value Analysis (BVA)**:
   - Test inputs and system states at strict mathematical boundaries: $\text{min}-1$, $\text{min}$, $\text{min}+1$, nominal, $\text{max}-1$, $\text{max}$, $\text{max}+1$.
   - Includes integer minor unit limits, HTTP header lengths, clock skew windows ($\pm 300$ seconds), risk score brackets ($0, 29, 30, 59, 60, 84, 85, 100$), and rate limit thresholds ($10$ req/min vs $11$ req/min).

3. **Pairwise Combinatorial Testing**:
   - Utilize orthogonal arrays to test all 2-way combinations of orthogonal inputs across distinct features (e.g., Gateway Provider $\times$ Currency/Amount Type $\times$ Risk Engine Threshold $\times$ Webhook Outbox Delivery Status).
   - Exponentially reduces state explosion while providing mathematically verified interaction coverage.

4. **Real-World Workload Simulation**:
   - Complex, multi-step asynchronous business workflows modeling genuine operational conditions in Bangladesh: merchant registration $\to$ API key issuance $\to$ customer hosted checkout $\to$ MFS SMS receipt by Android device $\to$ balance-chain verification $\to$ automated ledger settlement $\to$ merchant payout $\to$ nightly 3-way reconciliation.

---

## 2. Test Runner Architecture & Execution Contracts

### 2.1 File & Directory Layout (`tests/e2e/`)

```
tests/e2e/
├── config/
│   ├── vitest.config.e2e.ts        # Vitest configuration for E2E runner (timeouts, reporting, concurrency)
│   ├── global-setup.ts             # Global test database container/pool setup, env loading
│   ├── env.ts                      # Zod validation schema for E2E test environment variables
│   └── test-constants.ts           # Shared IDs, timeouts, and deterministic UUID seeds
├── fixtures/
│   ├── merchants.ts                # Test merchant accounts (Standard Merchant A, Multi-User Merchant B)
│   ├── api-keys.ts                 # Cryptographic test API keys (live and revoked)
│   ├── sms-messages.ts             # Verbatim SMS samples (bKash, Nagad, Rocket, Upay - valid & malformed)
│   ├── android-payloads.ts         # EC P-256 signed device events, valid and replay nonces
│   ├── gateway-responses.ts        # Mock IPN callbacks and validation responses (SSLCOMMERZ, etc.)
│   └── crypto-keys.ts              # Pre-generated ECDSA, RSA-2048, and AES-256 test key pairs
├── helpers/
│   ├── api-client.ts               # Type-safe HTTP client wrapping native fetch with idempotency injection
│   ├── db-verifier.ts              # Read-only verification helper querying test database state
│   ├── ledger-verifier.ts          # Double-entry balance assertor: sum(debit) == sum(credit)
│   ├── signature-helper.ts         # HMAC-SHA256 and ECDSA signature generators for testing verification
│   └── poller.ts                   # Deterministic exponential polling helper for async workers
├── tier1-features/                 # Tier 1 Feature Coverage (F01 to F33, 165 tests)
│   ├── f01-monorepo-tooling.e2e.test.ts
│   ├── f02-security-core.e2e.test.ts
│   ├── f03-observability-core.e2e.test.ts
│   ├── f04-db-schema-drizzle.e2e.test.ts
│   ├── f05-money-paisa.e2e.test.ts
│   ├── f06-payment-state-machine.e2e.test.ts
│   ├── f07-double-entry-ledger.e2e.test.ts
│   ├── f08-fraud-engine.e2e.test.ts
│   ├── f09-dual-control-review.e2e.test.ts
│   ├── f10-gateway-interface.e2e.test.ts
│   ├── f11-gateway-adapters.e2e.test.ts
│   ├── f12-sms-parser-engine.e2e.test.ts
│   ├── f13-balance-chain-trust.e2e.test.ts
│   ├── f14-webhook-infrastructure.e2e.test.ts
│   ├── f15-marketing-website.e2e.test.ts
│   ├── f16-documentation-portal.e2e.test.ts
│   ├── f17-hosted-checkout.e2e.test.ts
│   ├── f18-merchant-dashboard.e2e.test.ts
│   ├── f19-admin-portal.e2e.test.ts
│   ├── f20-payment-rest-api.e2e.test.ts
│   ├── f21-payment-links-qr.e2e.test.ts
│   ├── f22-digital-invoicing.e2e.test.ts
│   ├── f23-team-api-keys.e2e.test.ts
│   ├── f24-android-compose-app.e2e.test.ts
│   ├── f25-android-keystore-attest.e2e.test.ts
│   ├── f26-android-sms-signing.e2e.test.ts
│   ├── f27-android-offline-queue.e2e.test.ts
│   ├── f28-reconciliation-worker.e2e.test.ts
│   ├── f29-openapi-diagrams.e2e.test.ts
│   ├── f30-mandatory-docs.e2e.test.ts
│   ├── f31-vercel-cicd.e2e.test.ts
│   ├── f32-e2e-suite-harness.e2e.test.ts
│   └── f33-adversarial-hardening.e2e.test.ts
├── tier2-boundary/                 # Tier 2 Boundary & Corner Cases (F01 to F33, 165 tests)
│   ├── f01-f04-infra-boundary.e2e.test.ts
│   ├── f05-f09-financial-core-boundary.e2e.test.ts
│   ├── f10-f14-gateways-sms-boundary.e2e.test.ts
│   ├── f15-f23-web-api-boundary.e2e.test.ts
│   ├── f24-f27-android-boundary.e2e.test.ts
│   └── f28-f33-ops-docs-boundary.e2e.test.ts
├── tier3-pairwise/                 # Tier 3 Cross-Feature Combinatorial Suites (35 tests)
│   ├── pw01-api-gateway-ledger.e2e.test.ts
│   ├── pw02-sms-balance-fraud.e2e.test.ts
│   ├── pw03-android-signing-ingest.e2e.test.ts
│   ├── pw04-webhook-ssrf-dlq.e2e.test.ts
│   ├── pw05-checkout-fee-ledger.e2e.test.ts
│   ├── pw06-refund-reversal-payout.e2e.test.ts
│   └── pw07-rbac-tenancy-audit.e2e.test.ts
├── tier4-workloads/                # Tier 4 Real-World End-to-End Scenarios (15 tests)
│   ├── sc01-merchant-onboarding-checkout.e2e.test.ts
│   ├── sc02-retail-qr-android-collector.e2e.test.ts
│   ├── sc03-flash-sale-concurrency.e2e.test.ts
│   ├── sc04-dual-control-dispute.e2e.test.ts
│   ├── sc05-nightly-reconciliation.e2e.test.ts
│   ├── sc06-b2b-invoice-lifecycle.e2e.test.ts
│   ├── sc07-android-offline-sync.e2e.test.ts
│   ├── sc08-gateway-failover-recovery.e2e.test.ts
│   ├── sc09-api-key-emergency-rotation.e2e.test.ts
│   ├── sc10-chargeback-ledger-reversal.e2e.test.ts
│   ├── sc11-multi-sim-balance-chaining.e2e.test.ts
│   ├── sc12-webhook-outage-dlq-replay.e2e.test.ts
│   ├── sc13-payment-link-reuse-tamper.e2e.test.ts
│   ├── sc14-team-rbac-tenant-isolation.e2e.test.ts
│   └── sc15-regulatory-audit-export.e2e.test.ts
└── runner/
    ├── run-e2e.ts                  # Progressive test runner entrypoint with CLI flag parsing
    ├── milestone-filter.ts         # Milestone-to-feature dependency resolver
    └── summary-reporter.ts         # Formatted terminal & JSON test results aggregator
```

---

### 2.2 Test Framework Specification
- **Engine**: Vitest (`vitest >= 2.1.0`) running natively on Node 22 (ESM, strict mode).
- **Execution Mode**: Multi-threaded process pool with deterministic isolation. File-level isolation prevents state leakage between tests.
- **Assertions**: Vitest `expect` + custom domain matchers:
  - `expect(moneyA).toEqualPaisa(moneyB)`
  - `expect(ledgerTx).toBeBalanced()`
  - `expect(stateMachine).toRejectTransition(from, to)`
  - `expect(response).toBeValidOpenAPI(schemaRef)`
- **Configuration (`tests/e2e/config/vitest.config.e2e.ts`)**:
  ```typescript
  import { defineConfig } from 'vitest/config';
  import path from 'node:path';

  export default defineConfig({
    test: {
      name: 'DenaNeya-E2E',
      include: ['tests/e2e/**/*.e2e.test.ts'],
      testTimeout: 30000,
      hookTimeout: 30000,
      environment: 'node',
      globals: false,
      reporters: ['default', 'junit'],
      outputFile: {
        junit: './test-reports/e2e-results.xml',
      },
      sequence: {
        concurrent: false, // Ensures deterministic database assertions
      },
      setupFiles: [path.resolve(__dirname, './global-setup.ts')],
    },
  });
  ```

---

### 2.3 CLI Test Runner & Exit Code 0 Contract

The runner is invoked via standard `pnpm` script commands defined at the monorepo root:

```bash
# Run entire 380-test E2E suite (Tiers 1-4)
pnpm test:e2e

# Run only a specific test tier
pnpm test:e2e --tier=1
pnpm test:e2e --tier=2
pnpm test:e2e --tier=3
pnpm test:e2e --tier=4

# Progressive testing: Run only tests applicable up to a specific milestone
pnpm test:e2e --milestone=M1
pnpm test:e2e --milestone=M2
pnpm test:e2e --milestone=M3
pnpm test:e2e --milestone=M4
pnpm test:e2e --milestone=M5
pnpm test:e2e --milestone=M6
pnpm test:e2e --milestone=M7

# Target a specific feature from the inventory (e.g., F06: Payment State Machine)
pnpm test:e2e --feature=F06

# CI Output formats
pnpm test:e2e --reporter=tap
pnpm test:e2e --reporter=json
```

#### The Exit Code 0 Contract:
- **Success (Exit Code 0)**: The runner process exits with return code `0` if and only if **100% of executed test cases pass** with zero unhandled exceptions, zero invariant failures, and zero unhandled rejections.
- **Failure (Exit Code 1)**: Any single test failure, unhandled assertion failure, timeout, or ledger imbalance causes an immediate non-zero exit (`exit code 1`), producing a formatted failure summary showing the exact Feature ID, Test ID, expected vs. observed values, and error stack trace.

---

### 2.4 Progressive Testability Matrix

To enable continuous integration across milestones without blocking early milestone gates, the E2E test suite supports **progressive testability**. Tests test contracts and boundaries available at that milestone:

| Milestone | Newly Testable Features | Test Scope Available | Tier 1 Tests | Tier 2 Tests | Tier 3 Tests | Tier 4 Tests | Total Active Tests |
|---|---|---|---|---|---|---|---|
| **M1** | F01, F02, F03, F04 | Monorepo, Security, Obs, Schema/DB Constraints | 20 | 20 | 0 | 0 | **40** |
| **M2** | F05, F06, F07, F08, F09 | Paisa Math, State Machine, Ledger, Fraud, Review | 25 | 25 | 4 | 1 | **95** |
| **M3** | F10, F11, F12, F13, F14 | Gateway Adapters, SMS Parsers, Balance-Chain, Webhooks | 25 | 25 | 10 | 3 | **158** |
| **M4** | F15, F16, F17, F18, F19, F20, F21, F22, F23 | Next.js Web App, Dashboards, API v1, Links, Invoices | 45 | 45 | 12 | 6 | **266** |
| **M5** | F24, F25, F26, F27 | Android App, Keystore, SMS Ingest, Offline Queue | 20 | 20 | 5 | 3 | **314** |
| **M6** | F28, F29, F30, F31 | Reconciliation, OpenAPI, Technical Docs, CI/CD | 20 | 20 | 4 | 2 | **360** |
| **M7** | F32, F33 | Full Suite (Tiers 1-4) + Tier 5 Adversarial Hardening | 10 | 10 | 0 | 0 | **380** (+T5) |

*Contract Guarantee*: Running `pnpm test:e2e --milestone=M1` against the completed Milestone 1 codebase will execute exactly the 40 M1-scoped tests and exit with code 0. It will NOT attempt to fetch non-existent M4 HTTP endpoints or execute Android Gradle builds.

---

## 3. Tier 1: Comprehensive Feature Coverage Catalog

Tier 1 covers all 33 features from the Feature Inventory (`PROJECT.md`). Each feature is verified with at least 5 distinct opaque-box functional test cases. Total: **165 test cases**.

---

### Feature 01: Monorepo Setup & Tooling (Milestone: M1, Source: R1)
*Opaque-box boundary: Root package.json scripts, workspace topology, Turborepo pipeline, TypeScript compilation.*

- **E2E-T1-F01-01: Workspace Topology & Inter-Package Resolution**
  - *Action*: Run `pnpm list -r --json` across monorepo root.
  - *Expected*: Returns valid JSON describing `apps/web`, `apps/android` (or gradle bridge), and all 8 packages in `packages/*`. Workspace references use `workspace:*` protocols.
- **E2E-T1-F01-02: Zero-Error TypeScript Strict Compilation**
  - *Action*: Run `pnpm turbo run typecheck` across all packages and apps.
  - *Expected*: Turborepo executes task across all workspaces; all packages pass TypeScript strict check with zero errors; process exits with code 0.
- **E2E-T1-F01-03: Monorepo Clean Build Contract**
  - *Action*: Execute clean build pipeline via `pnpm turbo run build`.
  - *Expected*: All build artifacts are generated in their respective `dist/` or `.next/` directories without build warnings or failure codes.
- **E2E-T1-F01-04: Cross-Platform Windows & Unix Path Compliance**
  - *Action*: Verify all scripts in root `package.json` use cross-platform node utilities (`tsx`, `rimraf`) and POSIX forward slashes in config files.
  - *Expected*: No platform-specific shell builtins (`rm -rf`, `export`, Windows `dir`) exist in npm run scripts.
- **E2E-T1-F01-05: Turborepo Pipeline Dependency Cache Integrity**
  - *Action*: Execute `pnpm turbo run build` twice consecutively without code modifications.
  - *Expected*: Second execution completes in $< 3$ seconds with 100% `FULL TURBO` cache hits across all packages.

---

### Feature 02: Security Core (Milestone: M1, Source: R3)
*Opaque-box boundary: Public API exports of `packages/security` (`encryptEnvelope`, `decryptEnvelope`, `hashPassword`, `verifyPassword`, `isAllowedWebhookUrl`, `enforceRateLimit`).*

- **E2E-T1-F02-01: AES-256-GCM Envelope Encryption Roundtrip**
  - *Action*: Invoke `encryptEnvelope("sample_test_secret_payload_98124719284")` followed by `decryptEnvelope()` with the generated ciphertext.
  - *Expected*: Ciphertext contains unique 12-byte IV, 16-byte auth tag, encrypted data key, and ciphertext. Decrypted string strictly equals the original plaintext.
- **E2E-T1-F02-02: Argon2id Password Hashing & Verification**
  - *Action*: Hash a test merchant password using `hashPassword("SecureMerchantPass123!")` and verify using `verifyPassword()`.
  - *Expected*: Hash starts with `$argon2id$v=19$m=65536,t=3,p=4$`. Correct password returns `true`; incorrect password returns `false`.
- **E2E-T1-F02-03: Webhook SSRF Guard Private CIDR Rejection**
  - *Action*: Pass prohibited target URLs (`http://localhost:3000/webhook`, `http://127.0.0.1/callback`, `http://169.254.169.254/metadata`, `http://10.0.0.5/ipn`) to `isAllowedWebhookUrl()`.
  - *Expected*: Function returns `{ allowed: false, reason: "PROHIBITED_IP_RANGE" }` for every private/internal IP address.
- **E2E-T1-F02-04: Webhook SSRF Guard Public HTTPS Whitelist Approval**
  - *Action*: Pass valid public webhook destination (`https://api.merchantstore.com.bd/webhooks/denaneya`) to `isAllowedWebhookUrl()`.
  - *Expected*: Resolves DNS, checks against blocklist, and returns `{ allowed: true, resolvedIp: "<public_ip>" }`.
- **E2E-T1-F02-05: Progressive Multi-Dimensional Rate Limiting**
  - *Action*: Submit 10 consecutive requests within 1 minute from the same IP, followed by an 11th request to `enforceRateLimit('login', 'ip_192.168.1.1')`.
  - *Expected*: First 10 requests return `{ allowed: true }`. The 11th request returns `{ allowed: false, retryAfterSeconds: 60, status: 429 }`.

---

### Feature 03: Observability Core (Milestone: M1, Source: R5)
*Opaque-box boundary: Public exports of `packages/observability` (`logger.info`, `logger.error`, `createSpan`, `getHealthStatus`).*

- **E2E-T1-F03-01: Structured JSON Logger Output Compliance**
  - *Action*: Log a structured payment event: `logger.info("Payment settled", { paymentId: "pay_01", merchantId: "mer_01", amountPaisa: 50000n })`.
  - *Expected*: Stdout stream emits valid single-line JSON string containing mandatory fields: `timestamp`, `level: "INFO"`, `message: "Payment settled"`, `paymentId: "pay_01"`, `merchantId: "mer_01"`, `correlationId`.
- **E2E-T1-F03-02: Async Correlation ID Propagation Across Context**
  - *Action*: Wrap multiple nested operations inside `runWithCorrelationId("corr_abc123", async () => { ... })` and capture log output.
  - *Expected*: All logs emitted inside the async context contain `"correlationId": "corr_abc123"`.
- **E2E-T1-F03-03: Sensitive Parameter Masking in Logs**
  - *Action*: Log an object containing `password`, `apiKey`, `client_secret`, and `pin`: `{ password: "Secret123", pin: "1234" }`.
  - *Expected*: Logged JSON string masks values with `[REDACTED]`; original secret values are never printed.
- **E2E-T1-F03-04: OpenTelemetry Distributed Trace Span Creation**
  - *Action*: Execute a traced function using `tracer.startActiveSpan("payment.settle", span => { ... })`.
  - *Expected*: Span records standard OpenTelemetry attributes (`component: "denaneya"`, `status: "OK"`), sets trace ID, and closes without throwing.
- **E2E-T1-F03-05: System Health Check Probe Reporting**
  - *Action*: Call `getHealthStatus()` with mocked healthy database and queue dependencies.
  - *Expected*: Returns `{ status: "HEALTHY", components: { database: "UP", queue: "UP" }, timestamp: string }`.

---

### Feature 04: Database Schema & Drizzle ORM (Milestone: M1, Source: R1, R2)
*Opaque-box boundary: Drizzle ORM migrations, PostgreSQL schema, check constraints, foreign keys, unique indexes.*

- **E2E-T1-F04-01: Migration Generation & DDL Application**
  - *Action*: Execute Drizzle migration runner against test PostgreSQL database.
  - *Expected*: All tables (`merchants`, `users`, `payments`, `ledger_accounts`, `ledger_transactions`, `ledger_entries`, `mfs_sms_events`, `devices`, `outbox_events`) are created without errors.
- **E2E-T1-F04-02: Idempotency Key Database Unique Constraint**
  - *Action*: Insert two `payments` records with identical `merchant_id` and `idempotency_key`.
  - *Expected*: First insert succeeds; second insert throws unique constraint violation error on `uq_payments_merchant_idempotency`.
- **E2E-T1-F04-03: Provider Transaction ID Database Unique Constraint**
  - *Action*: Insert two `payments` records with identical `provider = 'BKASH'` and `provider_transaction_id = '9K38AL90'`.
  - *Expected*: First insert succeeds; second insert raises duplicate key violation on `uq_payments_provider_tx`.
- **E2E-T1-F04-04: SMS Deduplication Cryptographic Hash Constraint**
  - *Action*: Insert two rows into `mfs_sms_events` with identical `dedup_hash`.
  - *Expected*: Second insert fails with PostgreSQL unique constraint error on `uq_mfs_sms_dedup_hash`.
- **E2E-T1-F04-05: Currency & Minor Unit Database Check Constraints**
  - *Action*: Attempt to insert a payment with `currency = 'USD'` or `amount_paisa = -100`.
  - *Expected*: Insert fails with PostgreSQL check constraint violation (`chk_payment_currency_bdt` or `chk_payment_amount_positive`).

---

### Feature 05: Money Math (Paisa Minor Units) (Milestone: M2, Source: R2)
*Opaque-box boundary: Public API exports of `Paisa` class from `packages/payment-core`.*

- **E2E-T1-F05-01: Precise BDT String to Paisa BigInt Conversion**
  - *Action*: Invoke `Paisa.fromBDT("1250.75")`.
  - *Expected*: Returns `Paisa` instance with `toPaisa() === 125075n` and `toBDT() === "1250.75"`.
- **E2E-T1-F05-02: Lossless Integer Minor Unit Addition & Subtraction**
  - *Action*: Add `Paisa.fromBDT("100.50")` and `Paisa.fromBDT("50.25")`, then subtract `Paisa.fromBDT("25.00")`.
  - *Expected*: Result equals `Paisa.fromPaisa(12575n)` (`toBDT() === "125.75"`).
- **E2E-T1-F05-03: Strict Rejection of Floating-Point Inputs**
  - *Action*: Call `Paisa.fromPaisa(1250.75)` with a JavaScript float.
  - *Expected*: Throws `TypeError("Float or unsafe integer passed to Paisa constructor")`.
- **E2E-T1-F05-04: Integer-Safe MDR Fee Calculation with Half-Up Rounding**
  - *Action*: Compute 1.85% fee on 1,500.00 BDT (`150000n` paisa, 185 basis points).
  - *Expected*: Fee calculated as `(150000n * 185n + 5000n) / 10000n === 2775n` paisa (`27.75 BDT`).
- **E2E-T1-F05-05: Negative Subtraction Protection**
  - *Action*: Attempt to subtract `Paisa.fromBDT("200.00")` from `Paisa.fromBDT("100.00")`.
  - *Expected*: Throws `RangeError("Paisa subtraction result cannot be negative")`.

---

### Feature 06: Payment State Machine (Milestone: M2, Source: R2)
*Opaque-box boundary: `packages/payment-core` state transition validator `validatePaymentTransition(current, target)`.*

- **E2E-T1-F06-01: Happy Path State Lifecycle: CREATED to COMPLETED**
  - *Action*: Validate sequence `CREATED` $\to$ `PENDING` $\to$ `PROCESSING` $\to$ `COMPLETED`.
  - *Expected*: Every step returns `{ allowed: true }`.
- **E2E-T1-F06-02: Interactive Checkout Lifecycle: CREATED to REQUIRES_ACTION to PROCESSING**
  - *Action*: Validate sequence `CREATED` $\to$ `REQUIRES_ACTION` $\to$ `PROCESSING` $\to$ `COMPLETED`.
  - *Expected*: Every step returns `{ allowed: true }`.
- **E2E-T1-F06-03: Rejection of Backward Transition: COMPLETED to PENDING**
  - *Action*: Validate transition `COMPLETED` $\to$ `PENDING`.
  - *Expected*: Returns `{ allowed: false, error: "INVALID_TRANSITION" }`.
- **E2E-T1-F06-04: Fraud Interception Path: PENDING to UNDER_REVIEW to COMPLETED**
  - *Action*: Validate sequence `PENDING` $\to$ `UNDER_REVIEW` $\to$ `COMPLETED` (dual-control approval).
  - *Expected*: Transitions are permitted with dual-control authorization context.
- **E2E-T1-F06-05: Terminal Refund Lifecycle: COMPLETED to PARTIALLY_REFUNDED to REFUNDED**
  - *Action*: Validate `COMPLETED` $\to$ `PARTIALLY_REFUNDED` $\to$ `REFUNDED`.
  - *Expected*: Both transitions return `{ allowed: true }`.

---

### Feature 07: Double-Entry Transaction Ledger (Milestone: M2, Source: R2)
*Opaque-box boundary: Public interface of `packages/ledger` (`LedgerService.postTransaction`, `getAccountBalance`).*

- **E2E-T1-F07-01: Balanced Payment Capture Journal Posting**
  - *Action*: Post transaction with `DEBIT` 1110 (SSLCOMMERZ In-Transit: 100000n paisa), `CREDIT` 2110 (Merchant Balance: 98000n), `CREDIT` 4100 (Platform MDR: 500n), `CREDIT` 2310 (Gateway Fee: 1500n).
  - *Expected*: Sum of debits equals sum of credits (`100000n === 100000n`); transaction commits successfully; returns `{ transactionId, postedAt }`.
- **E2E-T1-F07-02: Database Trigger Rejection of Unbalanced Journal**
  - *Action*: Attempt to post a transaction with `DEBIT` 100000n and `CREDIT` 95000n (5000n discrepancy).
  - *Expected*: Database deferred trigger `trg_verify_ledger_balance` aborts transaction with error `'Ledger transaction is unbalanced'`.
- **E2E-T1-F07-03: Real-Time Account Balance Aggregation**
  - *Action*: Post two 50000n credit transactions to merchant account 2110, then call `getAccountBalance('2110_mer_01')`.
  - *Expected*: Returns exact balance of `100000n` paisa.
- **E2E-T1-F07-04: Balanced Full Refund Reversal Journal**
  - *Action*: Post refund transaction reversing merchant balance, gateway payable, and platform revenue against gateway clearing account.
  - *Expected*: Sum of all debit reversals strictly equals credit refund amount; commits successfully.
- **E2E-T1-F07-05: Immutable Append-Only Ledger Integrity**
  - *Action*: Attempt SQL `UPDATE` or `DELETE` on committed `ledger_entries` row.
  - *Expected*: Operation rejected by database rule or permission error; entries cannot be altered.

---

### Feature 08: Anti-Fraud Risk Engine (Milestone: M2, Source: R5)
*Opaque-box boundary: Public API of `packages/fraud-engine` (`evaluateRisk(context)`).*

- **E2E-T1-F08-01: Clean Transaction Evaluation (Score < 30 -> ALLOW)**
  - *Action*: Evaluate transaction with valid customer IP, verified SIM slot, known MSISDN, and matching amount.
  - *Expected*: Returns `{ score: 0, severity: "LOW", action: "ALLOW", triggeredRules: [] }`.
- **E2E-T1-F08-02: Duplicate TrxID Critical Rule Trigger (Score = 100 -> BLOCK)**
  - *Action*: Evaluate transaction with a `trxId` that has already been consumed in a prior payment.
  - *Expected*: Triggers `DUPLICATE_TRX_ID` rule (+100); returns `{ score: 100, severity: "CRITICAL", action: "BLOCK" }`.
- **E2E-T1-F08-03: Amount Mismatch High Risk Rule Trigger (Score = 80 -> UNDER_REVIEW)**
  - *Action*: Evaluate payment where invoice is for 1,000.00 BDT but received MFS SMS reports 500.00 BDT.
  - *Expected*: Triggers `AMOUNT_MISMATCH` (+80); returns `{ score: 80, severity: "HIGH", action: "UNDER_REVIEW" }`.
- **E2E-T1-F08-04: Suspicious Sender Mask Rule Trigger (Score = 100 -> BLOCK)**
  - *Action*: Evaluate SMS received from standard 11-digit mobile number `01712345678` claiming to be `bKash`.
  - *Expected*: Triggers `SUSPICIOUS_SENDER_MASK` (+100); returns `{ score: 100, severity: "CRITICAL", action: "BLOCK" }`.
- **E2E-T1-F08-05: Hourly IP Velocity Medium Risk Rule Trigger**
  - *Action*: Evaluate 6th payment attempt within 1 hour from identical IP address.
  - *Expected*: Triggers `VELOCITY_IP_HOURLY` (+40); score $\ge 40$; action is `"CHALLENGE"`.

---

### Feature 09: Dual-Control Review Workflow (Milestone: M2, Source: R5)
*Opaque-box boundary: Moderation queue service in `packages/fraud-engine` (`submitReviewRecommendation`, `finalizeReviewDecision`).*

- **E2E-T1-F09-01: Payment Enqueue to UNDER_REVIEW Moderation Queue**
  - *Action*: Score a payment at 75 (High Risk).
  - *Expected*: Payment moves to `UNDER_REVIEW` state; record inserted into `payment_reviews` table with `status: 'PENDING'`.
- **E2E-T1-F09-02: Maker Submission of Approval Recommendation**
  - *Action*: Operator A (`maker_id = 'usr_maker'`) submits `{ action: 'RECOMMEND_APPROVE', notes: 'Verified customer invoice' }`.
  - *Expected*: Review state transitions to `'RECOMMENDED'`; `maker_id` recorded.
- **E2E-T1-F09-03: Checker Final Approval & Transition to COMPLETED**
  - *Action*: Supervisor B (`checker_id = 'usr_checker'`) submits `{ action: 'APPROVE' }`.
  - *Expected*: Payment transitions from `UNDER_REVIEW` $\to$ `COMPLETED`; settlement ledger posting executes.
- **E2E-T1-F09-04: Dual-Control Separation of Duties Enforcement (Maker != Checker)**
  - *Action*: Operator A attempts to finalize their own review recommendation (`maker_id === checker_id`).
  - *Expected*: Rejected with error `DUAL_CONTROL_VIOLATION: "Maker and checker cannot be the same user"`.
- **E2E-T1-F09-05: Checker Final Rejection & Transition to FAILED**
  - *Action*: Supervisor B rejects review: `{ action: 'REJECT', reason: 'Unverified SMS' }`.
  - *Expected*: Payment transitions from `UNDER_REVIEW` $\to$ `FAILED`; hold released with zero funds settled.

---

### Feature 10: Unified Gateway Adapter Interface (Milestone: M3, Source: R4)
*Opaque-box boundary: TypeScript contract compliance across all implementations in `packages/gateway-adapters`.*

- **E2E-T1-F10-01: Polymorphic Adapter Interface Method Existence**
  - *Action*: Inspect adapter instances for SSLCOMMERZ, shurjoPay, aamarPay, bKash, and Nagad.
  - *Expected*: Every adapter implements `createPayment`, `verifyPayment`, `queryPayment`, `refund`, `queryRefund`, `normalizeWebhook`, `healthCheck`.
- **E2E-T1-F10-02: Normalized Webhook Output Schema Invariant**
  - *Action*: Pass provider-specific mock callbacks into `normalizeWebhook()`.
  - *Expected*: All return canonical `NormalizedWebhookEvent` with fields: `provider`, `providerTrxId`, `paymentId`, `amountPaisa`, `status`, `rawEvent`.
- **E2E-T1-F10-03: Health Check Contract Execution**
  - *Action*: Call `healthCheck()` on each registered adapter.
  - *Expected*: Returns `{ status: 'UP' | 'DEGRADED' | 'DOWN', latencyMs: number }` with `latencyMs >= 0`.
- **E2E-T1-F10-04: Standardized Error Normalization**
  - *Action*: Simulate provider HTTP 500 network error in adapter call.
  - *Expected*: Throws normalized `GatewayError` containing standard error code (`NETWORK_ERROR`, `AUTH_FAILED`, `DECLINED`).
- **E2E-T1-F10-05: Supported Currency & Method Metadata**
  - *Action*: Query `adapter.supportedMethods` and `adapter.providerId`.
  - *Expected*: Returns expected provider string and array containing payment method identifiers (e.g., `["BKASH", "VISA", "MASTERCARD"]`).

---

### Feature 11: Gateway Adapters (SSLCOMMERZ, etc.) (Milestone: M3, Source: R4)
*Opaque-box boundary: Gateway adapter implementations against their respective sandbox simulators.*

- **E2E-T1-F11-01: SSLCOMMERZ Sandbox Session Creation & IPN Validation**
  - *Action*: Call `SslCommerzAdapter.createPayment()`, simulate valid IPN callback with `val_id`, and verify via `verifyPayment()`.
  - *Expected*: Creation returns valid `GatewayPageURL`; IPN validator verifies payment and returns `status: 'COMPLETED'`.
- **E2E-T1-F11-02: shurjoPay Sandbox Token Grant & Order Verification**
  - *Action*: Authenticate with shurjoPay sandbox token API, initiate payment, and verify order via `/api/verification`.
  - *Expected*: Token successfully retrieved; verification validates `sp_code: 1000` and matching amount.
- **E2E-T1-F11-03: aamarPay Sandbox Payment Initiation & TrxCheck**
  - *Action*: Initiate payment via `AamarPayAdapter.createPayment()` and verify via `trxcheck.php`.
  - *Expected*: Returns valid `payment_url`; status verification returns `pay_status: 'Successful'`.
- **E2E-T1-F11-04: bKash Tokenized Checkout Create & Execute**
  - *Action*: Call `grantToken`, `createPayment`, and `executePayment` on bKash sandbox adapter.
  - *Expected*: Token grant returns Bearer token; execute returns `transactionStatus: 'Completed'` with generated `trxID`.
- **E2E-T1-F11-05: Nagad PGW RSA-2048 Encryption & Callback Verification**
  - *Action*: Initialize checkout with encrypted payload signed by RSA private key; verify callback with Nagad public key.
  - *Expected*: Nagad adapter verifies signature; returns verified payment ref ID and amount.

---

### Feature 12: Versioned SMS Parser Engine (Milestone: M3, Source: R4)
*Opaque-box boundary: Public export `parseMfsSms(sender, text)` in `packages/sms-parser`.*

- **E2E-T1-F12-01: bKash Cash In / Payment Received Regex Parsing**
  - *Action*: Pass `"You have received Tk 2,500.00 from 01712345678. Fee Tk 0.00. Balance Tk 15,200.00. TrxID 9K38AL90 at 13/09/2026 22:10"` with sender `"bKash"`.
  - *Expected*: Returns `{ provider: 'BKASH', trxId: '9K38AL90', amountPaisa: 250000n, feePaisa: 0n, newBalancePaisa: 1520000n, status: 'SUCCESS' }`.
- **E2E-T1-F12-02: Nagad Money Received Regex Parsing**
  - *Action*: Pass `"Money Received. Amount: Tk 1,200.00 Sender: 01812345678 TxnID: NAG12345 Fee: Tk 0.00 Balance: Tk 8,400.00 Date: 13/09/2026 21:00"` with sender `"16167"`.
  - *Expected*: Returns `{ provider: 'NAGAD', trxId: 'NAG12345', amountPaisa: 120000n, newBalancePaisa: 840000n, status: 'SUCCESS' }`.
- **E2E-T1-F12-03: Rocket Money Received Regex Parsing**
  - *Action*: Pass `"Tk 500.00 received from A/C: 019123456789. Fee Tk 0.00. Balance: Tk 3,500.00. TxnId: RCK987654. Date:13-SEP-2026 20:15:00"` with sender `"16216"`.
  - *Expected*: Returns `{ provider: 'ROCKET', trxId: 'RCK987654', amountPaisa: 50000n, status: 'SUCCESS' }`.
- **E2E-T1-F12-04: Upay Received Money Regex Parsing**
  - *Action*: Pass `"Received Tk 750.00 from 01612345678. TrxID: UPY112233. Fee: Tk 0.00. Balance Tk 2,250.00. Time: 13/09/2026 19:30"` with sender `"upay"`.
  - *Expected*: Returns `{ provider: 'UPAY', trxId: 'UPY112233', amountPaisa: 75000n, status: 'SUCCESS' }`.
- **E2E-T1-F12-05: Graceful Handling of Unrecognized SMS (PARSER_UNRECOGNIZED)**
  - *Action*: Pass unrecognized text: `"Your monthly statement is ready to download"` from sender `"bKash"`.
  - *Expected*: Returns `{ status: 'PARSER_UNRECOGNIZED', provider: 'BKASH', rawText: string }`; does not throw error.

---

### Feature 13: Balance-Chain & Trust Tiers (Milestone: M3, Source: R4)
*Opaque-box boundary: Balance-chain verifier and Trust Tier assigner in `packages/sms-parser` and `packages/fraud-engine`.*

- **E2E-T1-F13-01: Continuous Balance Equation Validation**
  - *Action*: Submit transaction where $\text{Balance}_{t-1} = 5,000.00$, $\text{Amount} = 1,500.00$, $\text{Fee} = 0.00$, and reported $\text{Balance}_t = 6,500.00$.
  - *Expected*: Verification succeeds with `{ balanced: true, deltaPaisa: 0n }`.
- **E2E-T1-F13-02: Balance-Chain Discontinuity Detection**
  - *Action*: Submit transaction where previous balance was 5,000.00 BDT, received amount is 500.00 BDT, but reported balance jumps to 7,000.00 BDT.
  - *Expected*: Discontinuity detected; returns `{ balanced: false, deltaPaisa: 150000n }`; flags `BALANCE_CHAIN_DISCONTINUITY`.
- **E2E-T1-F13-03: Trust Tier A Assignment for Direct API Verification**
  - *Action*: Ingest payment verified via official bKash Tokenized direct API.
  - *Expected*: Assigned `trustTier: 'A'`; base risk score = 0; instant settlement allowed.
- **E2E-T1-F13-04: Trust Tier C Assignment for Android Hardware Signed SMS**
  - *Action*: Ingest payment parsed from Android collector signed with valid ECDSA key.
  - *Expected*: Assigned `trustTier: 'C'`; base risk score = 15; balance-chain check executed.
- **E2E-T1-F13-05: Trust Tier D Demotion for Manual TrxID Entry**
  - *Action*: Submit payment via merchant dashboard manual TrxID form.
  - *Expected*: Assigned `trustTier: 'D'`; base risk score = 40; requires dual-control review before settlement.

---

### Feature 14: Webhook Infrastructure & Outbox (Milestone: M3, Source: R1, R3)
*Opaque-box boundary: Outbox queue table and webhook dispatcher service in `packages/webhooks`.*

- **E2E-T1-F14-01: Atomic Insertion into Outbox Event Table**
  - *Action*: Execute payment settlement transaction.
  - *Expected*: Record inserted into `outbox_events` with `status: 'PENDING'`, `event_type: 'payment.completed'`, and JSON payload.
- **E2E-T1-F14-02: HMAC-SHA256 Signature Header Generation**
  - *Action*: Dispatch webhook to test endpoint with known merchant webhook secret.
  - *Expected*: Request contains header `X-DenaNeya-Signature: t=...,v1=...`; signature matches `HMAC-SHA256("${t}.${body}", secret)`.
- **E2E-T1-F14-03: Exponential Backoff Scheduling on HTTP 500**
  - *Action*: Simulate webhook delivery failure (HTTP 500 response from merchant receiver).
  - *Expected*: Event marked for retry with `attempt_count: 1` and `next_retry_at` scheduled 30 seconds into the future.
- **E2E-T1-F14-04: Dead Letter Queue (DLQ) Transition After 5 Retries**
  - *Action*: Simulate 5 consecutive failed delivery attempts.
  - *Expected*: Outbox event status transitions to `'DEAD_LETTER'`; error log recorded in `webhook_delivery_logs`.
- **E2E-T1-F14-05: Webhook Event Payload Schema Compliance**
  - *Action*: Inspect dispatched payload for `payment.completed`.
  - *Expected*: Validates against canonical schema: `{ id: string, event: "payment.completed", timestamp: string, data: { paymentId, amountPaisa, currency, customer } }`.

---

### Feature 15: Public Marketing Website (Milestone: M4, Source: R1)
*Opaque-box boundary: Next.js public routes (`/`, `/features`, `/pricing`, `/developers`, `/security`, `/about`, `/contact`, `/sitemap.xml`, `/robots.txt`).*

- **E2E-T1-F15-01: Home Page 200 OK & Brand Tagline Rendering**
  - *Action*: HTTP `GET /` on web server.
  - *Expected*: Status 200 OK; HTML body includes `"DenaNeya"` and tagline `"দেনা-নেওয়া সহজ, হিসাব নিশ্চিত।"`.
- **E2E-T1-F15-02: Marketing Subpages Rendering & HTTP Status**
  - *Action*: HTTP `GET` `/features`, `/pricing`, `/developers`, `/security`, `/about`, `/contact`.
  - *Expected*: All endpoints return HTTP 200 OK with valid HTML containing appropriate page headings.
- **E2E-T1-F15-03: SEO OpenGraph & Twitter Card Meta Tags**
  - *Action*: Inspect `<head>` tags of `GET /`.
  - *Expected*: Contains `<meta property="og:title">`, `<meta property="og:description">`, `<meta name="twitter:card" content="summary_large_image">`.
- **E2E-T1-F15-04: Dynamic XML Sitemap Generation (`/sitemap.xml`)**
  - *Action*: HTTP `GET /sitemap.xml`.
  - *Expected*: Status 200 OK; `content-type: application/xml`; contains `<urlset>` listing all public marketing routes.
- **E2E-T1-F15-05: Robots.txt Rules & Disallow Headers (`/robots.txt`)**
  - *Action*: HTTP `GET /robots.txt`.
  - *Expected*: Contains `Allow: /` for public pages and `Disallow: /dashboard`, `Disallow: /admin`, `Disallow: /checkout`.

---

### Feature 16: Documentation Portal (Milestone: M4, Source: R1, R5)
*Opaque-box boundary: Next.js routes under `/docs/*`.*

- **E2E-T1-F16-01: Docs Home Navigation & Quickstart Guide**
  - *Action*: HTTP `GET /docs`.
  - *Expected*: Status 200 OK; page renders navigation sidebar, Quickstart guide, and authentication overview.
- **E2E-T1-F16-02: Interactive API Reference Page Rendering**
  - *Action*: HTTP `GET /docs/api`.
  - *Expected*: Status 200 OK; displays all REST endpoints (`/payments`, `/refunds`, `/webhooks`) with parameter descriptions.
- **E2E-T1-F16-03: Webhook HMAC Verification Code Snippets**
  - *Action*: HTTP `GET /docs/webhooks`.
  - *Expected*: Status 200 OK; displays verbatim signature verification code examples for Node.js, Python, and PHP.
- **E2E-T1-F16-04: Android Collector Integration Documentation**
  - *Action*: HTTP `GET /docs/android-collector`.
  - *Expected*: Status 200 OK; outlines QR pairing handshake, Keystore security model, and signed payload specifications.
- **E2E-T1-F16-05: Comprehensive Error Codes Catalog**
  - *Action*: HTTP `GET /docs/errors`.
  - *Expected*: Status 200 OK; lists standardized platform error codes (`INVALID_IDEMPOTENCY_KEY`, `BALANCE_CHAIN_DISCONTINUITY`, etc.).

---

### Feature 17: Hosted Checkout Flow (Milestone: M4, Source: R1)
*Opaque-box boundary: Next.js hosted checkout routes (`/checkout/[sessionId]`).*

- **E2E-T1-F17-01: Hosted Checkout UI Initialization with Active Session**
  - *Action*: Create payment session via API, then HTTP `GET /checkout/:sessionId`.
  - *Expected*: Status 200 OK; displays merchant business name, amount in BDT (`1,500.00 ৳`), and countdown expiry timer.
- **E2E-T1-F17-02: Payment Method Selector Display**
  - *Action*: Inspect payment options rendered on hosted checkout page.
  - *Expected*: Displays tabs/selectors for bKash, Nagad, Rocket, and Cards (Visa/Mastercard).
- **E2E-T1-F17-03: Dynamic Merchant Branding Theme Loading**
  - *Action*: Load checkout for a merchant configured with custom logo URL and primary color `#0066CC`.
  - *Expected*: Page DOM applies merchant logo in header and primary button styles.
- **E2E-T1-F17-04: Sandbox Payment Simulation Execution**
  - *Action*: Select bKash in sandbox checkout mode and click "Complete Sandbox Payment".
  - *Expected*: Simulates successful provider callback; redirects to merchant `success_url` with query params `payment_id` and `status=completed`.
- **E2E-T1-F17-05: Expired Session UI Handling**
  - *Action*: HTTP `GET /checkout/:sessionId` for an expired payment session (`expires_at < NOW()`).
  - *Expected*: Displays user-facing warning "This checkout session has expired" with disabled payment action buttons.

---

### Feature 18: Merchant Dashboard (Milestone: M4, Source: R1)
*Opaque-box boundary: Merchant portal routes under `/dashboard/*`.*

- **E2E-T1-F18-01: Merchant Authentication & Session Cookie Creation**
  - *Action*: POST valid credentials to login route `/api/auth/callback/credentials`.
  - *Expected*: HTTP 200 OK; returns secure, HttpOnly session cookie; user redirected to `/dashboard`.
- **E2E-T1-F18-02: Real-Time Payment Metrics Overview Widget**
  - *Action*: HTTP `GET /dashboard` with authenticated session.
  - *Expected*: Status 200 OK; displays cards for Gross Volume (BDT), Successful Payments count, and Active Collector Devices.
- **E2E-T1-F18-03: Paginated Payment Transactions Table**
  - *Action*: HTTP `GET /dashboard/payments?page=1&limit=10`.
  - *Expected*: Status 200 OK; returns HTML table containing recent payments with status badges, dates, and amounts.
- **E2E-T1-F18-04: Single Payment Detail & Ledger Audit View**
  - *Action*: HTTP `GET /dashboard/payments/:paymentId`.
  - *Expected*: Status 200 OK; displays timeline, customer info, provider TrxID, and associated double-entry ledger entries.
- **E2E-T1-F18-05: Refund Initiation Action from Dashboard UI**
  - *Action*: POST refund request from dashboard UI for captured payment.
  - *Expected*: Payment transitions to `PARTIALLY_REFUNDED` or `REFUNDED`; success banner displayed.

---

### Feature 19: Admin Portal (Milestone: M4, Source: R1)
*Opaque-box boundary: Admin portal routes under `/admin/*`.*

- **E2E-T1-F19-01: Admin Superuser Authentication & Role Enforcement**
  - *Action*: Login with user having `role: 'PLATFORM_ADMIN'`; navigate to `/admin`.
  - *Expected*: Status 200 OK; non-admin users receive HTTP 403 Forbidden.
- **E2E-T1-F19-02: System-Wide Platform Volume & Revenue Metric Dashboard**
  - *Action*: HTTP `GET /admin`.
  - *Expected*: Status 200 OK; displays aggregated Gross Volume across all merchants, active merchant count, and platform fee revenue.
- **E2E-T1-F19-03: Merchant Account Onboarding & Verification Approval**
  - *Action*: POST approval action to `/api/v1/admin/merchants/:id/approve`.
  - *Expected*: Merchant status transitions from `'PENDING_KYC'` to `'ACTIVE'`; audit log entry recorded.
- **E2E-T1-F19-04: Gateway Health Monitoring Real-Time Status Board**
  - *Action*: HTTP `GET /admin/gateways`.
  - *Expected*: Status 200 OK; displays live latency (ms) and status (`UP`/`DEGRADED`) for SSLCOMMERZ, bKash, Nagad.
- **E2E-T1-F19-05: Immutable Platform Audit Log Viewer**
  - *Action*: HTTP `GET /admin/audit-logs`.
  - *Expected*: Status 200 OK; displays chronological list of system actions with operator ID, IP, and cryptographic hash chain status.

---

### Feature 20: Payment REST API (v1) (Milestone: M4, Source: R1)
*Opaque-box boundary: Public REST endpoints under `/api/v1/*`.*

- **E2E-T1-F20-01: POST /api/v1/payments Payment Intent Creation**
  - *Action*: POST payload `{ amount: "500.00", currency: "BDT", customer: { name: "Rahim", email: "rahim@example.com" } }` with `Authorization: Bearer <api_key>` and `Idempotency-Key: <uuid>`.
  - *Expected*: HTTP 201 Created; returns `{ id: "pay_...", status: "CREATED", checkoutUrl: "https://...", amountPaisa: 50000 }`.
- **E2E-T1-F20-02: GET /api/v1/payments/:id Payment Retrieval**
  - *Action*: GET payment by ID created in F20-01.
  - *Expected*: HTTP 200 OK; response body matches payment state and minor unit amount.
- **E2E-T1-F20-03: POST /api/v1/payments/:id/cancel Payment Cancellation**
  - *Action*: POST cancellation on payment in `CREATED` state.
  - *Expected*: HTTP 200 OK; payment status updates to `CANCELLED`.
- **E2E-T1-F20-04: POST /api/v1/payments/:id/refund Refund Execution**
  - *Action*: POST refund `{ amount: "250.00", reason: "Customer return" }` on `COMPLETED` payment.
  - *Expected*: HTTP 200 OK; returns refund object; payment status updates to `PARTIALLY_REFUNDED`.
- **E2E-T1-F20-05: Idempotent Replay Contract on Repeated POST**
  - *Action*: Submit identical POST `/api/v1/payments` with the same `Idempotency-Key` header twice.
  - *Expected*: Second request returns identical HTTP 201 Created and identical payment ID without creating duplicate database records.

---

### Feature 21: Payment Links & Dynamic QR (Milestone: M4, Source: R1)
*Opaque-box boundary: REST endpoints `/api/v1/payment-links/*` and public link viewer.*

- **E2E-T1-F21-01: Create Shareable Single-Use Payment Link**
  - *Action*: POST `/api/v1/payment-links` with `{ title: "Consultation Fee", amount: "1000.00", singleUse: true }`.
  - *Expected*: HTTP 201 Created; returns `{ id: "plink_...", url: "https://pay.denaneya.com.bd/l/...", qrCodeData: string }`.
- **E2E-T1-F21-02: Dynamic Bangla QR / EMVCo Merchant QR Generation**
  - *Action*: Inspect `qrCodeData` returned in link creation.
  - *Expected*: Contains valid EMVCo / Bangla QR formatted payload specifying merchant PAN, BDT currency code `050`, and amount.
- **E2E-T1-F21-03: Link Access & Customer Redirection to Checkout**
  - *Action*: HTTP `GET /l/:linkSlug`.
  - *Expected*: Status 302 Redirect to hosted checkout session pre-filled with link amount and title.
- **E2E-T1-F21-04: Single-Use Link Deactivation After Payment**
  - *Action*: Complete payment on single-use link; attempt second payment on same link URL.
  - *Expected*: Link status updates to `'COMPLETED'`; second visit displays "This payment link has already been used".
- **E2E-T1-F21-05: Manual Deactivation / Revocation of Payment Link**
  - *Action*: DELETE `/api/v1/payment-links/:id`.
  - *Expected*: HTTP 200 OK; link status updates to `'INACTIVE'`; subsequent access attempts return 404/410.

---

### Feature 22: Digital Invoicing System (Milestone: M4, Source: R1)
*Opaque-box boundary: REST endpoints `/api/v1/invoices/*` and customer invoice view.*

- **E2E-T1-F22-01: Create Multi-Line Item Invoice with Paisa Math**
  - *Action*: POST `/api/v1/invoices` with 3 line items (quantities, unit amounts in BDT, tax rate).
  - *Expected*: HTTP 201 Created; subtotal, tax, and total paisa calculated accurately with zero floating-point error.
- **E2E-T1-F22-02: Dispatch Invoice Notification via Email / SMS**
  - *Action*: POST `/api/v1/invoices/:id/send`.
  - *Expected*: HTTP 200 OK; invoice status updates to `'SENT'`; outbox dispatch event created.
- **E2E-T1-F22-03: Public Invoice View & PDF Generation Endpoint**
  - *Action*: HTTP `GET /invoices/:id/view` and `GET /invoices/:id/pdf`.
  - *Expected*: Returns itemized invoice view; PDF endpoint returns `content-type: application/pdf`.
- **E2E-T1-F22-04: Invoice Settlement upon Payment Completion**
  - *Action*: Complete payment linked to invoice.
  - *Expected*: Invoice status automatically transitions from `'SENT'` $\to$ `'PAID'`; `paid_at` timestamp recorded.
- **E2E-T1-F22-05: Voiding Unpaid Invoice**
  - *Action*: POST `/api/v1/invoices/:id/void`.
  - *Expected*: HTTP 200 OK; invoice status updates to `'VOID'`; checkout disabled.

---

### Feature 23: Team & API Key Management (Milestone: M4, Source: R1, R3)
*Opaque-box boundary: Endpoints `/api/v1/team/*` and `/api/v1/api-keys/*`.*

- **E2E-T1-F23-01: Scoped API Key Generation (One-Time Display Secret)**
  - *Action*: POST `/api/v1/api-keys` with `{ name: "Backend Server", scopes: ["payments:read", "payments:write"] }`.
  - *Expected*: HTTP 201 Created; returns plaintext `secretKey` (e.g., `dn_live_sec_...`); database stores only secure one-way hash.
- **E2E-T1-F23-02: API Authentication with Valid Scoped Key**
  - *Action*: Call `/api/v1/payments` using generated key in `Authorization: Bearer <key>` header.
  - *Expected*: HTTP 200/201 OK; request authorized under key owner's merchant context.
- **E2E-T1-F23-03: Scope Enforcement & Rejection of Unauthorized Actions**
  - *Action*: Attempt POST `/api/v1/payments/:id/refund` using a key scoped only for `payments:read`.
  - *Expected*: HTTP 403 Forbidden with error `INSUFFICIENT_SCOPES`.
- **E2E-T1-F23-04: Zero-Downtime API Key Rotation**
  - *Action*: POST `/api/v1/api-keys/:id/rotate` with `gracePeriodHours: 24`.
  - *Expected*: Issues new key; marks old key as expiring in 24 hours; both keys authenticate successfully during window.
- **E2E-T1-F23-05: Emergency Key Revocation**
  - *Action*: DELETE `/api/v1/api-keys/:id`.
  - *Expected*: HTTP 200 OK; key status updates to `'REVOKED'`; immediate subsequent request with old key returns HTTP 401 Unauthorized.

---

### Feature 24: Android Native App (Jetpack Compose) (Milestone: M5, Source: R1, R4)
*Opaque-box boundary: Android build outputs, Gradle test tasks, Compose screen view models.*

- **E2E-T1-F24-01: Android Gradle Debug & Release Build Contract**
  - *Action*: Execute `.\gradlew.bat assembleDebug assembleRelease` in `apps/android/`.
  - *Expected*: Gradle completes with `BUILD SUCCESSFUL`; produces valid `app-debug.apk` and `app-release-unsigned.apk`.
- **E2E-T1-F24-02: Unit Test Suite Execution on JVM**
  - *Action*: Execute `.\gradlew.bat testDebugUnitTest` in `apps/android/`.
  - *Expected*: All unit tests (MVI ViewModels, Room DAOs, Repositories) pass with 0 failures; exit code 0.
- **E2E-T1-F24-03: Material 3 UI Theme & Dynamic Color Compliance**
  - *Action*: Verify Compose Theme definition enforces Material 3 typography and dark/light palettes.
  - *Expected*: Compose UI components compile without deprecated Material 2 dependencies.
- **E2E-T1-F24-04: Android Manifest Permissions Compliance**
  - *Action*: Inspect `AndroidManifest.xml`.
  - *Expected*: Declares `RECEIVE_SMS`, `READ_SMS`, `INTERNET`, `ACCESS_NETWORK_STATE`, `FOREGROUND_SERVICE`, `POST_NOTIFICATIONS`.
- **E2E-T1-F24-05: Collector Dashboard Screen State Binding**
  - *Action*: Instantiate `DashboardViewModel` with connected device state.
  - *Expected*: StateFlow emits `ConnectionStatus.CONNECTED`, battery level percentage, and active SIM slots.

---

### Feature 25: Android Keystore Attestation (Milestone: M5, Source: R3, R4)
*Opaque-box boundary: Keystore key generation logic and server-side pairing endpoint `/api/v1/devices/pair`.*

- **E2E-T1-F25-01: Hardware-Backed EC P-256 Keypair Generation**
  - *Action*: Call device keypair generator inside Android test harness.
  - *Expected*: Generates `EC` keypair on `secp256r1` curve inside `AndroidKeyStore`; public key exportable as X.509 Base64.
- **E2E-T1-F25-02: Merchant Dashboard QR Pairing Token Generation**
  - *Action*: POST `/api/v1/devices/pairing-token` from authenticated merchant dashboard.
  - *Expected*: HTTP 201 Created; returns short-lived (5 min) JWT containing `{ merchantId, nonce, exp }`.
- **E2E-T1-F25-03: Complete Device Pairing Handshake via Server API**
  - *Action*: POST `/api/v1/devices/pair` with pairing token, device metadata, and device public key.
  - *Expected*: HTTP 201 Created; device registered with `status: 'ACTIVE'`; public key stored in database.
- **E2E-T1-F25-04: Rejection of Expired Pairing Token**
  - *Action*: Attempt POST `/api/v1/devices/pair` with an expired pairing token.
  - *Expected*: HTTP 400 Bad Request with error `PAIRING_TOKEN_EXPIRED`.
- **E2E-T1-F25-05: Server-Side Public Key Attestation Verification**
  - *Action*: Verify registered public key can validate test ECDSA signature generated by matching private key.
  - *Expected*: Signature verification returns `true`.

---

### Feature 26: Android SMS Ingestion & Signing (Milestone: M5, Source: R3, R4)
*Opaque-box boundary: Device ingestion endpoint `POST /api/v1/devices/events`.*

- **E2E-T1-F26-01: Valid ECDSA Signed Payload Acceptance**
  - *Action*: Submit signed event payload containing valid sequence number, fresh nonce, current timestamp, SMS body, and Base64 ECDSA signature.
  - *Expected*: HTTP 200 OK; server verifies signature against registered public key; event persisted to `mfs_sms_events`.
- **E2E-T1-F26-02: Rejection of Forged / Tampered Payload Signature**
  - *Action*: Submit signed event payload with 1 character modified in `rawBody` after signature generation.
  - *Expected*: HTTP 401 Unauthorized with error `INVALID_DEVICE_SIGNATURE`.
- **E2E-T1-F26-03: Rejection of Clock Skew Exceeding Window (±300 Seconds)**
  - *Action*: Submit signed payload with timestamp set to $T_{\text{server}} - 301$ seconds.
  - *Expected*: HTTP 400 Bad Request with error `TIMESTAMP_OUT_OF_BOUNDS`.
- **E2E-T1-F26-04: Anti-Replay Nonce Duplication Rejection**
  - *Action*: Submit identical signed payload (same `nonce`) twice.
  - *Expected*: First submission returns HTTP 200; second submission returns HTTP 409 Conflict with error `NONCE_ALREADY_USED`.
- **E2E-T1-F26-05: Monotonic Sequence Number Enforcement**
  - *Action*: Submit payload with `sequenceNumber: 10`, followed by payload with `sequenceNumber: 9`.
  - *Expected*: Second submission rejected with error `OUT_OF_ORDER_SEQUENCE`.

---

### Feature 27: Android Offline Queue & WorkManager (Milestone: M5, Source: R4)
*Opaque-box boundary: Room DB queue entity, WorkManager sync worker, and heartbeat reporting.*

- **E2E-T1-F27-01: Local Event Persistence in Encrypted Room DB**
  - *Action*: Ingest SMS while simulating network offline.
  - *Expected*: Event stored in `QueuedSmsEvent` with `syncStatus = 'PENDING'`.
- **E2E-T1-F27-02: WorkManager Expedited Sync upon Network Reconnect**
  - *Action*: Simulate network restoration trigger.
  - *Expected*: `OneTimeWorkRequest` executes, transmits queued events in sequence order, and marks `syncStatus = 'SYNCED'`.
- **E2E-T1-F27-03: Exponential Backoff on Server Ingestion 503**
  - *Action*: Server returns HTTP 503 Service Unavailable during sync.
  - *Expected*: WorkManager applies exponential backoff schedule ($10\text{s}, 30\text{s}, 60\text{s}$); events remain safely in Room DB.
- **E2E-T1-F27-04: Periodic 15-Minute Heartbeat Worker Ingestion**
  - *Action*: Submit heartbeat event to `POST /api/v1/devices/heartbeat` with battery level 85%, charging state, and app version.
  - *Expected*: HTTP 200 OK; database updates `devices.last_heartbeat_at = NOW()` and `devices.battery_level = 85`.
- **E2E-T1-F27-05: Offline Alert Trigger for Inactive Device**
  - *Action*: Run scheduled monitoring job when device has missed heartbeats for $> 30$ minutes.
  - *Expected*: Device status transitions to `'OFFLINE'`; merchant alert notification dispatched.

---

### Feature 28: Three-Way Financial Reconciliation (Milestone: M6, Source: R5)
*Opaque-box boundary: Reconciliation job runner in `packages/ledger` and API `/api/v1/reports/reconciliation`.*

- **E2E-T1-F28-01: Perfect 3-Way Match Execution (DenaNeya == Gateway == Ledger)**
  - *Action*: Execute reconciliation job over 100 settled payments where provider settlement report and ledger balances agree.
  - *Expected*: Job completes with `status: 'MATCHED'`; 0 discrepancies reported; reconciliation statement generated.
- **E2E-T1-F28-02: Missing Gateway Transaction Discrepancy Detection**
  - *Action*: Inject payment marked `COMPLETED` in DenaNeya database that is missing from provider clearing report.
  - *Expected*: Discrepancy flagged: `UNRECONCILED_PROVIDER_TRANSACTION`; status set to `DISCREPANCY_DETECTED`.
- **E2E-T1-F28-03: Settlement Amount Discrepancy Flagging**
  - *Action*: Ingest provider report where settled amount is 10 BDT lower than DenaNeya captured amount.
  - *Expected*: Flags `AMOUNT_MISMATCH_DISCREPANCY`; ledger adjustment entry proposed.
- **E2E-T1-F28-04: Missing Ledger Posting Discrepancy Detection**
  - *Action*: Simulate payment in `COMPLETED` state without matching transaction in `ledger_transactions`.
  - *Expected*: Flags `MISSING_LEDGER_POSTING`; triggers administrative audit alert.
- **E2E-T1-F28-05: Downloadable Settlement Reconciliation CSV/JSON Report**
  - *Action*: GET `/api/v1/reports/reconciliation?date=2026-09-13`.
  - *Expected*: HTTP 200 OK; returns structured reconciliation breakdown including gross volume, fees withheld, net payout, and discrepancy table.

---

### Feature 29: OpenAPI 3.1 & Technical Diagrams (Milestone: M6, Source: R5)
*Opaque-box boundary: OpenAPI spec files (`docs/openapi.yaml`, `docs/openapi.json`) and Mermaid diagram specifications.*

- **E2E-T1-F29-01: OpenAPI 3.1 Specification Validation**
  - *Action*: Validate `docs/openapi.yaml` using `@readme/openapi-parser` or official OpenAPI 3.1 schema validator.
  - *Expected*: Validates successfully with 0 errors; all endpoints, request bodies, and responses strictly conform to 3.1.0 standard.
- **E2E-T1-F29-02: 100% Endpoint Coverage in OpenAPI Spec**
  - *Action*: Cross-check all API routes in `apps/web/src/app/api/v1/` against paths defined in `docs/openapi.yaml`.
  - *Expected*: Every implemented REST route is documented with description, tags, request body schema, and status codes (200/201/400/401/403/429/500).
- **E2E-T1-F29-03: Mermaid Payment Sequence Diagrams Syntax Validation**
  - *Action*: Parse and render Mermaid sequence diagrams in `docs/` (Hosted Checkout, MFS SMS Flow, Refund Flow).
  - *Expected*: Mermaid CLI (`mmdc`) validates diagrams with zero syntax errors.
- **E2E-T1-F29-04: Mermaid Entity-Relationship (ER) Diagram Schema Consistency**
  - *Action*: Compare entities in `docs/DATABASE.md` ER diagram against Drizzle schema definition.
  - *Expected*: All tables, relations, foreign keys, and primary keys match 1-to-1 with database schema.
- **E2E-T1-F29-05: JSON Schema Example Payload Validation**
  - *Action*: Validate example payloads in OpenAPI spec against their declared JSON schemas.
  - *Expected*: 100% of request and response examples validate without schema errors.

---

### Feature 30: 18+ Mandatory Documentation Files (Milestone: M6, Source: R5)
*Opaque-box boundary: Inspection of `docs/` directory files for substantive content.*

- **E2E-T1-F30-01: Existence & Non-Empty Check for All 18 Mandatory Docs**
  - *Action*: Verify presence of all 18 files: `README.md`, `ARCHITECTURE.md`, `DATABASE.md`, `SECURITY.md`, `THREAT-MODEL.md`, `API.md`, `WEBHOOKS.md`, `ANDROID-SMS-AUTOMATION.md`, `FRAUD-PREVENTION.md`, `GATEWAY-INTEGRATIONS.md`, `DEPLOYMENT.md`, `VERCEL.md`, `ENVIRONMENT.md`, `BACKUP-RECOVERY.md`, `INCIDENT-RESPONSE.md`, `TESTING.md`, `REGULATORY-NOTES.md`, `CHANGELOG.md`.
  - *Expected*: All 18 files exist in designated paths.
- **E2E-T1-F30-02: Minimum Substantive Word Count Validation**
  - *Action*: Calculate word count for each of the 18 documentation files.
  - *Expected*: Every documentation file contains at least 300 words of substantive technical content (no placeholder stubs or TODOs).
- **E2E-T1-F30-03: Bangladesh Bank Regulatory Safety Compliance in Docs**
  - *Action*: Inspect `docs/REGULATORY-NOTES.md` and `docs/ARCHITECTURE.md`.
  - *Expected*: Explicitly documents Software Orchestration mode (`REGULATED_FEATURES_ENABLED=false`), non-custodial pooling, and compliance with PSO/PSP regulations.
- **E2E-T1-F30-04: Environment Variables Completeness in docs/ENVIRONMENT.md**
  - *Action*: Compare environment variables referenced in codebase against `docs/ENVIRONMENT.md` and `.env.example`.
  - *Expected*: Every variable is cataloged with description, default value, and security sensitivity classification.
- **E2E-T1-F30-05: Threat Model STRIDE Methodology Compliance**
  - *Action*: Inspect `docs/THREAT-MODEL.md`.
  - *Expected*: Contains structured STRIDE analysis (Spoofing, Tampering, Repudiation, Info Disclosure, DoS, Elevation of Privilege) covering all external interfaces.

---

### Feature 31: Vercel Deployment & CI/CD Config (Milestone: M6, Source: R1, R5)
*Opaque-box boundary: `.vercel/`, `vercel.json`, and `.github/workflows/ci.yml`.*

- **E2E-T1-F31-01: Vercel Configuration Syntax & Region Specification**
  - *Action*: Inspect `vercel.json`.
  - *Expected*: Valid JSON; specifies Singapore region (`sin1`) for serverless function execution to ensure minimal latency to Bangladesh.
- **E2E-T1-F31-02: GitHub Actions CI Workflow Syntax Validation**
  - *Action*: Validate `.github/workflows/ci.yml` using actionlint or yaml parser.
  - *Expected*: Valid YAML syntax; workflow triggers on `pull_request` and `push: branches: [main]`.
- **E2E-T1-F31-03: CI Pipeline Step Completeness**
  - *Action*: Inspect jobs defined in `ci.yml`.
  - *Expected*: Pipeline includes distinct steps for: checkout, pnpm setup, dependency install, typecheck, lint, test, and security audit.
- **E2E-T1-F31-04: Secret Leak Scanner in CI Pipeline**
  - *Action*: Check CI workflow for secret scanning step (e.g., Gitleaks or Trufflehog).
  - *Expected*: Automated secret scanner is configured to fail the build if credentials or private keys are detected in git commits.
- **E2E-T1-F31-05: Next.js Edge Middleware Security Headers Configuration**
  - *Action*: Inspect HTTP response headers from web application routes.
  - *Expected*: Returns mandatory security headers: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy`.

---

### Feature 32: E2E Testing Suite (Tiers 1-4) (Milestone: E2E, Source: AC)
*Opaque-box boundary: Vitest runner execution and `TEST_INFRA.md` verification.*

- **E2E-T1-F32-01: E2E Test Runner CLI Invocation**
  - *Action*: Execute `pnpm test:e2e --tier=1`.
  - *Expected*: Vitest runs all Tier 1 tests, produces formatted terminal output, and exits with code 0.
- **E2E-T1-F32-02: Progressive Milestone Flag Filtering**
  - *Action*: Execute `pnpm test:e2e --milestone=M1`.
  - *Expected*: Runner executes exclusively tests mapped to M1 (F01–F04) and exits with code 0.
- **E2E-T1-F32-03: JUnit XML Report Generation Contract**
  - *Action*: Execute test runner with `--reporter=junit`.
  - *Expected*: Generates valid JUnit XML file at `./test-reports/e2e-results.xml` with `<testsuites>` and `<testcase>` nodes.
- **E2E-T1-F32-04: Zero-Tolerance Flakiness Assertions**
  - *Action*: Run full E2E test suite 3 times consecutively.
  - *Expected*: 100% pass rate on all 3 runs; zero intermittent or timing-dependent test failures.
- **E2E-T1-F32-05: Publishing of TEST_READY.md Marker**
  - *Action*: Verify generation and content of `TEST_READY.md` upon completion of E2E track.
  - *Expected*: `TEST_READY.md` exists at workspace root, listing test counts, execution instructions, and readiness verdict.

---

### Feature 33: Adversarial Coverage Hardening (Tier 5) (Milestone: M7, Source: AC)
*Opaque-box boundary: Concurrency test harness and white-box stress injection.*

- **E2E-T1-F33-01: High-Concurrency Idempotency Collision Test**
  - *Action*: Dispatch 100 simultaneous HTTP POST `/api/v1/payments` with identical `Idempotency-Key` and `merchant_id` using `Promise.all()`.
  - *Expected*: Exactly 1 payment is created; all 100 requests return identical HTTP 201 response and identical payment ID.
- **E2E-T1-F33-02: Concurrent Settlement Race on Identical Provider TrxID**
  - *Action*: Dispatch 20 simultaneous settlement attempts for the same payment with the same `provider_transaction_id`.
  - *Expected*: Exactly 1 settlement succeeds; 19 requests return idempotent success or are rejected; exactly 1 balanced ledger transaction is posted.
- **E2E-T1-F33-03: Simultaneous SMS Deduplication Stress**
  - *Action*: Submit identical SMS payload simultaneously across 20 concurrent threads.
  - *Expected*: Exactly 1 SMS event persisted; 19 rejected by `uq_mfs_sms_dedup_hash` unique constraint; exactly 1 payment settled.
- **E2E-T1-F33-04: Concurrent Partial Refund Race Protection**
  - *Action*: For a 1,000.00 BDT payment, issue two simultaneous partial refund requests of 600.00 BDT each.
  - *Expected*: Exactly 1 refund succeeds; second refund is rejected because $600 + 600 > 1000$ BDT; cumulative refund bounds preserved.
- **E2E-T1-F33-05: Distributed Retry Worker Race on Webhook Dispatch**
  - *Action*: Trigger two background retry workers simultaneously on the same pending outbox event.
  - *Expected*: Pessimistic row locking (`FOR UPDATE SKIP LOCKED`) ensures exactly one worker delivers webhook; no duplicate webhooks sent.

---

## 4. Tier 2: Boundary & Corner Cases Catalog

Tier 2 applies **Boundary Value Analysis (BVA)** and extreme condition testing across all 33 features. Total: **165 test cases**.

---

### Boundaries: F01–F04 (Monorepo, Security, Obs, Database)
- **E2E-T2-F01-01**: Empty Workspace Directory Handling — build system handles missing optional cache directories without throwing.
- **E2E-T2-F01-02**: Long File Path Handling — file operations with paths $> 260$ characters succeed on Windows NTFS with LongPaths enabled.
- **E2E-T2-F01-03**: Unicode File & Package Name Handling — workspace scripts handle Bengali UTF-8 paths (`দেনা-নেওয়া`) gracefully.
- **E2E-T2-F01-04**: Turborepo Cache Invalidation on Environment Change — changing `NEXT_PUBLIC_APP_URL` triggers full cache rebuild.
- **E2E-T2-F01-05**: Strict Node Version Boundary — running on Node $< 20.0.0$ triggers immediate package engine error.
- **E2E-T2-F02-01**: AES-256-GCM Zero-Length Plaintext — encrypting empty string `""` produces valid envelope and decrypts to `""`.
- **E2E-T2-F02-02**: AES-256-GCM Auth Tag Corruption — flipping 1 bit in 16-byte authentication tag causes decryption to throw `Error("Unsupported state or unable to authenticate data")`.
- **E2E-T2-F02-03**: Webhook SSRF IPv4-Mapped IPv6 Bypass — URLs like `http://[::ffff:127.0.0.1]/` or `http://[::ffff:169.254.169.254]/` are detected and blocked.
- **E2E-T2-F02-04**: Webhook SSRF DNS Rebinding Defense — domain that resolves to public IP on first lookup but private IP on second lookup is blocked at connection time.
- **E2E-T2-F02-05**: Rate Limit Edge: Exact Limit vs Limit+1 — exactly 10 requests allowed in 60s window; 11th request rejected with 429 at second 59.999; allowed at second 60.001.
- **E2E-T2-F03-01**: Massive Log Payload Truncation — logging a 10MB string object truncates payload safely to prevent memory exhaustion.
- **E2E-T2-F03-02**: Circular Reference Object Logging — structured logger serializes object with circular references (`a.b = a`) without infinite recursion.
- **E2E-T2-F03-03**: Log Injection Defense — logging string containing newline characters `\n{"level":"FATAL"}` does not break single-line JSON log parsing.
- **E2E-T2-F03-04**: OpenTelemetry Span Exception Recording — unhandled exception in active span marks span status as `ERROR` and records stack trace before propagating.
- **E2E-T2-F03-05**: Observability Health Check Timeout — database probe timing out after 2000ms correctly marks component as `DOWN` without hanging process.
- **E2E-T2-F04-01**: Zero Paisa Payment DB Constraint — inserting payment with `amount_paisa = 0` violates `chk_payment_amount_positive`.
- **E2E-T2-F04-02**: Maximum BigInt Paisa Payment — inserting payment with $2^{62}-1$ paisa succeeds without numeric overflow.
- **E2E-T2-F04-03**: Refund Exceeding Payment Bound — inserting `refunded_amount_paisa = amount_paisa + 1` violates `chk_payment_refund_bounds`.
- **E2E-T2-F04-04**: Non-Existent Foreign Key Referential Integrity — inserting payment with non-existent `merchant_id` raises foreign key error.
- **E2E-T2-F04-05**: SQL Injection in Dynamic Filter — querying payments with `merchant_id = "mer_01' OR '1'='1"` executes as parameterized literal, preventing injection.

---

### Boundaries: F05–F09 (Financial Core: Money, State Machine, Ledger, Fraud)
- **E2E-T2-F05-01**: Minimum Valid Paisa Unit (`1n` Paisa / `0.01` BDT) — addition and fee calculations on 1 paisa preserve integer precision.
- **E2E-T2-F05-02**: String Parsing with Irregular Whitespace — `Paisa.fromBDT("  150.50  ")` trims whitespace correctly.
- **E2E-T2-F05-03**: String Parsing with Excess Decimal Places — `Paisa.fromBDT("150.555")` throws error rejecting ambiguous precision.
- **E2E-T2-F05-04**: Subtraction to Exact Zero — subtracting 100 paisa from 100 paisa yields `0n` paisa (`toBDT() === "0.00"`).
- **E2E-T2-F05-05**: Fee Rounding Exact Halfway Boundary — `(paisa * bps + 5000n) / 10000n` rounds exactly half-up on `.50` fractional paisa.
- **E2E-T2-F06-01**: Self-Transition Rejection — validating `COMPLETED` $\to$ `COMPLETED` returns `{ allowed: false }`.
- **E2E-T2-F06-02**: Terminal State Immutability — validating transitions out of `FAILED`, `CANCELLED`, `EXPIRED`, `REFUNDED` always returns `{ allowed: false }`.
- **E2E-T2-F06-03**: Skip Direct to Terminal from CREATED — validating `CREATED` $\to$ `COMPLETED` directly (bypassing processing) returns `{ allowed: false }`.
- **E2E-T2-F06-04**: Optimistic Concurrency Stale Version Rejection — updating payment with `version: 1` when database has `version: 2` modifies 0 rows.
- **E2E-T2-F06-05**: Invalid Enum String State — passing non-existent state `"UNKNOWN"` to validator throws schema validation error.
- **E2E-T2-F07-01**: 1 Paisa Ledger Imbalance Rejection — debit 100,000n vs credit 99,999n raises deferred trigger exception.
- **E2E-T2-F07-02**: Multi-Leg Ledger Entry Balance — 1 debit matched against 5 split credit legs sums to zero.
- **E2E-T2-F07-03**: Negative Amount Entry Rejection — inserting ledger entry with `amount_paisa = -500` violates check constraint.
- **E2E-T2-F07-04**: Zero Amount Entry Rejection — inserting ledger entry with `amount_paisa = 0` violates check constraint.
- **E2E-T2-F07-05**: Non-Existent Chart of Accounts ID — posting entry to account `9999` not in COA violates foreign key constraint.
- **E2E-T2-F08-01**: Exact Risk Threshold Boundary (Score 29 vs 30) — score 29 yields `ALLOW`; score 30 yields `CHALLENGE`.
- **E2E-T2-F08-02**: Exact Risk Threshold Boundary (Score 59 vs 60) — score 59 yields `CHALLENGE`; score 60 yields `UNDER_REVIEW`.
- **E2E-T2-F08-03**: Exact Risk Threshold Boundary (Score 84 vs 85) — score 84 yields `UNDER_REVIEW`; score 85 yields `BLOCK`.
- **E2E-T2-F08-04**: Score Clamping at 100 Maximum — combining rules totaling +240 score clamps composite score strictly to 100.
- **E2E-T2-F08-05**: Missing Context Parameters Graceful Fallback — evaluating risk with undefined IP or user agent applies default neutral score without throwing.
- **E2E-T2-F09-01**: Self-Approval Rejection (Maker == Checker) — review finalize rejected when `checker_id === maker_id`.
- **E2E-T2-F09-02**: Finalize Without Prior Recommendation Rejection — checker cannot approve review before maker recommendation.
- **E2E-T2-F09-03**: Review Decision on Non-Review Payment — attempting review decision on payment in `COMPLETED` state fails.
- **E2E-T2-F09-04**: Review Expiration Timeout — payment in `UNDER_REVIEW` past 48h timeout automatically transitions to `EXPIRED`/`FAILED`.
- **E2E-T2-F09-05**: Empty Review Notes Rejection — submitting review recommendation with whitespace-only notes fails validation.

---

### Boundaries: F10–F14 (Gateways, Adapters, SMS, Webhooks)
- **E2E-T2-F10-01**: Gateway Timeout Handling — gateway adapter aborts request and returns `NETWORK_TIMEOUT` after 10000ms.
- **E2E-T2-F10-02**: Gateway HTTP 502 Bad Gateway Response — adapter handles HTML error page from gateway without crashing JSON parser.
- **E2E-T2-F10-03**: Empty Webhook Body Normalization — passing empty body `""` to `normalizeWebhook()` returns error rather than crashing.
- **E2E-T2-F10-04**: Malformed JSON Webhook Payload — passing invalid JSON returns `INVALID_WEBHOOK_PAYLOAD`.
- **E2E-T2-F10-05**: Unknown Provider Identifier — requesting adapter for `"UNKNOWN_PAY"` throws `ProviderNotSupportedError`.
- **E2E-T2-F11-01**: SSLCOMMERZ Currency Mismatch in IPN — IPN reporting `currency: "USD"` when payment expected `"BDT"` is rejected.
- **E2E-T2-F11-02**: SSLCOMMERZ Amount Tampering in IPN — IPN reporting 10.00 BDT for 1,000.00 BDT payment fails verification.
- **E2E-T2-F11-03**: bKash Token Expiration During Execute — expired `id_token` triggers automatic token refresh and retry.
- **E2E-T2-F11-04**: Nagad Invalid RSA Signature Callback — callback with invalid RSA signature fails verification and returns 401.
- **E2E-T2-F11-05**: shurjoPay Negative Order ID Query — passing malformed order ID returns clean error.
- **E2E-T2-F12-01**: SMS with Extra Spaces and Newlines — parser strips irregular whitespace and parses valid TrxID and amount.
- **E2E-T2-F12-02**: SMS Amount with Comma Separators (`Tk 1,00,000.00`) — parser parses South Asian comma numbering correctly.
- **E2E-T2-F12-03**: SMS with Lowercase TrxID — parser normalizes TrxID to uppercase for consistency.
- **E2E-T2-F12-04**: SMS with Alphanumeric Sender Spoofing — sender `bKash!` (with exclamation mark) rejected by whitelist regex.
- **E2E-T2-F12-05**: Empty / Null SMS String — passing empty string returns `PARSER_UNRECOGNIZED` without crashing.
- **E2E-T2-F13-01**: Exact Zero Balance Wallet Condition — balance reaching `0.00` BDT verifies correctly in balance chain.
- **E2E-T2-F13-02**: Fee-Bearing Balance Chain — SMS with non-zero fee (`Fee Tk 5.00`) verifies formula: $\text{Balance}_{t} = \text{Balance}_{t-1} + \text{Amount} - \text{Fee}$.
- **E2E-T2-F13-03**: Out-of-Order SMS Sequence — receiving SMS $N+1$ before SMS $N$ flags temporary discontinuity until $N$ arrives.
- **E2E-T2-F13-04**: Multi-SIM Slot Collision — simultaneous SMS on SIM 0 and SIM 1 isolate balance chains by SIM MSISDN.
- **E2E-T2-F13-05**: First Transaction on New SIM (Genesis Balance) — first transaction initializes wallet balance without discontinuity.
- **E2E-T2-F14-01**: Webhook Replay Timing: Exact 300s Timestamp — webhook timestamp at exactly 300s drift is accepted; 301s rejected.
- **E2E-T2-F14-02**: Webhook Secret with Special Characters — signing works with secrets containing symbols (`!@#$%^&*()_+`).
- **E2E-T2-F14-03**: Webhook Delivery Destination 301 Redirect — HTTP client does not follow redirect to a private IP (SSRF redirect defense).
- **E2E-T2-F14-04**: Webhook Client Slow Consumer Timeout — merchant server that hangs socket times out after 5000ms.
- **E2E-T2-F14-05**: Webhook DLQ Max Retry Cap — event fails after exactly 5 attempts and never attempts a 6th retry automatically.

---

### Boundaries: F15–F23 (Web App, API, Links, Invoices, Keys)
- **E2E-T2-F15-01**: Non-Existent Marketing Page 404 — visiting `/non-existent-page` returns custom 404 page with 404 status.
- **E2E-T2-F15-02**: Sitemap URL Escaping — sitemap XML escapes special characters (`&`, `<`, `>`) in URLs.
- **E2E-T2-F15-03**: Robots.txt Header — `/robots.txt` returns `content-type: text/plain`.
- **E2E-T2-F15-04**: Deep Marketing Anchor Links — navigates to `#pricing-table` without JS errors.
- **E2E-T2-F15-05**: Marketing Contact Form Payload Validation — submitting invalid email format returns 400 with field error.
- **E2E-T2-F16-01**: Docs Search Empty Query — submitting empty search query returns empty results without throwing.
- **E2E-T2-F16-02**: Docs Code Block Copy Button — code snippets contain valid copy-to-clipboard DOM attributes.
- **E2E-T2-F16-03**: Docs Deep Navigation Slug 404 — accessing `/docs/api/invalid-slug` returns clean 404 inside docs layout.
- **E2E-T2-F16-04**: Docs Mobile Viewport View — responsive CSS retains navigation drawer on $< 640\text{px}$ viewports.
- **E2E-T2-F16-05**: Docs Embedded OpenAPI Spec Sync — docs API examples stay in sync with `docs/openapi.yaml`.
- **E2E-T2-F17-01**: Checkout Expiration at Second Boundary — payment submitted at `expires_at - 1s` accepted; at `expires_at + 1s` rejected.
- **E2E-T2-F17-02**: Checkout XSS Injection in Customer Name — `<script>alert(1)</script>` in customer name renders safely escaped in DOM.
- **E2E-T2-F17-03**: Checkout Zero Amount Rejection — opening checkout session with 0 amount displays invalid session error.
- **E2E-T2-F17-04**: Rapid Multi-Click on Pay Button — disabling button upon first click prevents multiple intent dispatches.
- **E2E-T2-F17-05**: Checkout Cancellation Redirect — clicking "Cancel" returns customer to merchant `cancel_url` with `status=cancelled`.
- **E2E-T2-F18-01**: Dashboard Pagination Page 0 or Negative — passing `?page=0` or `?page=-1` sanitizes to `page=1`.
- **E2E-T2-F18-02**: Dashboard Date Range Filter with End Before Start — `from=2026-09-13&to=2026-09-01` returns validation error.
- **E2E-T2-F18-03**: Dashboard Search with Special Regex Characters — searching `?search=*+?[]` executes safely without regex crash.
- **E2E-T2-F18-04**: Cross-Tenant Dashboard Data Isolation — Merchant A cannot view payments of Merchant B by changing URL `:paymentId`.
- **E2E-T2-F18-05**: Session Expiration During Dashboard Activity — expired JWT redirects gracefully to login with return URL.
- **E2E-T2-F19-01**: Non-Admin Access to Admin Portal — merchant user attempting to access `/admin` receives 403 Forbidden.
- **E2E-T2-F19-02**: Admin KYC Approval on Already Approved Merchant — idempotent handling; returns existing status without error.
- **E2E-T2-F19-03**: Admin Audit Log Immutability — audit log viewer pagination works across $> 100,000$ entries efficiently.
- **E2E-T2-F19-04**: Admin Gateway Health Degraded State Display — simulates 50% gateway packet loss; badge displays yellow `DEGRADED`.
- **E2E-T2-F19-05**: Admin Feature Flag Toggle — toggling platform feature flag updates platform behavior within 5 seconds.
- **E2E-T2-F20-01**: REST API Missing Authorization Header — requests without Bearer token return 401 Unauthorized.
- **E2E-T2-F20-02**: REST API Malformed Bearer Token — `Authorization: Bearer invalid-token` returns 401.
- **E2E-T2-F20-03**: REST API Unsupported HTTP Method — `PUT /api/v1/payments` returns 405 Method Not Allowed with `Allow: POST, GET`.
- **E2E-T2-F20-04**: REST API Payload Exceeding 1MB — oversized JSON body returns 413 Payload Too Large.
- **E2E-T2-F20-05**: REST API Idempotency Key Exceeding 255 Chars — oversized key header returns 400 Bad Request.
- **E2E-T2-F21-01**: Payment Link Expiration TTL Passed — visiting expired link returns 410 Gone.
- **E2E-T2-F21-02**: Payment Link Custom Amount Bounds — link with min/max amount rejects customer entry outside bounds.
- **E2E-T2-F21-03**: Payment Link Dynamic QR Image Scaling — QR SVG renders cleanly across arbitrary display densities.
- **E2E-T2-F21-04**: Deactivated Link Reactive Deletion — deactivating link immediately blocks active customer sessions.
- **E2E-T2-F21-05**: Payment Link Reusable Counter — multi-use link tracks `usage_count` accurately under concurrent checkouts.
- **E2E-T2-F22-01**: Invoice with 100 Line Items — system calculates subtotal and tax across 100 items without timeout.
- **E2E-T2-F22-02**: Invoice with 100% Discount — invoice total becomes 0 paisa; marked paid without gateway redirect.
- **E2E-T2-F22-03**: Voiding Already Paid Invoice — attempting to void `PAID` invoice returns 400 Bad Request.
- **E2E-T2-F22-04**: Invoice Due Date in the Past — creating invoice with past due date marks it immediately as `OVERDUE`.
- **E2E-T2-F22-05**: Invoice PDF Unicode Characters — Bengali product names render correctly in generated PDF.
- **E2E-T2-F23-01**: API Key Name with Max Length (100 Chars) — name truncation/validation enforced.
- **E2E-T2-F23-02**: Revoking Already Revoked API Key — idempotent response; returns existing revoked status.
- **E2E-T2-F23-03**: API Key Grace Period Expiration — rotated key automatically stops authenticating at hour 24:00:01.
- **E2E-T2-F23-04**: Team Member Invite with Duplicate Email — inviting existing team member returns 409 Conflict.
- **E2E-T2-F23-05**: Removing Last Owner from Team — attempting to delete sole team owner rejected with `CANNOT_REMOVE_SOLE_OWNER`.

---

### Boundaries: F24–F27 (Android Native App)
- **E2E-T2-F24-01**: Android App Low Memory Condition — ViewModel retains state during configuration change (device rotation).
- **E2E-T2-F24-02**: Dual SIM Device Handling — app correctly enumerates `simSlot = 0` and `simSlot = 1` with their respective carrier names.
- **E2E-T2-F24-03**: App Launched Without SMS Permissions — UI gracefully prompts user to grant required runtime permissions.
- **E2E-T2-F24-04**: Android 14 Notification Trampoline Restrictions — background broadcast handles SMS without prohibited activity launches.
- **E2E-T2-F24-05**: ProGuard / R8 Obfuscation Build Contract — release build with minification preserves Room entities and crypto models.
- **E2E-T2-F25-01**: Android Keystore Key Invalidation on Lock Screen Change — key configured with appropriate authentication parameters.
- **E2E-T2-F25-02**: Corrupted Pairing QR Code Scanned — scanning arbitrary non-JWT QR displays "Invalid DenaNeya QR code".
- **E2E-T2-F25-03**: Tampered Signature in Pairing Request — modifying public key bytes invalidates attestation signature.
- **E2E-T2-F25-04**: Re-Pairing Existing Device — scanning new pairing token on already paired device updates device credentials cleanly.
- **E2E-T2-F25-05**: Zero Length Nonce in Pairing Token — rejected by server token validator.
- **E2E-T2-F26-01**: Ingestion Payload Clock Drift Exact Boundary — timestamp at $+300$ seconds accepted; $+301$ seconds rejected.
- **E2E-T2-F26-02**: Sequence Number Overflow Wrap Around — sequence reaching $2^{31}-1$ handles cleanly or resets with device re-registration.
- **E2E-T2-F26-03**: Empty Message Text Payload — SMS with empty body handled without null pointer exception.
- **E2E-T2-F26-04**: 1000-Character Long SMS Payload — long multipart SMS text ingested and signed without buffer truncation.
- **E2E-T2-F26-05**: Nonce Collision with Different Device ID — nonces are partitioned per device ID (`device:nonces:{deviceId}`).
- **E2E-T2-F27-01**: Offline Queue 1,000 Events Backlog — Room DB stores 1,000 offline events and syncs in batches of 50.
- **E2E-T2-F27-02**: Device Battery $< 15\%$ Low Power Mode — WorkManager respects battery constraints without dropping incoming SMS.
- **E2E-T2-F27-03**: Heartbeat Worker During Airplane Mode — fails gracefully and reschedules when connectivity returns.
- **E2E-T2-F27-04**: Corrupted SQLite DB Recovery — encrypted Room DB detects corruption and initiates safe recovery.
- **E2E-T2-F27-05**: Multiple Network Switches During Sync — switching from WiFi to Cellular mid-sync handles cleanly with retry.

---

### Boundaries: F28–F33 (Operations, Docs, CI/CD, Hardening)
- **E2E-T2-F28-01**: Reconciliation with Zero Transactions on Date — returns empty match report with 0 volume and 0 errors.
- **E2E-T2-F28-02**: Reconciliation with Gateway Negative Settlement Adjustment — handles gateway fee clawbacks correctly.
- **E2E-T2-F28-03**: Reconciliation CSV with Windows CRLF Line Endings — parser parses both LF and CRLF files identically.
- **E2E-T2-F28-04**: Reconciliation Currency Precision Mismatch — reports discrepancy if provider rounds paisa differently.
- **E2E-T2-F28-05**: Reconciliation Report Large Volume ($100,000$ Rows) — streams results using async generators to avoid memory spikes.
- **E2E-T2-F29-01**: OpenAPI Nullable Field Schema Validation — validates fields explicitly declared as `nullable: true`.
- **E2E-T2-F29-02**: OpenAPI Recursive Schema Check — verifies no circular references in JSON schema models.
- **E2E-T2-F29-03**: Mermaid Diagram Node ID with Hyphens — diagram parsers handle alphanumeric IDs correctly.
- **E2E-T2-F29-04**: OpenAPI Spec Serialization: YAML vs JSON Parity — `openapi.yaml` and `openapi.json` contain identical semantic trees.
- **E2E-T2-F29-05**: OpenAPI Server URL Protocol Enforcement — verifies server URLs strictly use `https://`.
- **E2E-T2-F30-01**: Markdown Heading Level Hierarchy — verifies headings in docs follow strict `h1 -> h2 -> h3` nesting without skipping levels.
- **E2E-T2-F30-02**: Internal Markdown Link Validation — verifies all relative links (`[Architecture](./ARCHITECTURE.md)`) point to existing files.
- **E2E-T2-F30-03**: Code Block Language Tagging — verifies every markdown code fence specifies a valid language identifier (`typescript`, `bash`, `json`, `sql`).
- **E2E-T2-F30-04**: Changelog SemVer Format Compliance — verifies `CHANGELOG.md` follows Keep a Changelog and Semantic Versioning 2.0.0.
- **E2E-T2-F30-05**: No Real Production Credentials in Documentation — scans all documentation files to guarantee no real credentials exist.
- **E2E-T2-F31-01**: Vercel Route Match Regex Boundaries — verifies Edge rewrite rules handle query parameters correctly.
- **E2E-T2-F31-02**: CI Workflow Matrix OS Compatibility — verifies scripts execute cleanly on both Linux runner and Windows host.
- **E2E-T2-F31-03**: Git Ignore Exclusion of Sensitive Files — verifies `.gitignore` excludes `.env`, `*.pem`, `*.keystore`, `.pnpm-store`.
- **E2E-T2-F31-04**: Package.json License and Repository Fields — verifies metadata is properly configured.
- **E2E-T2-F31-05**: Node Version Mismatch Detection in CI — CI fails if Node version is not `22.x`.
- **E2E-T2-F32-01**: Test Runner on Zero Matching Tests Filter — running with non-existent feature `--feature=F99` exits with code 1 and helpful error.
- **E2E-T2-F32-02**: Test Runner Timeout on Stalled Async Test — individual test hanging past 30,000ms fails with timeout error.
- **E2E-T2-F32-03**: Concurrent Runner Database Isolation — parallel tests use distinct merchant IDs to avoid test pollution.
- **E2E-T2-F32-04**: Runner Exit Code on 1 Failure in 380 Tests — runner strictly exits with code 1 if even a single assertion fails.
- **E2E-T2-F32-05**: Memory Leak Absence Across Full Suite Run — memory footprint remains stable across all 380 tests.
- **E2E-T2-F33-01**: 200 Simultaneous Requests on Payment Creation — DB connection pool handles 200 concurrent requests without exhaustion.
- **E2E-T2-F33-02**: Deadlock Absence on Concurrent Cross-Account Ledger Postings — concurrent transfers between accounts 2110 and 1110 do not deadlock.
- **E2E-T2-F33-03**: Rapid Fire Refund and Settle Race — issuing settlement and refund simultaneously resolves in valid sequence.
- **E2E-T2-F33-04**: Database Failover Mid-Transaction Simulation — uncommitted transaction rolls back cleanly leaving zero orphaned entries.
- **E2E-T2-F33-05**: Clock Jump / NTP Synchronization Resiliency — server clock moving backward by 5 seconds does not cause negative elapsed times.

---

## 5. Tier 3: Cross-Feature Combinations Catalog (Pairwise Interactions)

Tier 3 exercises the interactions between orthogonal platform features. Total: **35 test cases**.

- **E2E-T3-PW-01: API Idempotency Replay × Gateway Timeout × Ledger Atomicity**  
  - *Interaction*: Merchant submits payment via API; gateway call times out; merchant retries with identical idempotency key; gateway succeeds on retry.  
  - *Assertion*: Exactly 1 payment created; exactly 1 balanced ledger transaction posted; response matches on both requests.
- **E2E-T3-PW-02: SMS Parser Discontinuity × Balance Chain × Fraud Engine Under-Review × Dual-Control**  
  - *Interaction*: Android device intercepts bKash SMS with balance jump; balance-chain verifier flags discontinuity; fraud engine scores 80 (`UNDER_REVIEW`); maker recommends approval; checker approves.  
  - *Assertion*: Payment transitions `PENDING` $\to$ `UNDER_REVIEW` $\to$ `COMPLETED`; audit log captures both operators.
- **E2E-T3-PW-03: Android Device Keystore × Clock Drift Expiry × Replay Nonce Rejection**  
  - *Interaction*: Android device signs event with valid key but timestamp is 310s old; device resubmits with updated timestamp but reuses old nonce.  
  - *Assertion*: First rejected for `TIMESTAMP_OUT_OF_BOUNDS`; second rejected for `NONCE_ALREADY_USED`.
- **E2E-T3-PW-04: Webhook Outbox × SSRF Private IP Guard × DLQ Failure Logging**  
  - *Interaction*: Merchant registers webhook pointing to `http://169.254.169.254/latest/meta-data`; payment completes; outbox worker evaluates SSRF guard.  
  - *Assertion*: SSRF guard blocks dispatch; event transitions to `FAILED`/`DEAD_LETTER` with `PROHIBITED_IP_RANGE`; zero network packets reach private IP.
- **E2E-T3-PW-05: Hosted Checkout × Paisa Rounding Fee Math × Double-Entry Split Posting**  
  - *Interaction*: Customer pays 333.33 BDT via checkout; platform MDR is 1.85% (6.17 BDT) + gateway fee 1.50% (5.00 BDT).  
  - *Assertion*: Paisa integer rounding applies half-up; ledger entries sum: $33333 = 32216 \text{ (merchant)} + 617 \text{ (platform)} + 500 \text{ (gateway)}$; balance invariant holds to exact paisa.
- **E2E-T3-PW-06: Partial Refund Sequence × Cumulative Refund Bound × Ledger Reversal**  
  - *Interaction*: Payment of 1,000.00 BDT receives 3 consecutive partial refunds: 300.00 BDT, 400.00 BDT, 300.00 BDT.  
  - *Assertion*: Payment transitions `COMPLETED` $\to$ `PARTIALLY_REFUNDED` $\to$ `PARTIALLY_REFUNDED` $\to$ `REFUNDED`; 4th refund of 1 paisa rejected; ledger balances at each stage.
- **E2E-T3-PW-07: Rate Limiting Burst × Multi-Tenant RBAC × Cryptographic Audit Log**  
  - *Interaction*: Attacker fires 50 brute force login attempts against Merchant A; Merchant B concurrently accesses their dashboard.  
  - *Assertion*: Attacker IP throttled with 429; Merchant B unaffected; audit log records security alert with intact hash chain.
- **E2E-T3-PW-08: Payment Link Dynamic QR × Hosted Checkout Expiry × Re-activation Block**  
  - *Interaction*: Single-use payment link generates Bangla QR; customer opens checkout; leaves page until session expires; customer reloads QR.  
  - *Assertion*: Session transitions to `EXPIRED`; reload prompts session expiration; cannot complete payment.
- **E2E-T3-PW-09: Digital Invoice Multi-Line Item × bKash Direct Checkout × Invoice Status Auto-Update**  
  - *Interaction*: Merchant creates invoice with 3 items; customer pays via bKash direct tokenized checkout.  
  - *Assertion*: Webhook from bKash triggers settlement; invoice updates to `PAID`; payment receipt generated.
- **E2E-T3-PW-10: Android Offline Queue Backlog × WorkManager Reconnect × Balance-Chain Reordering**  
  - *Interaction*: Phone collects 5 SMS messages offline; reconnects to WiFi; transmits batch out of order.  
  - *Assertion*: Server sorts batch by `sequenceNumber ASC`; balance chain verifies sequentially without spurious discontinuity flags.
- **E2E-T3-PW-11: Scoped API Key Rotation × In-Flight Payments × Revocation**  
  - *Interaction*: Merchant rotates API key; Key 1 and Key 2 used concurrently during grace period; Key 1 revoked.  
  - *Assertion*: Both keys succeed during grace period; Key 1 fails immediately upon revocation; Key 2 continues working.
- **E2E-T3-PW-12: Three-Way Reconciliation × Missing Gateway IPN × Auto-Healing Settlement**  
  - *Interaction*: Payment gets stuck in `PENDING` due to dropped IPN; nightly reconciliation discovers transaction in provider report.  
  - *Assertion*: Reconciliation job reconciles payment, transitions state to `COMPLETED`, and posts missing ledger entries.
- **E2E-T3-PW-13: Nagad PGW RSA Payload × Fraud Engine High-Value Anomaly × Dual-Control Queue**  
  - *Interaction*: Payment of 500,000.00 BDT ($10\times$ merchant average) initiated via Nagad PGW; callback verified via RSA.  
  - *Assertion*: High-value anomaly rule adds +40 score; moves to `UNDER_REVIEW`; requires maker-checker approval before settlement.
- **E2E-T3-PW-14: ShurjoPay Gateway Failure × Automatic Adapter Fallback × Hosted Checkout Redirection**  
  - *Interaction*: Primary gateway returns HTTP 500 during checkout initiation; fallback gateway configured for merchant.  
  - *Assertion*: System routes request to secondary gateway; customer redirected successfully without checkout failure.
- **E2E-T3-PW-15: Multi-SIM Android Ingestion × SIM Slot Partitioning × Ledger Wallet Assignment**  
  - *Interaction*: Android device receives bKash on SIM 0 and Nagad on SIM 1 within 5 seconds.  
  - *Assertion*: Correct MFS parser applied to each SIM slot; ledger credits appropriate wallet accounts (1210 and 1220).
- **E2E-T3-PW-16: Webhook HMAC Signature × Merchant Secret Rotation × Webhook Retry**  
  - *Interaction*: Merchant updates webhook secret while an outbox event is in retry queue.  
  - *Assertion*: Next retry uses updated secret for `X-DenaNeya-Signature`; merchant verifies successfully.
- **E2E-T3-PW-17: Team RBAC Permission Hierarchy × Admin Portal KYC × Payment Creation**  
  - *Action*: Merchant team member with `role: 'DEVELOPER'` attempts to initiate refund; `ADMIN` approves merchant KYC.  
  - *Assertion*: Developer refund rejected (403); KYC approval enables live API key generation.
- **E2E-T3-PW-18: Invoice Voiding × Active Hosted Checkout Session Invalidation**  
  - *Interaction*: Customer opens checkout from invoice link; merchant voids invoice from dashboard before customer submits PIN.  
  - *Assertion*: Checkout session invalidated; customer submission rejected with "Invoice has been voided".
- **E2E-T3-PW-19: Duplicate SMS Interception Across Two Android Devices**  
  - *Interaction*: Merchant has two phones with duplicate SIMs or forwarded SMS; both receive identical SMS.  
  - *Assertion*: First device event creates payment; second device event rejected by `uq_mfs_sms_dedup_hash`; zero double credit.
- **E2E-T3-PW-20: OpenTelemetry Distributed Trace Context × QStash Queue × Webhook Outbox**  
  - *Interaction*: API payment creation span propagates trace ID into QStash message headers and webhook outbox row.  
  - *Assertion*: Webhook dispatch log contains matching `traceId` and `correlationId`.
- **E2E-T3-PW-21: Merchant Rolling Reserve Ledger Withholding × Available Balance Payout**  
  - *Interaction*: High-risk merchant configured with 10% rolling reserve; captures 10,000.00 BDT payment; requests payout.  
  - *Assertion*: Ledger posts 9,000 BDT to Available Balance (2110) and 1,000 BDT to Escrow Hold (2120); max payout allowed is 9,000 BDT.
- **E2E-T3-PW-22: AamarPay Gateway IPN × Currency Check × Paisa Conversion**  
  - *Interaction*: AamarPay IPN received for 2,500.50 BDT; verified via `trxcheck.php`.  
  - *Assertion*: Converted to `250050n` paisa; verified against database payment amount; settles atomically.
- **E2E-T3-PW-23: Android Collector Heartbeat Loss × Merchant Email Alert × Dashboard Status**  
  - *Interaction*: Collector device stops pinging for 35 minutes.  
  - *Assertion*: Background cron flags device `OFFLINE`; merchant alert queued; dashboard renders warning banner.
- **E2E-T3-PW-24: SMS Parser Unknown Operator Text × Engineer Review Queue × Zero Settlement**  
  - *Interaction*: SMS received from official shortcode with newly modified operator template.  
  - *Assertion*: Status marked `PARSER_UNRECOGNIZED`; logged to `unrecognized_sms_logs`; zero payment settlement occurs.
- **E2E-T3-PW-25: Payment Link Fixed Amount vs Customer-Specified Amount Mode**  
  - *Interaction*: Link created with `allow_custom_amount = true` and `min_amount = 100.00 BDT`.  
  - *Assertion*: Customer enters 250.00 BDT; checkout processes exact amount; ledger reflects 25000n paisa.
- **E2E-T3-PW-26: Database Connection Pool Exhaustion Recovery × State Machine OCC**  
  - *Interaction*: Sudden burst of 50 concurrent transactions saturates DB pool; connections queue and execute with OCC.  
  - *Assertion*: All 50 transactions either commit or fail cleanly with retryable error; zero corrupted state machine records.
- **E2E-T3-PW-27: Vercel Edge Middleware Auth × API Key Header Normalization**  
  - *Interaction*: Client sends `authorization: bearer <key>` (lowercase) vs `Authorization: Bearer <key>`.  
  - *Assertion*: Edge middleware normalizes headers; authenticates successfully in both cases.
- **E2E-T3-PW-28: Dual-Control Maker-Checker Vacation Delegate Re-Assignment**  
  - *Action*: Maker assigns review; supervisor reassigns checker role to Delegate C; Delegate C approves.  
  - *Assertion*: Maker $\ne$ Delegate C; approved; full delegation audit trail preserved.
- **E2E-T3-PW-29: Customer Chargeback Notice × Reverse Ledger Entry × Rolling Reserve Drawdown**  
  - *Interaction*: Gateway notifies platform of customer dispute on 30-day-old payment.  
  - *Assertion*: Reverse journal debits Merchant Reserve (2120) and credits Gateway In-Transit (1110); balance holds.
- **E2E-T3-PW-30: Rocket MFS Regex Format × Balance Chain Continuity Across Month Boundary**  
  - *Interaction*: Rocket SMS received at 23:59 on 31-AUG and 00:05 on 01-SEP.  
  - *Assertion*: Date parsing handles month transition (`AUG` $\to$ `SEP`); balance chain validates continuously.
- **E2E-T3-PW-31: High-Speed Webhook Dispatching × Backpressure Queue Throttling**  
  - *Interaction*: 500 payments settle in 10 seconds; outbox worker dispatches webhooks with concurrency limit 20.  
  - *Assertion*: Memory consumption remains bounded; all 500 webhooks dispatched without dropping events.
- **E2E-T3-PW-32: Android Hardware Key Re-Attestation on App Re-Install**  
  - *Action*: Device wipes app storage; generates new keypair; re-scans pairing QR.  
  - *Assertion*: Old device key marked `SUPERSEDED`; new key becomes active; subsequent events signed with new key accepted.
- **E2E-T3-PW-33: Bangladesh Bank National Switch (NPSB) Formatting in Settlement Report**  
  - *Action*: Generate bank settlement report for BEFTN/NPSB routing.  
  - *Assertion*: CSV contains 9-digit routing numbers, account numbers, and exact paisa amounts.
- **E2E-T3-PW-34: Multi-Tenant Schema Isolation: Cross-Tenant Unique Constraints**  
  - *Interaction*: Merchant A and Merchant B both use idempotency key `invoice_1001`.  
  - *Assertion*: Both succeed because constraint is `UNIQUE(merchant_id, idempotency_key)`.
- **E2E-T3-PW-35: End-to-End Hash Chain Audit Verification**  
  - *Action*: Query `audit_logs` table; compute running SHA-256 hash chain: $\text{Hash}_i = \text{SHA-256}(\text{Hash}_{i-1} \parallel \text{Row}_i)$.  
  - *Assertion*: 100% of stored record hashes match recalculated hash chain; proves zero database tampering.

---

## 6. Tier 4: Real-World Application Scenarios Catalog

Tier 4 defines **15 realistic end-to-end operational workflows** spanning multiple actors, systems, and time horizons. Total: **15 scenario test suites**.

---

### E2E-T4-SC-01: Enterprise Merchant Onboarding to First Production Payment
*Scenario*: Complete onboarding journey for a new enterprise merchant in Dhaka.
1. Merchant visits marketing site (`/`), reviews features and pricing, clicks "Register".
2. Submits registration form (Business Name, Trade License Number, Mobile, Email, Password).
3. Verifies email via token callback; logs into dashboard; sets up authenticator MFA.
4. Completes KYC profile: uploads NID and Bank Account details.
5. Platform Admin logs into `/admin`, inspects submitted KYC documents, clicks "Approve".
6. Merchant navigates to `/dashboard/api-keys`, generates production API key, copies secret.
7. Registers customer-facing webhook endpoint `https://shop.merchant.com/api/webhooks`.
8. Backend server initiates payment via `POST /api/v1/payments` with BDT 5,000.00.
9. Customer completes payment on hosted checkout using bKash.
10. System verifies payment, updates status to `COMPLETED`, posts balanced ledger entries, and delivers signed webhook.
11. Merchant dashboard shows 5,000.00 BDT gross volume and available balance.

---

### E2E-T4-SC-02: Retail Store Cashier MFS QR Payment via Android Collector
*Scenario*: Physical retail clothing store at Bashundhara City collecting bKash payment via Android SMS phone.
1. Merchant pairs Android phone kept at cash counter using dashboard QR code.
2. Cashier generates dynamic Bangla QR payment link for 2,450.00 BDT on POS terminal.
3. Customer scans QR with their personal bKash app and sends money to merchant SIM.
4. SIM receives cellular SMS: `"You have received Tk 2,450.00 from 01711223344..."`.
5. Android Collector `SmsBroadcastReceiver` catches SMS within 50ms, persists to encrypted Room DB, signs payload with hardware Keystore EC key, and posts to `/api/v1/devices/events`.
6. Server validates device signature, sequence number, and timestamp window.
7. SMS parser extracts TrxID and amount; balance-chain verifier confirms continuity with previous SIM balance.
8. System matches incoming TrxID and amount against pending checkout session.
9. Checkout session updates to `COMPLETED`; POS screen displays green checkmark "Payment Received".
10. Webhook dispatched to POS system; receipt prints automatically.

---

### E2E-T4-SC-03: Flash-Sale High-Velocity Concurrency Invariant Protection
*Scenario*: E-commerce flash sale selling 50 units of limited inventory with 500 simultaneous shoppers.
1. Merchant launches flash sale item at 10:00:00 AM.
2. 500 concurrent API requests hit `POST /api/v1/payments` within 2 seconds.
3. Multiple shoppers submit the same MFS TrxID concurrently attempting fraud.
4. Database unique constraints (`uq_payments_provider_tx`) and pessimistic locks engage.
5. Exactly 1 payment settles per genuine TrxID; all duplicate submissions rejected with 409 Conflict.
6. Rate limiting protects login and checkout APIs from node saturation.
7. Ledger records exactly 50 captures; debits equal credits for all 50 transactions; zero ledger discrepancies.

---

### E2E-T4-SC-04: Dual-Control Maker-Checker High-Risk Payment Dispute & Resolution
*Scenario*: Suspicious payment flagged by fraud engine and resolved via maker-checker workflow.
1. Customer initiates 45,000.00 BDT payment from foreign proxy IP with new MSISDN.
2. Anti-fraud engine evaluates rules: `GEO_IP_ANOMALOUS_PROXY` (+35) and `HIGH_VALUE_ANOMALY` (+40) = score 75 (`HIGH`).
3. Payment moves to `UNDER_REVIEW`; checkout tells customer "Payment is being verified".
4. Case appears in Admin Review Queue.
5. Fraud Analyst (Maker) calls merchant and customer to verify authorization; marks case `RECOMMEND_APPROVE` with notes.
6. Risk Manager (Checker) inspects evidence, confirms maker $\ne$ checker, and clicks `APPROVE`.
7. Payment state machine executes transition `UNDER_REVIEW` $\to$ `COMPLETED`.
8. Ledger settlement executes; webhook delivered to merchant; customer order fulfilled.

---

### E2E-T4-SC-05: Nightly Three-Way Financial Reconciliation & Automated Ledger Discrepancy Resolution
*Scenario*: Automated 02:00 AM reconciliation job detecting and alerting on clearing mismatch.
1. Daily reconciliation cron triggers via Upstash QStash at 02:00:00 UTC.
2. Worker ingests SSLCOMMERZ daily settlement statement (1,450 transactions, 1,200,000.00 BDT).
3. Compares statement against DenaNeya internal `payments` table and `ledger_entries`.
4. Discovers 1 transaction for 1,500.00 BDT captured on gateway but stuck in `PENDING` due to dropped IPN.
5. Automated reconciler executes auto-healing: marks payment `COMPLETED`, posts balanced double-entry ledger entries, and updates audit log.
6. Generates reconciliation summary report: 1,450 transactions matched, 1 auto-healed, 0 remaining discrepancies.
7. Report emailed to finance team with cryptographic signature.

---

### E2E-T4-SC-06: Recurring Digital B2B Invoice Issuance, Partial Payment, and Overdue Penalty
*Scenario*: Software agency billing corporate client with multi-tier milestones.
1. Agency creates invoice via API for 100,000.00 BDT with 2 line items and Net-30 payment terms.
2. System emails branded invoice to client with hosted payment button.
3. Client pays 50,000.00 BDT partial payment via card.
4. Invoice status updates to `PARTIALLY_PAID`; remaining balance reflects 50,000.00 BDT.
5. Due date passes without final payment; system cron marks invoice `OVERDUE` and sends SMS reminder.
6. Client pays remaining 50,000.00 BDT via bKash.
7. Invoice transitions to `PAID`; receipt generated; agency dashboard reflects zero outstanding receivables.

---

### E2E-T4-SC-07: Android Collector Remote Device Rotation, Heartbeat Loss & Offline Sync Recovery
*Scenario*: Warehouse phone loses connectivity during storm, collects payments offline, and recovers.
1. Warehouse Android device collects 12 customer MFS payments while cellular tower goes offline.
2. Payments saved in local encrypted Room database with sequential numbers #101 to #112.
3. DenaNeya server detects 30 minutes of missed heartbeats; flags device `OFFLINE` and alerts supervisor.
4. Cellular connection restores 2 hours later.
5. WorkManager triggers background sync worker; transmits batch of 12 signed envelopes.
6. Server verifies all 12 ECDSA signatures; verifies monotonic sequence; parses SMS texts; confirms balance-chain continuity.
7. All 12 pending customer orders update to `COMPLETED`; device status returns to `ACTIVE`.

---

### E2E-T4-SC-08: Gateway Outage Dynamic Failover & In-Flight Payment Status Recovery
*Scenario*: Sudden upstream outage at primary payment gateway during peak traffic.
1. SSLCOMMERZ experiences upstream degradation; latency spikes to 12,000ms; error rate exceeds 40%.
2. Gateway health monitor flags SSLCOMMERZ as `DOWN`.
3. Hosted checkout dynamically routes new card payments to shurjoPay / aamarPay fallback.
4. In-flight payment that was interrupted polled asynchronously via `queryPayment()`.
5. Gateway recovers 15 minutes later; health probe returns `UP`; normal routing resumes.

---

### E2E-T4-SC-09: Compromised Merchant API Key Emergency Revocation & Zero-Downtime Rollover
*Scenario*: Developer accidentally commits live API key to public repository; emergency rollover executed.
1. Security team detects leaked API key `dn_live_sec_abc123`.
2. Admin clicks "Emergency Rotate" in dashboard; issues new key `dn_live_sec_xyz789` with 2-hour grace window.
3. Engineering deploys updated environment variable with new key to production cluster.
4. Old key revoked immediately via dashboard after deployment.
5. Attacker attempts to use leaked key 5 minutes later; receives HTTP 401 Unauthorized.
6. Zero production payments dropped during rotation window.

---

### E2E-T4-SC-10: Customer Chargeback Dispute & Reverse Double-Entry Journal Settlement
*Scenario*: Bank disputes transaction 45 days after capture due to stolen card claim.
1. Bank issues chargeback on 10,000.00 BDT transaction previously captured via SSLCOMMERZ.
2. Platform Admin opens dispute ticket in `/admin/disputes`.
3. Merchant provides delivery proof; bank rejects proof and upholds chargeback.
4. Admin executes dispute reversal in platform.
5. Ledger posts balanced reversal: `DEBIT` 2110 (Merchant Balance: 9,800 BDT), `DEBIT` 4100 (Platform MDR Reversal: 50 BDT), `DEBIT` 2310 (Gateway Fee: 150 BDT), `CREDIT` 1110 (Gateway Settlement: 10,000 BDT).
6. Sum of debits equals sum of credits; merchant available balance decremented cleanly; audit log records dispute reference.

---

### E2E-T4-SC-11: Multi-Operator MFS Balance Chaining Across 1,000 Consecutive Transactions
*Scenario*: High-volume retail distributor processing 1,000 consecutive MFS transactions across 4 SIM slots.
1. Simulation runs 1,000 consecutive SMS payments across bKash (400), Nagad (300), Rocket (200), and Upay (100).
2. Each SIM tracks running balance continuously: $\text{Balance}_t = \text{Balance}_{t-1} + \text{Amount} - \text{Fee}$.
3. Balance-chain verifier validates all 1,000 transactions without false positives.
4. At transaction #742, a missing SMS is simulated (balance jump of 500 BDT).
5. System instantly flags `BALANCE_CHAIN_DISCONTINUITY` on transaction #742, routes payment to `UNDER_REVIEW`, and continues monitoring subsequent continuity.

---

### E2E-T4-SC-12: Webhook Delivery Outage, Exponential Backoff, DLQ Escalation and Admin Replay
*Scenario*: Merchant webhook server crashes during maintenance and recovers.
1. Payment completes; system dispatches webhook to merchant endpoint.
2. Merchant server is offline; returns TCP connection refused.
3. Outbox worker retries at +30s (Attempt 2: fail), +5m (Attempt 3: fail), +30m (Attempt 4: fail), +2h (Attempt 5: fail).
4. After 5th failure, event transitions to `DEAD_LETTER`.
5. Merchant dashboard displays "Webhook Delivery Failure Alert" with error logs.
6. Merchant fixes server, logs into dashboard, and clicks "Replay Failed Webhooks".
7. Webhook successfully delivered; status updates to `DELIVERED`; delivery log shows full history.

---

### E2E-T4-SC-13: Single-Use Payment Link Expiration, Tampering Defense, and Reuse Rejection
*Scenario*: Fraudster attempts to manipulate payment link parameters and reuse paid links.
1. Merchant creates single-use link for 1,200.00 BDT for order #401.
2. Fraudster intercepts link URL, tampers with query parameter `?amount=12.00`.
3. Server validates cryptographic signature of URL parameters; rejects tampered URL with 400 Bad Request.
4. Legitimate customer pays 1,200.00 BDT on original link.
5. Customer order completes; link transitions to `COMPLETED`.
6. Fraudster attempts to submit second payment on same link.
7. System rejects request with "This payment link has already been fulfilled".

---

### E2E-T4-SC-14: Multi-Tenant Team RBAC Permission Hierarchy & Cross-Tenant Data Access Denial
*Scenario*: Rigorous validation of enterprise tenant boundaries between competing merchants.
1. Merchant Alpha (Team of 3: Owner, Accountant, Developer) and Merchant Beta onboarded.
2. Merchant Alpha Developer generates API key scoped to `payments:read`.
3. Developer attempts `POST /api/v1/payments/:id/refund` $\to$ Rejected (403 Forbidden).
4. Developer attempts `GET /api/v1/payments` with Merchant Beta's payment ID $\to$ Rejected (404 Not Found / 403 Forbidden).
5. Accountant accesses ledger reports; can view financial statements but cannot rotate API keys.
6. Owner can perform all actions including member invitation and key revocation.
7. Zero cross-tenant data leakage under any API endpoint or SQL query.

---

### E2E-T4-SC-15: Bangladesh Bank Regulatory Audit Export & Cryptographic Hash-Chain Verification
*Scenario*: Annual regulatory compliance inspection by Bangladesh Bank payment system auditors.
1. Auditor requests full ledger and transaction audit trail for Q3 2026.
2. Admin triggers regulatory audit export via `/api/v1/admin/audit-export`.
3. System verifies running SHA-256 hash chain across all 50,000 log records in period; 0 integrity breaks found.
4. Confirms `REGULATED_FEATURES_ENABLED=false` was active throughout period; zero custodial pooling occurred.
5. Generates signed audit package including cryptographic receipt, ER schema, transaction volume summaries, and fee breakdowns.
6. Auditor verifies hash chain using external CLI verifier; package passes audit with 100% compliance.

---

## 7. Test Fixtures, Seed Data & Cryptographic Keys

### 7.1 Deterministic Test Merchants & Users
```typescript
export const TEST_MERCHANTS = {
  MERCHANT_ALPHA: {
    id: 'mer_01J7ALPHA0000000000000001',
    businessName: 'Dhaka Tech Solutions Ltd.',
    tradeLicense: 'TRAD/DNCC/012345/2024',
    email: 'billing@dhakatech.com.bd',
    status: 'ACTIVE',
    currency: 'BDT',
    webhookSecret: 'whsec_test_alpha_8f9a1b2c3d4e5f6a7b8c9d0e1f2a3b4c',
    apiKeyLive: 'dn_live_sec_alpha_981247192847192847192847',
  },
  MERCHANT_BETA: {
    id: 'mer_01J7BETA00000000000000002',
    businessName: 'Chittagong Agro Export',
    tradeLicense: 'TRAD/CCC/987654/2025',
    email: 'finance@ctgagro.com.bd',
    status: 'ACTIVE',
    currency: 'BDT',
    webhookSecret: 'whsec_test_beta_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d',
    apiKeyLive: 'dn_live_sec_beta_582910482910482910482910',
  },
};
```

---

### 7.2 Cryptographic Key Pairs & Secrets
- **Android Keystore Test Keypair**: NIST P-256 (`secp256r1`) pre-generated ECDSA keypair for automated signing in integration tests.
- **Nagad PGW RSA Test Keypair**: RSA-2048 keypair for simulating Nagad PGW handshake encryption and signature validation.
- **AES-256-GCM Master Key**: Deterministic 32-byte hexadecimal test key for envelope encryption tests.
- **QStash Signing Secret**: Deterministic test secret for verifying incoming queue worker callbacks.

---

### 7.3 Bangladesh MFS Verbatim SMS Corpus
```typescript
export const SMS_FIXTURES = {
  BKASH_CASH_IN: {
    sender: 'bKash',
    text: 'You have received Tk 2,500.00 from 01712345678. Fee Tk 0.00. Balance Tk 15,200.00. TrxID 9K38AL90 at 13/09/2026 22:10',
    expected: { provider: 'BKASH', trxId: '9K38AL90', amountPaisa: 250000n, balancePaisa: 1520000n },
  },
  NAGAD_MONEY_RECEIVED: {
    sender: '16167',
    text: 'Money Received. Amount: Tk 1,200.00 Sender: 01812345678 TxnID: NAG12345 Fee: Tk 0.00 Balance: Tk 8,400.00 Date: 13/09/2026 21:00',
    expected: { provider: 'NAGAD', trxId: 'NAG12345', amountPaisa: 120000n, balancePaisa: 840000n },
  },
  ROCKET_RECEIVED: {
    sender: '16216',
    text: 'Tk 500.00 received from A/C: 019123456789. Fee Tk 0.00. Balance: Tk 3,500.00. TxnId: RCK987654. Date:13-SEP-2026 20:15:00',
    expected: { provider: 'ROCKET', trxId: 'RCK987654', amountPaisa: 50000n, balancePaisa: 350000n },
  },
  UPAY_RECEIVED: {
    sender: 'upay',
    text: 'Received Tk 750.00 from 01612345678. TrxID: UPY112233. Fee: Tk 0.00. Balance Tk 2,250.00. Time: 13/09/2026 19:30',
    expected: { provider: 'UPAY', trxId: 'UPY112233', amountPaisa: 75000n, balancePaisa: 225000n },
  },
};
```

---

## 8. CI/CD Integration & Exit Code 0 Verification Contract

### 8.1 GitHub Actions Workflow Definition (`.github/workflows/e2e.yml`)
```yaml
name: E2E Test Suite (Tiers 1-4)

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  e2e-test:
    name: Run Requirement-Driven E2E Test Suite
    runs-on: ubuntu-latest
    timeout-minutes: 25

    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 11.17.0

      - name: Install Dependencies
        run: pnpm install --frozen-lockfile

      - name: Run E2E Test Suite (Exit Code 0 Contract)
        run: pnpm test:e2e --reporter=junit
        env:
          NODE_ENV: test
          DATABASE_URL: postgresql://test:test@localhost:5432/denaneya_test
          ENCRYPTION_MASTER_KEY: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
          QSTASH_TOKEN: test_qstash_token
          NEXTAUTH_SECRET: test_nextauth_secret_must_be_32_characters_long

      - name: Publish Test Results Summary
        if: always()
        uses: mikepenz/action-junit-report@v4
        with:
          report_paths: './test-reports/e2e-results.xml'
```

---

### 8.2 Execution Command Reference Card

```
===================================================================================
                       DENANEYA E2E TEST RUNNER CHEATSHEET
===================================================================================
All Tests (Tiers 1-4):      pnpm test:e2e
Tier 1 (Feature Coverage):   pnpm test:e2e --tier=1       (165 tests, >=5 per feature)
Tier 2 (Boundary & Corner):  pnpm test:e2e --tier=2       (165 tests, >=5 per feature)
Tier 3 (Cross-Feature Pair): pnpm test:e2e --tier=3       (35 cross-cutting tests)
Tier 4 (Real-World Scenarios):pnpm test:e2e --tier=4      (15 end-to-end workflows)
-----------------------------------------------------------------------------------
Milestone 1 Gate Check:      pnpm test:e2e --milestone=M1 (40 tests: F01-F04)
Milestone 2 Gate Check:      pnpm test:e2e --milestone=M2 (95 tests: F01-F09)
Milestone 3 Gate Check:      pnpm test:e2e --milestone=M3 (158 tests: F01-F14)
Milestone 4 Gate Check:      pnpm test:e2e --milestone=M4 (266 tests: F01-F23)
Milestone 5 Gate Check:      pnpm test:e2e --milestone=M5 (314 tests: F01-F27)
Milestone 6 Gate Check:      pnpm test:e2e --milestone=M6 (360 tests: F01-F31)
Milestone 7 Final Gate:      pnpm test:e2e --milestone=M7 (380 tests + Tier 5 Hardening)
===================================================================================
```

---
*End of Test Infrastructure Specification — Authored by `explorer_e2e_infra`.*
