# Payment Incident Management Framework & Emergency Runbooks

> **"দেনা-নেওয়া সহজ, হিসাব নিশ্চিত।"**  
> *Seamless Payments, Guaranteed Accounting.*

This operational playbook defines standard operating procedures for triaging, containing, mitigating, and documenting production incidents affecting payment processing, financial integrity, or security perimeters.

---

## 1. Incident Severity Classification Matrix

| Severity Level | Criteria & Impact Definition | Response SLA | Escalation Target |
|---|---|---|---|
| **SEV-1** | **Critical Outage**: Complete payment processing halt, ledger debit/credit imbalance, detected data breach, or double-settlement bug. | **15 minutes** | CTO, Lead Architect, Lead SRE |
| **SEV-2** | **Major Degradation**: Primary gateway outage (e.g. bKash down), Android collector sync offline > 30 minutes, or high-volume API throttling. | **30 minutes** | Primary On-Call Engineer, Senior Backend Dev |
| **SEV-3** | **Minor Degradation**: Webhook delivery backlogs, non-critical dashboard latency, individual merchant sync errors. | **2 hours** | Primary On-Call Engineer |
| **SEV-4** | **Low Impact / Cosmetic**: Non-blocking dashboard UI styling glitch, documentation typo, non-critical telemetry delay. | **24 hours** | Product Engineering Sprint Backlog |

---

## 2. Emergency Operational Runbooks

### Runbook 1: Global Platform Kill-Switch
If a critical vulnerability or rogue automated transaction surge is detected:
1. **Activate Cloudflare Global WAF Block**:
   Navigate to Cloudflare $\rightarrow$ Security $\rightarrow$ WAF and enable rule `Block all incoming POST requests to /api/v1/payments*`.
2. **Toggle Platform Maintenance Mode**:
   Set `REGULATED_FEATURES_ENABLED=false` and restart Vercel deployments.
3. Hosted checkouts will immediately display standard friendly maintenance banners while all incoming fund capture operations are halted safely.

### Runbook 2: Upstream Gateway Outage & Dynamic Failover
If an integrated payment aggregator or MFS gateway suffers a national outage (e.g. SSLCOMMERZ gateway timeout $> 80\%$):
1. Verify provider health metrics at `GET /api/v1/gateways/health`.
2. Access the Admin Dashboard $\rightarrow$ Gateway Management.
3. Toggle the affected provider to **MAINTENANCE / DISABLED**.
4. The hosted checkout dynamically hides the disabled provider option and guides payers to alternate active payment options (e.g., Nagad or direct MFS collector).

### Runbook 3: Compromised Android Collector Device Revocation
If a merchant reports a lost, stolen, or compromised Android collector smartphone:
1. In the Admin or Merchant Dashboard $\rightarrow$ Device Management:
   - Locate the target `deviceId` (e.g. `dev_4b8f9e01`).
   - Click **Revoke Device**.
2. Database executes:
   ```sql
   UPDATE collector_devices 
   SET status = 'REVOKED', public_key_hex = NULL 
   WHERE id = :deviceId;
   ```
3. Any subsequent incoming signed SMS payloads submitted with this device ID are rejected immediately with `401 INVALID_DEVICE_SIGNATURE`.

### Runbook 4: Double-Entry Ledger Imbalance Remediation
If an automated alert flags a variance between total debits and credits:
1. Execute the reconciliation diagnostic query:
   ```sql
   SELECT transaction_id, 
          SUM(CASE WHEN direction = 'DEBIT' THEN amount_paisa ELSE -amount_paisa END) as net_variance
   FROM ledger_entries
   GROUP BY transaction_id
   HAVING SUM(CASE WHEN direction = 'DEBIT' THEN amount_paisa ELSE -amount_paisa END) <> 0;
   ```
2. For each imbalanced transaction, inspect the corresponding `payments` row and audit logs.
3. Post a corrective adjustment journal entry to restore parity:
   - Debit: `CLEARING_DISCREPANCY_ACCOUNT`
   - Credit: `MERCHANT_PAYABLE_ACCOUNT`

### Runbook 5: Webhook Outbox Delivery Backlog Flushing
If Upstash QStash delivery workers stall, leading to a backlog of un-dispatched webhooks:
1. Query un-dispatched pending events:
   ```sql
   SELECT count(*) FROM outbox_events WHERE status = 'PENDING' AND scheduled_at < NOW() - INTERVAL '10 minutes';
   ```
2. Re-trigger QStash batch ingestion via the admin worker trigger:
   ```bash
   curl -X POST https://api.denaneya.com/api/v1/admin/webhooks/flush \
     -H "Authorization: Bearer $SUPER_ADMIN_KEY"
   ```

---

## 3. Blameless Post-Mortem Standard & Root Cause Analysis

Following the resolution of any SEV-1 or SEV-2 incident, the Incident Commander must produce a blameless post-mortem report within 48 hours containing:
1. **Executive Summary**: Impact duration, total affected merchants, total affected transaction volume (in paisa).
2. **Timeline of Events**: Chronological log from detection through triage, containment, and full recovery.
3. **Root Cause Analysis (The 5 Whys)**: Deep inquiry identifying systemic architectural or procedural gaps.
4. **Action Items (Preventative Remediation)**: Tracked Jira/GitHub issues assigned to owners with strict target completion dates.
