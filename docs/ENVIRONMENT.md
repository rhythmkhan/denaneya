# Platform Configuration Dictionary & Cryptographic Secret Rotation Runbook

> **"দেনা-নেওয়া সহজ, হিসাব নিশ্চিত।"**  
> *Seamless Payments, Guaranteed Accounting.*

This reference documents the complete catalog of environment variables across all nine functional domains, entropy requirements, generation commands, and key rotation procedures.

---

## 1. Master Configuration Catalog (9 Domains)

### Domain 1: Platform & Operational Governance
- `NODE_ENV`: Runtime mode (`development`, `test`, `production`).
- `APP_ENV`: Environment tier (`development`, `staging`, `production`).
- `NEXT_PUBLIC_APP_URL`: Fully qualified web application URL (e.g. `https://denaneya.com` or `http://localhost:3000`).
- `NEXT_PUBLIC_APP_NAME`: Public branding string (`DenaNeya`).
- `NEXT_PUBLIC_SUPPORT_EMAIL`: Official support contact (`support@denaneya.com`).
- `REGULATED_FEATURES_ENABLED`: **MUST REMAIN FALSE**. Declares software/orchestration mode without custodial holding of funds.

### Domain 2: Database Configuration (Neon Serverless PostgreSQL)
- `DATABASE_URL`: Transaction-pooled PgBouncer connection URI targeting port 5432 in Singapore (`ap-southeast-1`). Used by API serverless functions.
- `DIRECT_URL`: Unpooled direct compute connection URI. Required for DDL migrations and schema changes.

### Domain 3: Asynchronous Messaging & Queues (Upstash QStash)
- `QSTASH_URL`: Base REST endpoint for QStash message broker (`https://qstash.upstash.io/v2`).
- `QSTASH_TOKEN`: Cluster authentication bearer token.
- `QSTASH_CURRENT_SIGNING_KEY`: Key used to verify signature of incoming QStash webhook dispatch triggers.
- `QSTASH_NEXT_SIGNING_KEY`: Pre-configured verification key for zero-downtime key rotation.

### Domain 4: Authentication & Identity (NextAuth / Auth.js)
- `NEXTAUTH_URL`: Canonical root URL for authentication redirects.
- `NEXTAUTH_SECRET`: 256-bit cryptographically secure secret used to encrypt session JWTs and cookies.

### Domain 5: Cryptography & Security Secrets
- `ENCRYPTION_MASTER_KEY`: 32-byte hexadecimal string (64 characters) providing 256 bits of entropy. Used as the Key Encryption Key (KEK) for AES-256-GCM envelope encryption.
- `WEBHOOK_SIGNING_SECRET`: Secret used to compute HMAC-SHA256 signatures on outbound merchant webhooks.
- `DEVICE_PAIRING_SECRET`: Secret key used to sign and verify 15-minute ephemeral QR pairing tokens for Android collectors.
- `DEVICE_CLOCK_DRIFT_TOLERANCE_SECONDS`: Acceptable clock difference window between server and mobile device (default: `300`).

### Domain 6: Payment Gateway Sandbox Credentials
- **SSLCOMMERZ**: `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWD`, `SSLCOMMERZ_IS_SANDBOX`, `SSLCOMMERZ_SESSION_URL`, `SSLCOMMERZ_VALIDATION_URL`.
- **shurjoPay**: `SHURJOPAY_USERNAME`, `SHURJOPAY_PASSWORD`, `SHURJOPAY_PREFIX`, `SHURJOPAY_IS_SANDBOX`, `SHURJOPAY_BASE_URL`.
- **aamarPay**: `AAMARPAY_STORE_ID`, `AAMARPAY_SIGNATURE_KEY`, `AAMARPAY_IS_SANDBOX`, `AAMARPAY_BASE_URL`.
- **bKash PGW**: `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_USERNAME`, `BKASH_PASSWORD`, `BKASH_IS_SANDBOX`, `BKASH_BASE_URL`.
- **Nagad PGW**: `NAGAD_MERCHANT_ID`, `NAGAD_MERCHANT_PRIVATE_KEY`, `NAGAD_PG_PUBLIC_KEY`, `NAGAD_IS_SANDBOX`, `NAGAD_BASE_URL`.

### Domain 7: Observability, Telemetry & Logging
- `LOG_LEVEL`: Minimum logging severity (`debug`, `info`, `warn`, `error`).
- `OTEL_SERVICE_NAME`: OpenTelemetry service identifier (`denaneya-platform`).
- `OTEL_EXPORTER_OTLP_ENDPOINT`: Collector target endpoint (e.g. `http://localhost:4318`).

### Domain 8: Anti-Fraud & Rate Limiting Thresholds
- `RATE_LIMIT_LOGIN_MAX_ATTEMPTS`: Maximum failed login attempts per window (default: `10`).
- `RATE_LIMIT_LOGIN_WINDOW_SECONDS`: Sliding window duration (default: `60`).
- `RATE_LIMIT_API_MAX_REQUESTS`: Live API request quota per window (default: `120`).
- `RATE_LIMIT_API_WINDOW_SECONDS`: API quota window (default: `60`).
- `FRAUD_SCORE_AUTO_REJECT_THRESHOLD`: Minimum risk score to trigger instant rejection (default: `80`).
- `FRAUD_SCORE_REVIEW_THRESHOLD`: Minimum risk score to route to Maker-Checker queue (default: `50`).

### Domain 9: Android Collector Configuration Defaults
- `COLLECTOR_DEFAULT_SERVER_URL`: Default backend URL bundled in Android collector APK (`https://api.denaneya.com`).
- `COLLECTOR_DEFAULT_APP_TAG`: Logcat tag for mobile debugging (`DenaNeyaCollector`).

---

## 2. Secret Generation Runbook

All cryptographic keys must meet minimum entropy standards:

```bash
# 1. Generate 32-byte hex master encryption key (256 bits of entropy)
openssl rand -hex 32

# 2. Generate 32-byte hex NextAuth session secret
openssl rand -hex 32

# 3. Generate base64 webhook signing secret
openssl rand -base64 32

# 4. Generate device pairing secret
openssl rand -hex 32
```

---

## 3. Cryptographic Key Rotation Runbook

### 3.1 Rotating `ENCRYPTION_MASTER_KEY` (Envelope Re-Encryption)
Because DenaNeya uses envelope encryption, rotating the master key does not require decrypting individual database records. Instead:
1. Generate new Master Key $K_2$: `openssl rand -hex 32`.
2. Configure $K_2$ as `ENCRYPTION_MASTER_KEY_NEXT`.
3. Run the database re-wrapping migration script:
   ```bash
   pnpm tsx packages/security/src/scripts/rotate-master-key.ts
   ```
   The script iterates over encrypted rows, decrypts each row's DEK with $K_1$, re-encrypts the DEK with $K_2$, and commits the change.
4. Promote $K_2$ to `ENCRYPTION_MASTER_KEY` in Vercel environment settings.
5. Decommission $K_1$.

### 3.2 Rotating `WEBHOOK_SIGNING_SECRET`
To rotate webhook secrets without breaking in-flight merchant deliveries:
1. Add new secret to `WEBHOOK_SIGNING_SECRET_NEXT`.
2. The delivery worker computes dual signatures (`v1` and `v2`) during a 48-hour transition window.
3. Merchants update their listener configuration to verify the new secret.
4. Promote the new secret to primary.
