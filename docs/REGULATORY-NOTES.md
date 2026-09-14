# Bangladesh Payment Regulatory Framework, Compliance Boundaries & Legal Architecture

> **"দেনা-নেওয়া সহজ, হিসাব নিশ্চিত।"**  
> *Seamless Payments, Guaranteed Accounting.*

This document clarifies the legal and regulatory standing of the DenaNeya payment management and orchestration platform under the laws of the People's Republic of Bangladesh and the regulatory guidelines of **Bangladesh Bank** (Payment Systems Department).

---

## 1. Executive Summary & Regulatory Classification

DenaNeya is classified as a **Software Orchestration Platform and Technical Service Provider (TSP)**. The platform does not engage in regulated banking, e-money issuance, or payment clearing activities:

```
================================================================================
CRITICAL REGULATORY SAFEGUARD
================================================================================
DenaNeya operates with:
    REGULATED_FEATURES_ENABLED=false

1. NO CUSTODY OF FUNDS: DenaNeya NEVER holds, receives, deposits, or pools funds
   originating from consumers or merchants.
2. NO WALLET ISSUANCE: DenaNeya does not issue stored-value consumer accounts or
   prepaid instruments.
3. DIRECT SETTLEMENT: All financial clearing occurs directly between licensed
   banks / MFS entities and the merchant's regulated commercial accounts.
================================================================================
```

---

## 2. Bangladesh Bank Regulatory Boundaries

Bangladesh Bank regulates electronic financial activities under the **Bangladesh Payment and Settlement Systems Regulations 2014 (BPSSR 2014)**.

### 2.1 Non-PSP Status (Not a Payment Service Provider)
Under BPSSR 2014, a Payment Service Provider (PSP) is defined as an entity licensed to provide electronic payments directly to consumers, typically by maintaining e-money wallets (e.g. bKash, Nagad, Upay).
- **DenaNeya Status**: DenaNeya is **NOT** a PSP. It does not open consumer accounts, hold consumer deposits, or issue e-money. All checkout sessions delegate the actual debiting of funds to licensed PSPs chosen by the customer.

### 2.2 Non-PSO Status (Not a Payment System Operator)
A Payment System Operator (PSO) operates a settlement or clearing house between financial institutions (e.g. National Payment Switch Bangladesh - NPSB, ITCL, SSLCOMMERZ, shurjoPay).
- **DenaNeya Status**: DenaNeya is **NOT** a PSO. It acts as an integration orchestration layer sitting upstream of PSOs and PSPs, converting merchant checkout commands into standardized API calls directed to licensed acquirers and aggregators.

### 2.3 Direct-to-Merchant Settlement Architecture
In all transactions facilitated by DenaNeya:
1. The customer authorizes a debit on their bank card or MFS mobile wallet.
2. The licensed acquirer (e.g. SSLCOMMERZ or bKash PGW) captures the funds.
3. The licensed acquirer clears funds directly into the merchant's designated commercial bank account or MFS merchant wallet through the Bangladesh Automated Clearing House (BACH) / Bangladesh Electronic Funds Transfer Network (BEFTN) / NPSB.
4. DenaNeya records the transaction ledger metadata but **never touches the physical fiat currency**.

---

## 3. Statutory Legal Compliance in Bangladesh

### 3.1 Payment and Settlement Systems Act 2014
DenaNeya operates strictly within Section 4 and Section 6 of the Payment and Settlement Systems Act 2014, providing technical middleware without engaging in unlicensed clearing services.

### 3.2 Information and Communication Technology (ICT) Act 2006 (Amended 2013)
- **Section 43 (Tampering with Computer Source Documents)**: All system source code, database migrations, and operational logs are version-controlled with cryptographic signing.
- **Section 66 (Hacking)**: Strict adherence to OWASP ASVS Level 2 defenses, bitwise SSRF prevention, and rate-limiting to protect financial systems integrity.

### 3.3 Cyber Security Act 2023
DenaNeya adheres to national cybersecurity directives regarding the protection of Critical Information Infrastructure (CII), data integrity verification, and cooperation with Bangladesh Computer Emergency Response Team (BGD e-GOV CIRT).

---

## 4. Anti-Money Laundering & CFT Obligations

Although DenaNeya is not a direct reporting agency under the Money Laundering Prevention Act 2012, it provides commercial merchants with technical tooling to support their compliance obligations to the Bangladesh Financial Intelligence Unit (BFIU):

1. **Transaction Velocity Monitoring**: The 12-rule anti-fraud engine flags rapid transaction bursts and off-hours anomalies.
2. **6-Year Audit Trail Preservation**: All payment records, IPN callbacks, and cryptographic audit log chains are preserved for a minimum of six (6) years in accordance with Bangladesh Bank record retention mandates.
3. **Know Your Customer (KYC)**: Payer identity verification is performed upstream by licensed banks and MFS providers during PIN/OTP challenge. Merchant identity is verified during onboarding.

---

## 5. Data Residency & Regional Hosting Architecture

In accordance with commercial banking practices in Bangladesh:
- **Cloud Hosting**: Primary serverless compute and transactional databases are hosted in Singapore (AWS `ap-southeast-1` and Vercel `sin1`). This satisfies national performance and latency requirements while leveraging modern serverless resilience.
- **Data Protection**: Personal Identifiable Information (PII) is encrypted at rest using AES-256-GCM. Passwords and keys are hashed using Argon2id and SHA-256. Plaintext payment card PANs and CVVs are strictly handled by PCI-DSS certified gateway partners and never touch DenaNeya servers.
