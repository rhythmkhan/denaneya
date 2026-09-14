# Original User Request

## Initial Request — 2026-09-13T16:11:42Z

Build "DenaNeya" — a production-grade, multi-tenant payment management and orchestration platform for Bangladesh. This is a production system that will eventually handle real merchant money. The platform includes a Next.js web application (marketing site, merchant dashboard, admin dashboard, hosted checkout, API, documentation portal), shared TypeScript packages (payment-core, gateway-adapters, fraud-engine, sms-parser, ledger, webhooks, security, observability), and a native Kotlin/Jetpack Compose Android SMS collector app. Deploy the web application to Vercel.

Core brand: "DenaNeya" — "দেনা-নেওয়া সহজ, হিসাব নিশ্চিত।"

Working directory: h:\DenaNeya
Integrity mode: development

## Technology Decisions (Resolved)

- **Database**: Neon (serverless PostgreSQL)
- **Queue/Events**: Upstash QStash (serverless, HTTP-based, retry/DLQ built-in)
- **Authentication**: NextAuth/Auth.js with custom RBAC layer
- **Framework**: Next.js, TypeScript strict, React, Tailwind CSS
- **Monorepo**: pnpm workspaces + Turborepo
- **Validation**: Zod
- **API spec**: OpenAPI 3.1
- **Android**: Native Kotlin, Jetpack Compose, Android Keystore, WorkManager
- **Money**: Integer minor units (paisa) — never floating point

## Requirements

### R1. Full-Stack Payment Platform with Genuine Functionality
Build a complete monorepo with all 30 components listed in the specification (public website, hosted checkout, merchant dashboard, admin dashboard, Android SMS collector, Payment API, webhook infrastructure, verification engine, anti-fraud engine, duplicate prevention, MFS SMS automation, gateway adapters, payment links, invoices, QR support, refund management, reconciliation, transaction ledger, team management, API key management, webhook logs, device management, risk/review system, docs portal, sandbox/production environments, monitoring, security infrastructure, SEO, CI/CD). Every feature must be genuinely functional — no fake buttons, placeholder APIs, TODO implementations, or simulated production functionality. If provider credentials are unavailable, implement the complete adapter interface and sandbox integration, clearly marking it as requiring production credentials.

### R2. Financial Integrity & Duplicate Prevention
Implement database-level duplicate payment protection: idempotency keys with `UNIQUE(merchant_id, idempotency_key)`, provider transaction uniqueness constraints, SMS cryptographic hash uniqueness, and atomic settlement (payment completion + ledger update + consumed transaction marking + outbox event in one DB transaction). Build a double-entry immutable ledger where debits always equal credits. Implement an explicit payment state machine (CREATED → REQUIRES_ACTION → PENDING → PROCESSING → UNDER_REVIEW → COMPLETED → FAILED → CANCELLED → EXPIRED → PARTIALLY_REFUNDED → REFUNDED) with enforced valid transitions — reject invalid transitions at the database/application level. Store money as integer minor units (paisa) consistently throughout. Implement exactly-once business effect through idempotency, constraints, and transactional state transitions. The system must handle: same TrxID submitted 20 times, 20+ simultaneous API requests, repeated SMS, repeated webhooks, and simultaneous retry worker processing — with exactly ONE successful settlement.

### R3. Security, Compliance & Regulatory Safety
Follow OWASP ASVS, API Security Top 10, and MASVS standards. Implement: server-side RBAC on every endpoint, field-level encryption (AES-256-GCM) for provider credentials with envelope encryption, immutable append-only audit logging with hash chaining, progressive rate limiting across multiple dimensions (IP/merchant/user/device), webhook SSRF protection (block localhost/private networks/cloud metadata/DNS rebinding), Android device hardware-backed key attestation with signed event submissions and replay prevention (nonce + timestamp window + monotonic sequence). API credentials: cryptographically secure random generation, shown once, stored as secure one-way hash, with scoped permissions and key rotation. Set `REGULATED_FEATURES_ENABLED=false` by default — DenaNeya operates in SOFTWARE/ORCHESTRATION mode and does not hold funds, issue e-money, or act as a licensed payment aggregator. No PCI-scoped card data handling. Argon2id for password hashing. Strong security headers (CSP, HSTS, etc.).

### R4. Gateway Adapters, SMS Automation & Android App
Build a provider-agnostic gateway adapter interface (`createPayment`, `verifyPayment`, `queryPayment`, `refund`, `queryRefund`, `normalizeWebhook`, `healthCheck`). Research and implement adapters for Bangladesh payment providers where official APIs and documentation exist (SSLCOMMERZ, shurjoPay, aamarPay, and others). Produce a research matrix documenting each provider's capabilities before implementing. Build versioned SMS parser engine for bKash, Nagad, Rocket, Upay with sender ID validation, format versioning, and PARSER_UNRECOGNIZED flagging. Build native Kotlin Android app: QR-based device pairing with one-time expiring tokens, hardware-backed keypair generation (Android Keystore), signed event submissions, encrypted offline queue with automatic retry, heartbeat reporting, and WorkManager for background processing. Implement balance-chain verification for SMS-based wallets. Trust tiers: A (official API) → B (signed webhook + verify API) → C (authenticated SMS device) → D (manual entry).

### R5. Fraud Engine, Observability, Operations & Documentation
Build configurable risk scoring engine (0-100, LOW/MEDIUM/HIGH/CRITICAL) with rules for: reused TrxID, duplicate SMS, amount mismatch, wrong wallet, suspicious sender, velocity, replay, device integrity, balance-chain mismatch, and merchant-specific rules. Manual review queue with dual-control approval for high-value payments. Provider health monitoring (UP/DEGRADED/DOWN) with latency and success rate tracking. Structured JSON logging with request_id, correlation_id, payment_id, merchant_id. OpenTelemetry support. Reconciliation jobs comparing DenaNeya payments vs provider transactions vs ledger. CI/CD pipeline with typecheck, lint, unit tests, security scan, secret scan on PRs. Deliver all 18+ documentation files (README, ARCHITECTURE, DATABASE, SECURITY, THREAT-MODEL, API, WEBHOOKS, ANDROID-SMS-AUTOMATION, FRAUD-PREVENTION, GATEWAY-INTEGRATIONS, DEPLOYMENT, VERCEL, ENVIRONMENT, BACKUP-RECOVERY, INCIDENT-RESPONSE, TESTING, REGULATORY-NOTES, CHANGELOG). OpenAPI 3.1 spec. Payment sequence diagrams. ER diagram.

## Acceptance Criteria

### Platform Functionality
- [ ] Monorepo builds successfully with `pnpm build` — no TypeScript errors
- [ ] Public marketing website renders all pages (Home, Features, Payment Methods, Developers, Pricing, Security, About, Contact, etc.) with proper SEO metadata, sitemap.xml, robots.txt, OpenGraph tags
- [ ] Merchant registration → email verification → login → MFA setup → dashboard navigation works end-to-end
- [ ] Admin dashboard loads with merchant management, payment overview, audit logs, fraud review, gateway health, device management, SMS events, feature flags
- [ ] Hosted checkout flow: create payment via API → redirect to checkout → select payment method → complete sandbox payment → verify via API
- [ ] Payment links: create → share URL → customer pays → merchant sees payment
- [ ] Invoices: create with line items → send → customer pays → status updates
- [ ] API keys: create with scopes → use for API auth → rotate → revoke → old key rejected
- [ ] Webhooks: register endpoint → payment event triggers signed webhook → verify signature → retry on failure → view delivery log

### Financial Integrity (Critical)
- [ ] Concurrency test: 100+ simultaneous requests for same payment with same idempotency key → exactly 1 payment created, all return same result
- [ ] Concurrency test: 100+ simultaneous attempts to settle same payment with same provider TrxID → exactly 1 completion
- [ ] Payment state machine rejects COMPLETED→PENDING, REFUNDED→COMPLETED, and all other invalid transitions
- [ ] Ledger entries always balance: sum of debits == sum of credits for every ledger transaction (enforced by database constraint or verified by test)
- [ ] No floating-point arithmetic anywhere in money calculations — verified by grep/search
- [ ] Refund amount cannot exceed captured amount — constraint enforced
- [ ] Idempotency key replay returns original payment object without side effects

### Security
- [ ] `git log --all -p` contains no real secrets, API keys, or credentials
- [ ] API secret shown only at creation; stored value is not reversible to original
- [ ] RBAC test: merchant A cannot read/write merchant B's payments, webhooks, or devices via API
- [ ] Rate limiting returns 429 on login brute force (>10 attempts/minute)
- [ ] Webhook URL creation rejects localhost, 10.x.x.x, 169.254.169.254, and other private/metadata addresses
- [ ] Android device events without valid signature are rejected by backend
- [ ] Android event replay (same nonce/event_id) is rejected
- [ ] SQL injection test on search/filter parameters passes
- [ ] CSRF protection active on state-changing endpoints
- [ ] Dashboard/admin/checkout routes have noindex meta tags; public pages do not

### Android App
- [ ] APK builds successfully with both debug and release variants (Gradle build completes without errors)
- [ ] QR pairing: generate in dashboard → scan in app → device appears in dashboard as connected
- [ ] SMS event flow: receive SMS → parse → sign → send to backend → appears in dashboard
- [ ] Offline queue: disconnect network → receive SMS → reconnect → events sync successfully
- [ ] Duplicate SMS: same SMS sent twice → server accepts first, deduplicates second

### Testing & Documentation
- [ ] Unit tests pass: payment state machine (all valid/invalid transitions), money arithmetic, SMS parser (all provider formats), HMAC signature verification, risk scoring rules, ledger balance invariant
- [ ] Integration tests pass: database transactions (atomicity), webhook delivery and retry, API authentication and authorization
- [ ] OpenAPI 3.1 specification validates without errors
- [ ] All required documentation files exist and contain substantive content (not stubs)
- [ ] ER diagram, architecture diagram, and payment sequence diagrams are generated
- [ ] .env.example exists with all required variables documented with placeholder values

## 2026-09-13T23:08:03Z

Continue building the DenaNeya multi-tenant payment platform. Milestones M1–M5 are complete; finish M6 (Security, Reconciliation, OpenAPI & Docs) and M7 (E2E Testing & Adversarial Hardening).

Working directory: h:\DenaNeya

## Current State Assessment

The project is a production-grade pnpm monorepo (Turborepo) with:
- **Build**: `pnpm build` succeeds — 12/12 tasks, zero TS errors
- **Tests**: All 66 test files pass across 22 suites (431+ tests total)
- **Packages**: `payment-core`, `ledger`, `fraud-engine`, `gateway-adapters` (5 providers), `sms-parser`, `webhooks`, `security`, `observability`, `reconciliation`, `database`
- **Web app** (`apps/web`): Next.js 15, marketing pages (Home/Features/Pricing/Developers/Security/About/Contact/Payment-Methods), auth (login/register/forgot/reset), merchant dashboard (payments/invoices/payment-links/api-keys/webhooks/devices/team/settings/MFA), admin portal (merchants/fraud/audit-logs/gateways/feature-flags), hosted checkout, docs portal (8 topics), REST API v1 (payments/refunds/invoices/payment-links/webhooks/devices/gateways/reconciliation/openapi.json)
- **Android app** (`apps/android`): Kotlin/Jetpack Compose, Keystore P-256, QR pairing, SMS listener, Room DB offline queue, WorkManager — APK builds (43.1MB)
- **Docs**: 18 markdown files + OpenAPI spec (YAML+JSON) + 7 Mermaid diagrams
- **CI/CD**: GitHub Actions (lint/typecheck/test/Android tests/secret scan), Vercel config (`sin1` region)

Completed milestones per `.agents/orchestrator_1/PROJECT.md`:
- M1 (Monorepo Foundation): DONE — 73/73 tests
- M2 (Payment Core, Ledger, Fraud): DONE — 201/201 tests
- M3 (Gateway Adapters, SMS, Webhooks): DONE — 431/431 tests, 99.27% coverage
- M4 (Web App & API): DONE — 318/318 tests
- M5 (Android): DONE — 18 unit + 38 cross + 45 challenge tests

## What Remains

### M6: Security, Reconciliation, OpenAPI & Docs (PLANNED)
The code and artifacts for M6 mostly exist but need polishing, integration, and quality verification:
1. Reconciliation package exists (`packages/reconciliation`) with reconciler, runner, parsers, auto-heal, reports — 20 tests passing. Verify it integrates properly with the API routes (`/api/v1/reconciliation/run`, `/api/v1/reconciliation/reports`).
2. OpenAPI spec exists (`docs/openapi.yaml` + `docs/openapi.json`, 72KB + 49KB). Validate it against the actual API routes for accuracy and completeness.
3. All 18 documentation files exist in `docs/`. Review for substantive content (not stubs), accuracy, and completeness per R5.
4. 7 Mermaid diagrams exist in `docs/diagrams/`. Verify they are correct and match the actual architecture.
5. Vercel config and CI/CD pipeline exist. Verify completeness.
6. Mark M6 as DONE once everything is verified and any gaps are filled.

### M7: E2E Testing & Adversarial Hardening (PLANNED)
The test infrastructure specification exists in `TEST_INFRA.md` (1604 lines, very detailed). This is the most significant remaining work:
1. Build the complete E2E test suite per `TEST_INFRA.md` specifications — 380 tests across 5 tiers
2. Tier 1: Feature Coverage — 165 tests (33 features × 5), happy-path nominal flows
3. Tier 2: Boundary & Corner Cases — 165 tests (33 features × 5), extreme limits, clock skew, unicode, malformed
4. Tier 3: Pairwise Combinations — 35 cross-feature interaction tests
5. Tier 4: Real-World Scenarios — 15 complex multi-step E2E workflows
6. Tier 5: Adversarial Hardening — concurrency races (100+ simultaneous requests for same payment), penetration testing, chaos injection
7. All tests must be opaque-box (black-box), requirement-driven, using Vitest
8. Tests interact via public boundaries only: REST APIs, exported interfaces, database state, HTTP responses

## Requirements

### R1. Complete M6 — Verify and polish all existing M6 deliverables
Review and fix any gaps in reconciliation integration, OpenAPI spec accuracy, documentation completeness, diagram correctness, and CI/CD configuration. Every doc file in `docs/` must contain substantive, accurate content. The OpenAPI 3.1 spec must validate without errors and match the actual API routes.

### R2. Build the complete E2E test suite (M7 Phase 1)
Implement the full 380-test E2E suite specified in `TEST_INFRA.md`. Tests must be opaque-box and requirement-driven, using Vitest as the test runner. Follow the 5-tier pyramid: Tier 1 (Feature Coverage), Tier 2 (Boundary/Corner), Tier 3 (Pairwise Combinatorial), Tier 4 (Real-World Workloads), Tier 5 (Adversarial). Every test must map to a requirement from `ORIGINAL_REQUEST.md` (R1–R5, Acceptance Criteria).

### R3. Pass the acceptance criteria from `ORIGINAL_REQUEST.md`
All acceptance criteria listed in `ORIGINAL_REQUEST.md` under "Platform Functionality", "Financial Integrity", "Security", "Android App", and "Testing & Documentation" sections must pass. Fix any implementation gaps discovered during testing.

### R4. Maintain build and existing test integrity
`pnpm build` must succeed with zero TypeScript errors. All existing 66 test files (431+ tests) must continue to pass. No regressions allowed.

## Acceptance Criteria

### Build & Test Integrity
- [ ] `pnpm build` succeeds with zero TypeScript errors (all 12 tasks)
- [ ] All existing 431+ unit/integration tests pass (zero regressions)
- [ ] No floating-point arithmetic anywhere in money calculations (verified by grep)
- [ ] `git log --all -p` contains no real secrets or credentials

### M6 Deliverables
- [ ] OpenAPI 3.1 spec (`docs/openapi.yaml`) validates without errors using a standard validator
- [ ] All 18+ doc files in `docs/` contain substantive, accurate content (not stubs or placeholders)
- [ ] ER diagram, architecture diagram, and payment sequence diagrams in `docs/diagrams/` are accurate
- [ ] Reconciliation API routes (`/api/v1/reconciliation/run`, `/api/v1/reconciliation/reports`) function correctly
- [ ] CI/CD pipeline in `.github/workflows/ci.yml` covers typecheck, lint, test, secret scan

### E2E Test Suite
- [ ] E2E test suite contains 300+ tests across Tiers 1-5
- [ ] Tier 1 (Feature Coverage): All 33 features have nominal/happy-path tests
- [ ] Tier 2 (Boundary): Boundary value analysis for critical features (state machine, money, rate limiting, risk scoring)
- [ ] Tier 3 (Pairwise): Cross-feature interaction tests (gateway × risk × webhook × ledger)
- [ ] Tier 4 (Real-World): Multi-step business workflow tests (merchant onboarding → payment → settlement → reconciliation)
- [ ] Tier 5 (Adversarial): Concurrency tests — 100+ simultaneous requests for same payment with same idempotency key → exactly 1 created
- [ ] All tests are opaque-box (no private internals, no monkey-patching)
- [ ] Test suite runs via `pnpm test` and all tests pass

### Original Acceptance Criteria (from ORIGINAL_REQUEST.md)
- [ ] Concurrency: 100+ simultaneous requests for same payment → exactly 1 created
- [ ] Payment state machine rejects all invalid transitions (COMPLETED→PENDING, REFUNDED→COMPLETED, etc.)
- [ ] Ledger entries always balance: sum(debits) == sum(credits) per transaction
- [ ] Refund amount cannot exceed captured amount
- [ ] RBAC: merchant A cannot access merchant B's data via API
- [ ] Rate limiting returns 429 on brute force (>10 attempts/minute)
- [ ] Webhook URL rejects private/metadata addresses (localhost, 10.x.x.x, 169.254.169.254)
- [ ] Android device events without valid signature are rejected
- [ ] CSRF protection active on state-changing endpoints

