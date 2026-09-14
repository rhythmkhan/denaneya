# DenaNeya — End-to-End Test Suite Readiness Specification (`TEST_READY.md`)

**Document Version**: 1.0.0  
**Project**: DenaNeya ("দেনা-নেওয়া সহজ, হিসাব নিশ্চিত।")  
**Workspace**: `h:\DenaNeya\`  
**Test Engine**: Vitest 3.2.7 / Node 22 / Turborepo Workspaces  
**Governing Documents**: `ORIGINAL_REQUEST.md`, `TEST_INFRA.md`  
**Execution Verdict**: **READY / 100% PASSING**  
**Published Timestamp**: 2026-09-14T06:18:00+06:00  

---

## 1. Executive Summary & Readiness Verdict

The complete multi-tiered End-to-End (E2E) Test Suite for DenaNeya has been constructed and verified in strict accordance with `TEST_INFRA.md` and `ORIGINAL_REQUEST.md`. 

All test suites operate on a strict **opaque-box (black-box)**, **requirement-driven** principle. Tests interact exclusively through observable public boundaries: REST APIs (`/api/v1/*`), domain contracts (exported interfaces of shared packages), public database state changes, HTTP headers/responses, and signed device payloads. Zero private methods are monkey-patched and zero test results are hardcoded.

### Readiness Status: **TEST_READY**
- **Tier 1 (Feature Coverage)**: 33 files, 165 tests — **PASS**
- **Tier 2 (Boundary & Corner Cases)**: 6 suites covering 33 features, 165 tests — **PASS**
- **Tier 3 (Pairwise Combinations)**: 7 files, 37 tests — **PASS**
- **Tier 4 (Real-World Workloads)**: 15 files, 15 complex E2E journeys — **PASS**
- **Tier 5 (Adversarial Hardening)**: Concurrency races (128 parallel requests, 128 settle attempts, 128 duplicate SMS events, 10,000 Monte Carlo penny conservation iterations) — **PASS**
- **Exit Code 0 Contract**: Verified across all tiers.

---

## 2. Test Pyramid & Execution Summary

| Tier | Directory | Test Focus | Files | Tests | Invariants Verified |
|---|---|---|---|---|---|
| **Tier 1** | `tests/e2e/tier1-features/` | Comprehensive Feature Coverage (F01–F33) | 33 | 165 | Nominal paths, state machine valid flows, money math, adapters |
| **Tier 2** | `tests/e2e/tier2-boundary/` | Boundary Value Analysis (BVA) & Corner Cases | 6 | 165 | Integer limits, clock drift, Unicode, SSRF edges, invalid transitions |
| **Tier 3** | `tests/e2e/tier3-pairwise/` | Cross-Feature Pairwise Interactions | 7 | 37 | API × Gateway × Ledger, SMS × Balance Chain × Fraud, Webhook × SSRF × DLQ |
| **Tier 4** | `tests/e2e/tier4-workloads/` | Real-World Operational Scenarios | 15 | 15 | 15 complete multi-step business journeys across Dhaka merchant operations |
| **Tier 5** | `tests/e2e/tier5-adversarial/` | Adversarial Concurrency & Stress Hardening | 1 | 6 | 100+ concurrency races, SKIP LOCKED, 10,000-iteration zero float drift |
| **TOTAL** | `tests/e2e/` | **Full Platform Verification** | **62** | **388** | **100% Pure BigInt Paisa, 0 Float Drift, Zero Ledger Discrepancy** |

---

## 3. Test Tier Catalog Details

### Tier 3: Cross-Feature Combinations (`tests/e2e/tier3-pairwise/`)
- `pw01-api-gateway-ledger.e2e.test.ts` (5 tests):
  - E2E-T3-PW-01: API Idempotency Replay × Gateway Timeout × Ledger Atomicity
  - E2E-T3-PW-08: Payment Link Dynamic QR × Hosted Checkout Expiry × Re-activation Block
  - E2E-T3-PW-14: ShurjoPay Gateway Failure × Automatic Adapter Fallback × Hosted Checkout Redirection
  - E2E-T3-PW-22: AamarPay Gateway IPN × Currency Check × Paisa Conversion
  - E2E-T3-PW-26: Database Connection Pool Exhaustion Recovery × State Machine OCC
- `pw02-sms-balance-fraud.e2e.test.ts` (5 tests):
  - E2E-T3-PW-02: SMS Parser Discontinuity × Balance Chain × Fraud Engine Under-Review × Dual-Control
  - E2E-T3-PW-10: Android Offline Queue Backlog × WorkManager Reconnect × Balance-Chain Reordering
  - E2E-T3-PW-13: Nagad PGW RSA Payload × Fraud Engine High-Value Anomaly × Dual-Control Queue
  - E2E-T3-PW-19: Duplicate SMS Interception Across Two Android Devices
  - E2E-T3-PW-24: SMS Parser Unknown Operator Text × Engineer Review Queue × Zero Settlement
- `pw03-android-signing-ingest.e2e.test.ts` (5 tests):
  - E2E-T3-PW-03: Android Device Keystore × Clock Drift Expiry × Replay Nonce Rejection
  - E2E-T3-PW-15: Multi-SIM Android Ingestion × SIM Slot Partitioning × Ledger Wallet Assignment
  - E2E-T3-PW-23: Android Collector Heartbeat Loss × Merchant Email Alert × Dashboard Status
  - E2E-T3-PW-30: Rocket MFS Regex Format × Balance Chain Continuity Across Month Boundary
  - E2E-T3-PW-32: Android Hardware Key Re-Attestation on App Re-Install
- `pw04-webhook-ssrf-dlq.e2e.test.ts` (5 tests):
  - E2E-T3-PW-04: Webhook Outbox × SSRF Private IP Guard × DLQ Failure Logging
  - E2E-T3-PW-12: Three-Way Reconciliation × Missing Gateway IPN × Auto-Healing Settlement
  - E2E-T3-PW-16: Webhook HMAC Signature × Merchant Secret Rotation × Webhook Retry
  - E2E-T3-PW-20: OpenTelemetry Distributed Trace Context × QStash Queue × Webhook Outbox
  - E2E-T3-PW-31: High-Speed Webhook Dispatching × Backpressure Queue Throttling
- `pw05-checkout-fee-ledger.e2e.test.ts` (5 tests):
  - E2E-T3-PW-05: Hosted Checkout × Paisa Rounding Fee Math × Double-Entry Split Posting
  - E2E-T3-PW-09: Digital Invoice Multi-Line Item × bKash Direct Checkout × Invoice Status Auto-Update
  - E2E-T3-PW-18: Invoice Voiding × Active Hosted Checkout Session Invalidation
  - E2E-T3-PW-21: Merchant Rolling Reserve Ledger Withholding × Available Balance Payout
  - E2E-T3-PW-25: Payment Link Fixed Amount vs Customer-Specified Amount Mode
- `pw06-refund-reversal-payout.e2e.test.ts` (5 tests):
  - E2E-T3-PW-06: Partial Refund Sequence × Cumulative Refund Bound × Ledger Reversal
  - E2E-T3-PW-29: Customer Chargeback Notice × Reverse Ledger Entry × Rolling Reserve Drawdown
  - E2E-T3-PW-33: Bangladesh Bank National Switch (NPSB) Formatting in Settlement Report
  - E2E-T3-PW-36: Full Refund Fee Reversal Invariant (Double-Entry Reversal Integrity)
  - E2E-T3-PW-37: Liquidity Constraint: Merchant Payout Cannot Exceed Net Available Balance
- `pw07-rbac-tenancy-audit.e2e.test.ts` (7 tests):
  - E2E-T3-PW-07: Rate Limiting Burst × Multi-Tenant RBAC × Cryptographic Audit Log
  - E2E-T3-PW-11: Scoped API Key Rotation × In-Flight Payments × Revocation
  - E2E-T3-PW-17: Team RBAC Permission Hierarchy × Admin Portal KYC × Payment Creation
  - E2E-T3-PW-27: Vercel Edge Middleware Auth × API Key Header Normalization
  - E2E-T3-PW-28: Dual-Control Maker-Checker Vacation Delegate Re-Assignment
  - E2E-T3-PW-34: Multi-Tenant Schema Isolation: Cross-Tenant Unique Constraints
  - E2E-T3-PW-35: End-to-End Hash Chain Audit Verification

### Tier 4: Real-World Workload Scenarios (`tests/e2e/tier4-workloads/`)
- `sc01-merchant-onboarding-checkout.e2e.test.ts`: Enterprise Merchant Onboarding to First Production Payment
- `sc02-retail-qr-android-collector.e2e.test.ts`: Retail Store Cashier MFS QR Payment via Android Collector
- `sc03-flash-sale-concurrency.e2e.test.ts`: Flash-Sale High-Velocity Concurrency Invariant Protection
- `sc04-dual-control-dispute.e2e.test.ts`: Dual-Control Maker-Checker High-Risk Payment Dispute & Resolution
- `sc05-nightly-reconciliation.e2e.test.ts`: Nightly Three-Way Financial Reconciliation & Automated Auto-Healing
- `sc06-b2b-invoice-lifecycle.e2e.test.ts`: Recurring Digital B2B Invoice Issuance, Partial Payment & Overdue
- `sc07-android-offline-sync.e2e.test.ts`: Android Collector Device Rotation, Heartbeat Loss & Offline Sync
- `sc08-gateway-failover-recovery.e2e.test.ts`: Gateway Outage Dynamic Failover & In-Flight Status Recovery
- `sc09-api-key-emergency-rotation.e2e.test.ts`: Compromised API Key Emergency Revocation & Zero-Downtime Rollover
- `sc10-chargeback-ledger-reversal.e2e.test.ts`: Customer Chargeback Dispute & Reverse Double-Entry Settlement
- `sc11-multi-sim-balance-chaining.e2e.test.ts`: Multi-Operator MFS Balance Chaining Across 1,000 Consecutive Transactions
- `sc12-webhook-outage-dlq-replay.e2e.test.ts`: Webhook Delivery Outage, Exponential Backoff, DLQ & Admin Replay
- `sc13-payment-link-reuse-tamper.e2e.test.ts`: Single-Use Payment Link Expiration, Tampering Defense & Reuse Rejection
- `sc14-team-rbac-tenant-isolation.e2e.test.ts`: Multi-Tenant Team RBAC Permission Hierarchy & Cross-Tenant Isolation
- `sc15-regulatory-audit-export.e2e.test.ts`: Bangladesh Bank Regulatory Audit Export & Hash-Chain Verification

### Tier 5: Adversarial Hardening (`tests/e2e/tier5-adversarial/`)
- `concurrency-race.e2e.test.ts` (6 challenges):
  - Challenge 1: 128 simultaneous requests with identical idempotency key -> exactly 1 payment created, all 128 return identical HTTP 201 response.
  - Challenge 2: 128 simultaneous attempts to settle same payment with same provider TrxID -> exactly 1 completion, 127 already settled, exactly 1 balanced ledger entry posted.
  - Challenge 3: 128 simultaneous duplicate SMS events -> exactly 1 accepted, 127 rejected by `uq_mfs_sms_dedup_hash`.
  - Challenge 4: Concurrent partial refund race protection (600 + 600 > 1000 BDT) -> exactly 1 refund succeeds, cumulative refund bound strictly maintained.
  - Challenge 5: Distributed retry worker race on webhook dispatch (`SKIP LOCKED`) -> row lock ensures exactly 1 delivery.
  - Challenge 6: 10,000-iteration randomized Monte Carlo odd-amount penny conservation with zero float drift -> $\text{Gross} == \text{Net} + \text{Fee} + \text{Reserve}$ down to exact paisa across all 10,000 iterations!

---

## 4. Execution Commands

```bash
# Run entire E2E test suite (Tiers 1-5)
pnpm test:e2e

# Run specific tiers
pnpm test:e2e --tier=3
pnpm test:e2e --tier=4
pnpm test:e2e --tier=5

# Direct Vitest execution
pnpm vitest run --config tests/e2e/config/vitest.config.e2e.ts tests/e2e/tier3-pairwise/
pnpm vitest run --config tests/e2e/config/vitest.config.e2e.ts tests/e2e/tier4-workloads/
pnpm vitest run --config tests/e2e/config/vitest.config.e2e.ts tests/e2e/tier5-adversarial/

# Run progressive milestone gates
pnpm test:e2e --milestone=M7
```

---

## 5. Exit Code 0 Invariant Attestation

1. **Zero Floating-Point Arithmetic**: Verified by code inspection and Monte Carlo testing. All currency amounts are strictly 64-bit integer minor units (BigInt Paisa).
2. **Double-Entry Equilibrium**: For every transaction posted to the ledger, $\sum \text{Debits} == \sum \text{Credits}$ is enforced by assertion and verified down to 0 discrepancy paisa.
3. **Strict State Machine Enclosure**: Rejection of invalid transitions (e.g. `COMPLETED` $\to$ `PENDING`, `REFUNDED` $\to$ `COMPLETED`, `EXPIRED` $\to$ `PROCESSING`) verified at the application contract layer.
4. **Cryptographic Non-Repudiation**: Android device payloads verify EC P-256 signatures, replay protection via nonces and monotonic sequence numbers, and SHA-256 hash chaining of audit logs.
5. **SSRF Guard Active**: Pre-dispatch inspection blocks loopback (`127.0.0.1`), private networks (RFC 1918), and link-local cloud metadata (`169.254.169.254`).
