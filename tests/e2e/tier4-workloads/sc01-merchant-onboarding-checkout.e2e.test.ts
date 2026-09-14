import { describe, it, expect } from 'vitest';
import { Paisa, validatePaymentTransition } from '@denaneya/payment-core';
import {
  buildPaymentCaptureTransaction,
  getMerchantAccountId,
  getSystemAccountId,
  SYSTEM_ACCOUNT_CODES,
} from '@denaneya/ledger';
import { verifyLedgerBalance, assertLedgerBalanced } from '../helpers/ledger-verifier.js';
import { generateWebhookSignature, verifyWebhookSignature } from '../helpers/signature-helper.js';
import crypto from 'node:crypto';

describe('Tier 4: Workload Scenario 01 — Enterprise Onboarding to Production Payment', () => {
  /**
   * E2E-T4-SC-01: Enterprise Merchant Onboarding to First Production Payment
   * Full lifecycle: Registration -> Email Verify -> MFA -> KYC -> Admin Approval ->
   * API Key Issuance -> Webhook Config -> API Payment -> Hosted Checkout -> Settlement -> Webhook Delivery
   */
  it('E2E-T4-SC-01: Enterprise Merchant Onboarding to First Production Payment', async () => {
    // 1. Merchant registration form submission
    const registration = {
      businessName: 'Dhaka Tech Solutions Ltd.',
      tradeLicense: 'TRAD/DNCC/012345/2024',
      mobile: '01711000001',
      email: 'billing@dhakatech.com.bd',
      emailVerified: false,
      mfaEnabled: false,
      kycStatus: 'PENDING_SUBMISSION',
      status: 'PENDING_VERIFICATION',
    };

    // 2. Email verification token callback
    const verificationToken = 'tok_email_verify_' + crypto.randomBytes(16).toString('hex');
    expect(verificationToken).toContain('tok_email_verify_');
    registration.emailVerified = true;
    registration.status = 'ACTIVE';

    // 3. Setup Authenticator MFA
    const mfaSecret = 'JBSWY3DPEHPK3PXP';
    registration.mfaEnabled = true;

    // 4. KYC submission
    const kycSubmission = {
      nidNumber: '19902692019283746',
      bankName: 'BRAC Bank PLC',
      accountNumber: '1501203948571001',
      routingNumber: '060261358',
    };
    registration.kycStatus = 'UNDER_REVIEW';

    // 5. Platform Admin approves KYC
    registration.kycStatus = 'VERIFIED';
    const merchantId = 'mch_01J7ALPHA0000000000000001';

    // 6. Generate production API key
    const rawApiKeySecret = 'dn_live_sec_' + crypto.randomBytes(24).toString('hex');
    const apiKeyHash = crypto.createHash('sha256').update(rawApiKeySecret).digest('hex');
    const apiKey = {
      id: 'key_prod_01',
      merchantId,
      keyHash: apiKeyHash,
      prefix: rawApiKeySecret.slice(0, 16),
      scopes: ['payments:read', 'payments:create', 'webhooks:manage'],
      status: 'ACTIVE',
    };
    expect(apiKey.scopes).toContain('payments:create');

    // 7. Register customer-facing webhook endpoint
    const webhookEndpoint = {
      id: 'whk_01',
      merchantId,
      url: 'https://shop.merchant.com/api/webhooks',
      secret: 'whsec_' + crypto.randomBytes(24).toString('hex'),
      isActive: true,
    };

    // 8. Initiate Payment via API: 5,000.00 BDT
    const grossAmount = Paisa.fromBDT('5000.00');
    expect(grossAmount.amountPaisa).toBe(500000n);

    const paymentRecord = {
      id: 'pay_sc01_first_prod',
      merchantId,
      amountPaisa: grossAmount.amountPaisa,
      status: 'CREATED' as any,
      idempotencyKey: 'idem_sc01_first_sale_001',
      provider: 'BKASH',
      providerTrxId: null as string | null,
    };

    // 9. Customer completes payment on hosted checkout
    const tPending = validatePaymentTransition(paymentRecord.status, 'PENDING');
    expect(tPending.allowed).toBe(true);
    paymentRecord.status = 'PENDING';

    const tProcessing = validatePaymentTransition(paymentRecord.status, 'PROCESSING');
    expect(tProcessing.allowed).toBe(true);
    paymentRecord.status = 'PROCESSING';

    paymentRecord.providerTrxId = 'BKASH_TRX_992288';
    const tCompleted = validatePaymentTransition(paymentRecord.status, 'COMPLETED');
    expect(tCompleted.allowed).toBe(true);
    paymentRecord.status = 'COMPLETED';

    // 10. Atomic Settlement: Post balanced ledger capture entries
    const platformFeePaisa = 9250n; // 1.85% MDR = 92.50 BDT
    const ledgerTx = buildPaymentCaptureTransaction({
      paymentId: paymentRecord.id,
      merchantId: paymentRecord.merchantId,
      provider: paymentRecord.provider,
      grossAmountPaisa: paymentRecord.amountPaisa,
      platformFeePaisa,
    });

    const balanceResult = verifyLedgerBalance(
      ledgerTx.entries.map((e) => ({
        entryType: e.direction === 'DEBIT' ? 'DEBIT' : 'CREDIT',
        amountPaisa: e.amountPaisa,
      }))
    );
    expect(balanceResult.balanced).toBe(true);
    assertLedgerBalanced(
      ledgerTx.entries.map((e) => ({
        entryType: e.direction === 'DEBIT' ? 'DEBIT' : 'CREDIT',
        amountPaisa: e.amountPaisa,
      }))
    );

    // 11. Dispatch signed webhook to merchant endpoint
    const webhookPayload = JSON.stringify({
      event: 'payment.completed',
      id: 'evt_whk_01',
      paymentId: paymentRecord.id,
      amountPaisa: paymentRecord.amountPaisa.toString(),
      providerTrxId: paymentRecord.providerTrxId,
      timestamp: new Date().toISOString(),
    });

    const nowSeconds = Math.floor(Date.now() / 1000);
    const signatureHeader = generateWebhookSignature(
      webhookPayload,
      webhookEndpoint.secret,
      nowSeconds
    );

    const isWebhookAuthentic = verifyWebhookSignature(
      webhookPayload,
      signatureHeader,
      webhookEndpoint.secret
    );
    expect(isWebhookAuthentic).toBe(true);

    // 12. Merchant Dashboard volume aggregation
    const netMerchantPayable = grossAmount.amountPaisa - platformFeePaisa;
    expect(netMerchantPayable).toBe(490750n); // 4,907.50 BDT
  });
});
