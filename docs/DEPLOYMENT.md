# Production & Staging Deployment Architecture, Infrastructure & DNS Guide

> **"দেনা-নেওয়া সহজ, হিসাব নিশ্চিত।"**  
> *Seamless Payments, Guaranteed Accounting.*

This guide details the production deployment architecture, cloud infrastructure provisioning, DNS routing, and zero-downtime release procedures for DenaNeya.

---

## 1. Production Infrastructure Topology

DenaNeya is deployed across modern serverless cloud infrastructure located in Singapore to deliver sub-50ms latency to users in Bangladesh:

```
                            End-User & API Consumers
                                       │
                                       ▼
                       Cloudflare Global Edge Network
                       - DDoS Shield & WAF
                       - SSL/TLS Full (Strict)
                       - Edge Caching (Static Assets)
                                       │
                                       ▼ (HTTPS)
                      Vercel Serverless Edge Platform
                         Region: Singapore (sin1)
                         Next.js 15 App Router
                                       │
                  ┌────────────────────┴────────────────────┐
                  ▼ (Private VPC Wire / SSL)                ▼ (HTTPS / REST)
       Neon Serverless PostgreSQL                  Upstash QStash
       Region: ap-southeast-1 (AWS Singapore)      Serverless Message Queue
       - PgBouncer Pooled (Port 5432)              - Webhook Retries
       - Unpooled Direct Endpoint                  - Reconciliation Crons
```

---

## 2. DNS & Network Configuration

DNS is managed via Cloudflare with Proxy mode enabled for DDoS mitigation and WAF filtering:

| Type | Name / Host | Target / Content | Proxy Status | TTL | Notes |
|---|---|---|---|---|---|
| `CNAME` | `@` (`denaneya.com`) | `cname.vercel-dns.com` | Proxied | Auto | Root marketing website & merchant app |
| `CNAME` | `api` (`api.denaneya.com`) | `cname.vercel-dns.com` | Proxied | Auto | REST API v1 endpoints |
| `CNAME` | `sandbox` | `cname.vercel-dns.com` | Proxied | Auto | Developer sandbox simulator |
| `CNAME` | `checkout` | `cname.vercel-dns.com` | Proxied | Auto | High-performance hosted checkout UI |
| `TXT` | `@` | `v=spf1 include:_spf.mx.cloudflare.net ~all` | DNS Only | Auto | SPF email security record |

### SSL/TLS Configuration
- **Encryption Mode**: `Full (strict)` in Cloudflare SSL/TLS settings.
- **Minimum TLS Version**: `TLS 1.3` (with TLS 1.2 fallback for older devices).
- **HSTS**: Preload enabled with 2-year duration (`max-age=63072000`).

---

## 3. Neon Serverless PostgreSQL Provisioning

1. **Region Selection**: Always select **AWS Singapore (`ap-southeast-1`)** when creating the Neon project. This places the database in the exact same physical facility as Vercel's `sin1` serverless functions, keeping database round-trip times (RTT) under 5ms.
2. **Compute Configuration**:
   - Minimum compute: `0.25 CU`
   - Maximum compute: `4.0 CU` (auto-scaling on high transaction bursts)
   - Auto-suspend: 5 minutes (in development/staging) / Disabled (in production)
3. **Connection Pooling**:
   - Configure PgBouncer pooler mode: `Transaction`.
   - Set pool size to 50 concurrent connections.
4. **Environment Variables**:
   - Set `DATABASE_URL` to the pooled connection string (contains `-pooler`).
   - Set `DIRECT_URL` to the unpooled direct connection string.

---

## 4. Upstash QStash Provisioning

1. Navigate to Upstash Console and create a new **QStash** cluster in `ap-southeast-1`.
2. Retrieve the following credentials:
   - `QSTASH_URL`: `https://qstash.upstash.io/v2`
   - `QSTASH_TOKEN`: Cluster bearer token
   - `QSTASH_CURRENT_SIGNING_KEY`: Active signature verification key
   - `QSTASH_NEXT_SIGNING_KEY`: Key rotation verification key
3. Configure webhook endpoint destinations to route to `https://api.denaneya.com/api/v1/webhooks/dispatch`.

---

## 5. Deployment Runbook & Zero-Downtime Rollouts

### 5.1 Automated GitHub Actions Pipeline
Every push to the `main` branch automatically initiates the 4-job CI workflow:
1. `lint-and-typecheck`: Verifies TypeScript types across all 14 workspaces.
2. `test-monorepo`: Executes all unit and integration test suites.
3. `test-android`: Builds and verifies Android collector tests.
4. `secret-scan`: Ensures no credentials or keys exist in commits.

### 5.2 Vercel Deployment Commands
```bash
# Pull production project settings
vercel pull --environment=production

# Compile and optimize build output
vercel build --prod

# Deploy to Singapore edge
vercel deploy --prebuilt --prod
```

### 5.3 Instant Rollback SOP
If an incident or regression is detected post-deployment:
1. Navigate to Vercel Dashboard $\rightarrow$ Deployments.
2. Select the previous stable production deployment.
3. Click **Instant Rollback**. Traffic is immediately redirected at the edge within 5 seconds without rebuilding.
