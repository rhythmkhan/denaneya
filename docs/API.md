# DenaNeya Payment REST API (v1) Reference & Integration Guide

> **"দেনা-নেওয়া সহজ, হিসাব নিশ্চিত।"**  
> *Seamless Payments, Guaranteed Accounting.*

The DenaNeya REST API enables commercial merchants to create hosted checkout sessions, issue invoices, generate payment links, manage Android SMS collector devices, and receive verified payment notifications.

---

## 1. Environments & Base URLs

| Environment | Base URL | API Key Prefix | Purpose |
|---|---|---|---|
| **Production (Live)** | `https://api.denaneya.com` | `dn_live_sec_` | Real customer transactions routed to live provider gateways |
| **Sandbox (Test)** | `https://sandbox-api.denaneya.com` | `dn_test_sec_` | Fully simulated sandbox for development and automated tests |
| **Local Development** | `http://localhost:3000` | `dn_test_sec_` | Local development and mock gateway adapter testing |

OpenAPI 3.1.0 specification documents are publicly accessible:
- JSON: `https://api.denaneya.com/api/v1/openapi.json`
- YAML: `https://api.denaneya.com/docs/openapi.yaml`

---

## 2. Authentication & Common Headers

All API requests (except public device pairing and health endpoints) require a valid merchant API key passed via the `Authorization` header:

```http
Authorization: Bearer dn_live_sec_a1b2c3d4e5f60718293a4b5c6d7e8f90
```

### Standard HTTP Headers

| Header | Required | Direction | Description |
|---|---|---|---|
| `Authorization` | Yes | Request | Bearer API token (`dn_live_sec_...` or `dn_test_sec_...`) |
| `Content-Type` | Yes (on POST/PUT) | Request | Must be `application/json` |
| `Idempotency-Key` | Recommended | Request | Unique UUIDv4 (1-128 chars) preventing duplicate execution on retries |
| `X-Request-Id` | Automatic | Response | Unique server-generated correlation ID (e.g. `req_1726272000`) |
| `Idempotent-Replayed`| Optional | Response | Set to `true` when a request is served from the idempotency cache |
| `X-RateLimit-Limit` | Automatic | Response | Maximum requests permitted in the sliding rate window (e.g. `120`) |
| `X-RateLimit-Remaining` | Automatic | Response | Remaining requests available before rate throttling |
| `X-RateLimit-Reset` | Automatic | Response | Unix epoch timestamp when the current rate window resets |

---

## 3. Currency & Paisa Minor Unit Standard

DenaNeya strictly forbids floating-point numbers in financial arithmetic. All monetary fields are passed as strings or integers representing **paisa**:
- `1 BDT = 100 paisa`
- $500.00\text{ BDT} \longrightarrow \text{"50000"}$
- $1,500.00\text{ BDT} \longrightarrow \text{"150000"}$
- $10,000.00\text{ BDT} \longrightarrow \text{"1000000"}$

Passing fractional decimals (e.g. `1500.50`) will trigger a `422 VALIDATION_ERROR`.

---

## 4. Standard Error Response Envelope (`ApiError`)

Every error response adheres to RFC 7807 problem details:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "amountPaisa must be a positive integer minor unit string.",
    "requestId": "req_1726272000142",
    "details": {
      "field": "amountPaisa",
      "expected": "^[1-9][0-9]*$"
    }
  }
}
```

### The 17 Typed `ApiError` Codes Catalog

| Error Code | HTTP Status | Description & Remediation |
|---|---|---|
| `BAD_REQUEST` | 400 | Malformed JSON syntax or unparseable request body. |
| `UNAUTHORIZED` | 401 | Missing, malformed, or invalid API key. Verify Bearer token. |
| `API_KEY_REVOKED` | 401 | API key has been explicitly deactivated by organization administrator. |
| `API_KEY_EXPIRED` | 401 | API key has reached its configured expiration date. Rotate key. |
| `FORBIDDEN` | 403 | Authenticated identity lacks required scope or tenant access. |
| `INSUFFICIENT_PERMISSIONS` | 403 | API key scopes do not include necessary permission (e.g. missing `payments:write`). |
| `NOT_FOUND` | 404 | Generic resource not found. |
| `PAYMENT_NOT_FOUND` | 404 | Target payment ID does not exist under the authenticated merchant. |
| `EVENT_REPLAY_DETECTED` | 409 | Nonce or sequence number has already been processed or timestamp expired. |
| `INVALID_DEVICE_SIGNATURE` | 401 | Android Keystore ECDSA P-256 signature failed verification. |
| `INVALID_PAYMENT_STATE` | 422 | Attempted illegal state transition (e.g., refunding an unpaid payment). |
| `REFUND_EXCEEDS_CAPTURED` | 422 | Requested refund amount exceeds remaining refundable captured balance. |
| `VALIDATION_ERROR` | 422 | Input parameters failed schema validation (e.g., invalid phone format). |
| `SSRF_VALIDATION_FAILED` | 422 | Webhook destination URL resolves to private, loopback, or cloud metadata IP. |
| `FRAUD_REJECTED` | 403 | Anti-fraud engine scored transaction $\ge 80$ (CRITICAL tier). Transaction blocked. |
| `RATE_LIMITED` | 429 | Sliding rate quota exceeded. Back off per `Retry-After` header. |
| `INTERNAL_SERVER_ERROR` | 500 | Unhandled platform error. Contact DenaNeya engineering with `requestId`. |

---

## 5. Core API Endpoints Summary

### 5.1 Payments Domain
- `POST /api/v1/payments`: Create payment intent or replay cached payment. Returns hosted checkout redirect URL.
- `GET /api/v1/payments`: Paginated payment listing with status and date filtering (`limit`, `offset`, `status`, `from`, `to`).
- `GET /api/v1/payments/{id}`: Detailed payment record with net fees, customer billing, and refund history.
- `POST /api/v1/payments/{id}/refund`: Partial or full refund against settled payment.

### 5.2 Payment Links Domain
- `POST /api/v1/payment-links`: Generate reusable or single-use hosted checkout URLs with expiration dates.
- `GET /api/v1/payment-links`: Query merchant payment links and usage counts.
- `GET /api/v1/payment-links/{id}`: Retrieve link details and configuration.
- `DELETE /api/v1/payment-links/{id}`: Deactivate payment link (`INACTIVE`).

### 5.3 Digital Invoices Domain
- `POST /api/v1/invoices`: Create multi-line item invoice with tax and discount calculation.
- `GET /api/v1/invoices`: Paginated invoice query.
- `GET /api/v1/invoices/{id}`: Full invoice details with line items array.
- `PUT /api/v1/invoices/{id}`: Update draft invoice or mark as sent.
- `DELETE /api/v1/invoices/{id}`: Void unpaid invoice.

### 5.4 Webhooks Domain
- `POST /api/v1/webhooks`: Register webhook URL with mandatory SSRF validation. Returns signing secret once.
- `GET /api/v1/webhooks`: List subscriptions and delivery health.
- `GET /api/v1/webhooks/{id}`: Retrieve subscription details.
- `PUT /api/v1/webhooks/{id}`: Update endpoint URL or subscribed event list.
- `DELETE /api/v1/webhooks/{id}`: Delete webhook subscription.

### 5.5 Devices Domain (Android SMS Collector)
- `GET /api/v1/devices`: List paired collector devices and telemetry.
- `POST /api/v1/devices/pair`: Handshake pairing endpoint registering hardware EC P-256 public key.
- `POST /api/v1/devices/sms`: Ingest signed MFS SMS notification.
- `POST /api/v1/devices/heartbeat`: Telemetry check-in.

### 5.6 Gateways Domain
- `GET /api/v1/gateways/health`: Real-time probe of SSLCOMMERZ, bKash, Nagad, shurjoPay, and aamarPay.

### 5.7 Financial Reconciliation Domain
- `POST /api/v1/reconciliation/run`: Initiate 3-way reconciliation batch.
- `GET /api/v1/reconciliation/reports`: Query reconciliation discrepancy reports.
