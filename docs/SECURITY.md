# DenaNeya Application & Infrastructure Security Specification

> **"দেনা-নেওয়া সহজ, হিসাব নিশ্চিত।"**  
> *Seamless Payments, Guaranteed Accounting.*

This specification establishes the authoritative security architecture, cryptographic standards, access controls, network perimeter defenses, and compliance posture for the DenaNeya platform.

---

## 1. Compliance & Standards Alignment

DenaNeya is engineered in strict compliance with the leading application security standards:
- **OWASP ASVS v4.0 (Application Security Verification Standard)**: Level 2 (Standard for applications processing sensitive financial data).
- **OWASP API Security Top 10 (2023)**: Complete mitigation of BOLA, Broken Authentication, BFLA, Unrestricted Resource Consumption, and SSRF.
- **OWASP MASVS v2.0 (Mobile Application Security Verification Standard)**: Level 2 for the Android MFS SMS collector application (`apps/android`).
- **NIST SP 800-63B**: Digital Identity Guidelines for Authentication and Lifecycle Management.

---

## 2. Cryptographic Hierarchy & Envelope Encryption

DenaNeya implements a multi-tier key hierarchy preventing plaintext exposure of merchant credentials or webhook secrets even in the event of an unauthorized database snapshot extraction:

```
                          Master Key (KEK)
                 [ENCRYPTION_MASTER_KEY: 256-bit Hex]
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       Data Encryption Key (DEK)       Webhook HMAC Master
         [Random 256-bit AES]            [256-bit Secret]
                 │
                 ▼
         Target Ciphertext
      [AES-256-GCM Encrypted]
```

### 2.1 AES-256-GCM Envelope Encryption
All merchant provider credentials (e.g. bKash App Secrets, Nagad private keys, webhook signing secrets) are encrypted using AES-256 in Galois/Counter Mode (GCM) providing authenticated encryption with associated data (AEAD):

- **Master Key**: 256-bit entropy loaded from `ENCRYPTION_MASTER_KEY`.
- **Initialization Vector (IV)**: 96-bit (12 bytes) cryptographically secure random IV generated per encryption operation (`crypto.randomBytes(12)`). Never reused.
- **Authentication Tag**: 128-bit (16 bytes) GCM auth tag verifying integrity and authenticity.
- **Storage Serialization**:
  ```
  enc:v1:<base64(encryptedDataKey)>:<base64(iv: 12 bytes)>:<base64(ciphertext + authTag: 16 bytes)>
  ```

### 2.2 Password & API Key Hashing
- **User Passwords**: Hashed with **Argon2id** (RFC 9106) configured with memory-hard parameters resisting GPU/ASIC brute-force attacks:
  - Memory cost: 65,536 KiB (64 MiB)
  - Time cost (iterations): 3
  - Parallelism: 4 threads
  - Salt: 16 bytes cryptographically secure random salt
- **API Secret Keys**:
  - Keys are generated with 32 bytes of secure random entropy: `dn_live_sec_<hex32>` or `dn_test_sec_<hex32>`.
  - Disclosed **EXCLUSIVELY ONCE** upon initial creation.
  - Stored in the database solely as a one-way **SHA-256 hash** (`key_hash = SHA-256(raw_key)`). Plaintext keys cannot be recovered by any administrator or attacker.

---

## 3. Server-Side Multi-Tenant Role-Based Access Control (RBAC)

DenaNeya enforces strict server-side authorization on every API endpoint and server action. Tenant isolation is guaranteed by scoping all queries to `merchant_id` derived from verified session tokens or authenticated API keys:

```
                            Session / API Key
                                   │
                                   ▼
                       Tenant Context Extraction
                     (merchant_id: 'mch_12345')
                                   │
                                   ▼
                       Role Permission Check
                     (e.g., 'payments:write')
                                   │
                                   ▼
                     Scoped Database Execution
               (WHERE merchant_id = session.merchant_id)
```

### 3.1 Role & Permission Matrix

| Role | Description | Allowed Permissions |
|---|---|---|
| **OWNER** | Merchant account proprietor | Full control: manage organization, team, banking, billing, API keys, and device pairings |
| **ADMIN** | Senior administrator | Operations management: create payment links, issue invoices, configure webhooks, rotate keys |
| **OPERATOR** | Day-to-day operations | Transactional tasks: issue refunds, view payments, trigger reconciliations |
| **VIEWER** | Read-only auditor | View payments, analytics, invoices, and audit logs |
| **AUDITOR** | External compliance officer | Read-only access to ledger journals, reconciliation reports, and cryptographic audit logs |

---

## 4. Bitwise SSRF Protection Engine

To eliminate Server-Side Request Forgery (SSRF) when delivering merchant webhooks or verifying callback URLs, DenaNeya implements a comprehensive IP and DNS verification engine in `@denaneya/security`:

### 4.1 Blocked CIDR Networks
Before dispatching any HTTP request to a merchant-provided endpoint, the destination hostname is resolved to IPv4 and IPv6 addresses via asynchronous DNS lookup. The resolved IP addresses are bitwise checked against all reserved, private, loopback, and cloud metadata ranges:

```
0.0.0.0/8          - Current network (RFC 1122)
10.0.0.0/8         - Private class A (RFC 1918)
100.64.0.0/10      - Shared address space / CGNAT (RFC 6598)
127.0.0.0/8        - Loopback (RFC 1122)
169.254.0.0/16     - Link-local & Cloud Metadata (AWS/GCP/Azure 169.254.169.254)
172.16.0.0/12      - Private class B (RFC 1918)
192.0.0.0/24       - IETF Protocol Assignments (RFC 6890)
192.0.2.0/24       - Documentation / TEST-NET-1 (RFC 5737)
192.168.0.0/16     - Private class C (RFC 1918)
198.18.0.0/15      - Benchmarking network (RFC 2544)
198.51.100.0/24    - Documentation / TEST-NET-2 (RFC 5737)
203.0.113.0/24     - Documentation / TEST-NET-3 (RFC 5737)
224.0.0.0/4        - Multicast (RFC 5771)
240.0.0.0/4        - Reserved for future use (RFC 1112)
255.255.255.255/32 - Limited broadcast (RFC 919)
::1/128            - IPv6 Loopback
fc00::/7           - IPv6 Unique Local Unicast (ULA)
fe80::/10          - IPv6 Link-Local Unicast
```

### 4.2 DNS Rebinding Prevention
To defend against Time-of-Check to Time-of-Use (TOCTOU) DNS rebinding attacks where an attacker alternates between a benign public IP and an internal address (`169.254.169.254`):
1. The hostname is resolved to an IP address.
2. The IP address is validated against the CIDR blocklist.
3. The HTTP client establishes a connection pinning the validated IP address directly, avoiding subsequent DNS resolution.

---

## 5. Multi-Tier Sliding Window Rate Limiting

DenaNeya protects against Denial-of-Service, credential stuffing, and brute-force attacks via multi-dimensional sliding window rate limiters implemented in memory / Upstash Redis:

| Dimension | Window | Maximum Limit | Scope & Action on Exceed |
|---|---|---|---|
| **Merchant Login** | 60 seconds | 10 attempts | Returns `429 Too Many Requests`; triggers progressive backoff |
| **API Endpoints (Live)** | 60 seconds | 120 requests | Returns `429` with `Retry-After`, `X-RateLimit-Reset` |
| **API Endpoints (Test)** | 60 seconds | 60 requests | Sandbox throttling preventing test script resource exhaustion |
| **Device Ingestion** | 60 seconds | 30 SMS requests | Flags anomaly if device submits abnormal SMS bursts |

---

## 6. Cryptographic Hash-Chained Audit Logging

To guarantee non-repudiation and prevent historical modification of sensitive audit records, the `audit_logs` table maintains a cryptographic hash chain:

$$\text{current\_hash} = \text{SHA-256}(\text{id} \parallel \text{timestamp} \parallel \text{actorId} \parallel \text{action} \parallel \text{canonicalJson(payload)} \parallel \text{previous\_hash})$$

If an attacker modifies or deletes a historical record in the database, the cryptographic hash chain breaks immediately, alerting the automated compliance verification monitor during daily reconciliation runs.

---

## 7. HTTP Security Headers & Edge Defenses

All responses from Vercel Edge and Next.js servers enforce enterprise-grade security headers configured in `vercel.json`:

```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https://api.denaneya.com https://*.upstash.io https://*.neon.tech; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests;
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self)
X-DNS-Prefetch-Control: on
```
