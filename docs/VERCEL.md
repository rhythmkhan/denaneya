# Vercel Serverless & Edge Deployment Specification (`sin1` Region)

> **"দেনা-নেওয়া সহজ, হিসাব নিশ্চিত।"**  
> *Seamless Payments, Guaranteed Accounting.*

This specification documents the configuration, routing rules, edge headers, compute resources, and geographic placement of DenaNeya's web application deployed on **Vercel**.

---

## 1. Geographic Optimization: Singapore (`sin1`) Placement

Payment orchestration systems require minimal round-trip latency to guarantee seamless checkout conversions and immediate provider callback handling. DenaNeya pins all serverless and edge compute functions to **`sin1` (Singapore)**:

```
[Dhaka, Bangladesh User / Gateway]
                 │ ~35-45ms (Fiber Route via Cox's Bazar Submarine Cable SMW4/SMW5)
                 ▼
     [Vercel Serverless (sin1)]
                 │ < 2-5ms (Intra-Datacenter AWS Direct Route)
                 ▼
[Neon PostgreSQL (ap-southeast-1)]
```

### Latency Rationale:
1. **Submarine Fiber Directness**: Bangladesh's primary international submarine cable connections (SEA-ME-WE 4 and SEA-ME-WE 5) terminate directly in Singapore data centers, yielding consistent 35–45ms ping times.
2. **Database Co-Location**: Neon's production database clusters reside in AWS Singapore (`ap-southeast-1`). Pinning compute functions to `sin1` minimizes database network latency to under 5ms per query, preventing cumulative connection overhead during multi-step financial transactions.

---

## 2. Serverless Function Constraints & Sizing

In `vercel.json`, compute resources are allocated to balance cold-start latency against execution capacity:

```json
{
  "functions": {
    "apps/web/src/app/api/**/*": {
      "memory": 1024,
      "maxDuration": 15
    }
  }
}
```

- **Memory (1024 MB)**: Grants proportional CPU allocation, ensuring cryptography operations (AES-256-GCM, Argon2id, ECDSA verification) execute within single-digit milliseconds.
- **Max Duration (15 seconds)**: Prevents runaway long-polling connections while accommodating slow upstream gateway network responses.

---

## 3. Production `vercel.json` Specification

The full, hardened configuration file residing at the monorepo root:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "buildCommand": "pnpm --filter @denaneya/web build",
  "installCommand": "pnpm install",
  "cleanUrls": true,
  "trailingSlash": false,
  "regions": ["sin1"],
  "functions": {
    "apps/web/src/app/api/**/*": {
      "memory": 1024,
      "maxDuration": 15
    }
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https://api.denaneya.com https://*.upstash.io https://*.neon.tech; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests;"
        },
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=63072000; includeSubDomains; preload"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=(), payment=(self)"
        },
        {
          "key": "X-DNS-Prefetch-Control",
          "value": "on"
        }
      ]
    },
    {
      "source": "/api/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
        },
        {
          "key": "Pragma",
          "value": "no-cache"
        }
      ]
    },
    {
      "source": "/checkout/(.*)",
      "headers": [
        {
          "key": "X-Robots-Tag",
          "value": "noindex, nofollow, noarchive"
        },
        {
          "key": "Cache-Control",
          "value": "no-store, no-cache, must-revalidate, max-age=0"
        }
      ]
    },
    {
      "source": "/dashboard/(.*)",
      "headers": [
        {
          "key": "X-Robots-Tag",
          "value": "noindex, nofollow, noarchive"
        }
      ]
    },
    {
      "source": "/admin/(.*)",
      "headers": [
        {
          "key": "X-Robots-Tag",
          "value": "noindex, nofollow, noarchive"
        }
      ]
    },
    {
      "source": "/_next/static/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

---

## 4. Cache Control & SEO Robot Directives

- **Dynamic API Routes (`/api/*`)**: Enforces `no-store, no-cache, must-revalidate` to prevent intermediary proxies from caching financial transactions.
- **Hosted Checkout (`/checkout/*`)**: Protected with `X-Robots-Tag: noindex, nofollow, noarchive` ensuring payment sessions are never indexed by web search spiders.
- **Merchant & Admin Dashboards (`/dashboard/*`, `/admin/*`)**: Non-indexed (`noindex, nofollow`) for confidentiality and privacy.
- **Immutable Static Assets (`/_next/static/*`)**: Cached for 1 year (`max-age=31536000, immutable`) at global edge nodes for optimal asset loading speed.
