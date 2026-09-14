# Multi-Tier Quality Assurance, Testing Pyramid & Verification Standards

> **"দেনা-নেওয়া সহজ, হিসাব নিশ্চিত।"**  
> *Seamless Payments, Guaranteed Accounting.*

This specification documents DenaNeya's comprehensive 5-tier testing pyramid, code coverage requirements, cross-verification harnesses, and adversarial penetration testing suites.

---

## 1. The 5-Tier Testing Pyramid

Financial orchestration systems demand zero tolerance for regression. Testing is divided into five rigorous verification tiers:

```
                  ┌───────────────────────────────┐
                  │ Tier 5: Adversarial Security  │ (SSRF, SQLi, Tampering)
                  ├───────────────────────────────┤
                  │ Tier 4: Concurrency & Stress  │ (100+ Race Conditions)
                  ├───────────────────────────────┤
                  │ Tier 3: Pairwise Integration  │ (Checkout → DB → Webhook)
                  ├───────────────────────────────┤
                  │ Tier 2: Invariant Validation  │ (Paisa Bounds, FSM Limits)
                  ├───────────────────────────────┤
                  │ Tier 1: Functional Unit Tests │ (Math, Regexes, HMAC)
                  └───────────────────────────────┘
```

### Tier Descriptions & Scope
- **Tier 1: Functional Unit Tests**: Validates pure business logic in isolation with zero external I/O. Covers paisa integer arithmetic, payment state transitions, SMS regex parsing across bKash/Nagad/Rocket/Upay, and HMAC signature algorithms.
- **Tier 2: Boundary & Invariant Validation**: Tests boundary extremes: negative monetary amounts, zero quantities, 64-bit integer overflows, clock drift windows exceeding $\pm 300\text{ seconds}$, and invalid state transitions.
- **Tier 3: Pairwise Integration Tests**: Tests end-to-end integration across multiple packages and database mock instances: payment intent creation $\rightarrow$ gateway adapter invocation $\rightarrow$ database row insertion $\rightarrow$ outbox event creation.
- **Tier 4: Concurrency & Race Condition Stress Tests**: Dispatches 100+ simultaneous requests sharing identical idempotency keys, duplicate SMS hashes, or provider TrxIDs to verify exactly-once settlement guarantees.
- **Tier 5: Adversarial Penetration Tests**: Executes security challenge vectors: SSRF IP spoofing, DNS rebinding, SQL injection in search parameters, timing attacks on HMAC verification, and forged Android Keystore signatures.

---

## 2. Package Code Coverage Requirements

Every package in the monorepo must satisfy minimum line and branch coverage thresholds enforced by Turborepo test coverage gates:

| Package | Minimum Line Coverage | Critical Invariants Tested |
|---|---|---|
| `@denaneya/payment-core` | **$\ge 95\%$** | Zero-float paisa math, FSM transitions, Zod validation |
| `@denaneya/ledger` | **$100\%$** | Debit $\equiv$ Credit invariant, chart of accounts |
| `@denaneya/security` | **$\ge 95\%$** | AES-256-GCM envelope encryption, bitwise SSRF guard, Argon2id |
| `@denaneya/sms-parser` | **$\ge 90\%$** | Multi-carrier regexes, balance-chain math, deduplication |
| `@denaneya/fraud-engine` | **$\ge 90\%$** | 12 scoring rules, Maker-Checker separation of duties |
| `@denaneya/gateway-adapters` | **$\ge 85\%$** | Normalization, parameter mapping, sandbox mocks |
| `@denaneya/webhooks` | **$\ge 90\%$** | Outbox transactional enqueue, HMAC-SHA256 signing, retry schedule |

---

## 3. Cross-Verification Test Harness (`apps/android`)

To guarantee that the native Kotlin Android collector app and the TypeScript backend share identical cryptographic canonicalization rules, DenaNeya implements a cross-verification test harness:

```
[Android Native Kotlin Keystore]
       │
       ▼ (Generates EC P-256 Keypair & Signs Canonical JSON)
[Signed Event Payload: dev_4b8f9e01.json]
       │
       ▼ (Transmitted via tsx test_cross_verification.mts)
[TypeScript Node.js Cryptographic Engine]
       │
       ▼ (Verifies Signature with Native crypto.createVerify)
[VERIFICATION SUCCESS: Signature Valid]
```

### Running Cross-Verification:
```bash
cd apps/android
pnpm test:cross
```
The test harness passes canonical JSON through both Kotlin's `java.security.Signature` and Node's `node:crypto.verify` to confirm cross-platform cryptographic parity.

---

## 4. Test Execution Command Reference

```bash
# 1. Run all monorepo unit and integration tests (uncached)
pnpm turbo run test --force --filter=!@denaneya/android-collector -- --run

# 2. Run tests with coverage reporting
pnpm turbo run test:coverage --force --filter=!@denaneya/android-collector -- --run

# 3. Run individual package test suite (e.g. payment-core)
pnpm --filter @denaneya/payment-core test

# 4. Run native Android unit tests (Robolectric & JUnit 4)
cd apps/android && ./gradlew testDebugUnitTest --no-daemon

# 5. Execute 100-request concurrency stress test
pnpm test:concurrency
```
