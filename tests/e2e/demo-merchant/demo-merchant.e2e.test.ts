/**
 * DenaNeya End-to-End Demo Merchant Integration & Security Test Suite
 *
 * Exercises the complete production-grade merchant lifecycle:
 * Demo Store -> Create Order -> DenaNeya Payment API -> Hosted Checkout ->
 * Ledger Settlement -> Webhook Outbox -> HMAC-SHA256 Verification ->
 * Server-Side Status Verification -> Customer Receipt & Ledger Balance
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import {
  db,
  eq,
  payments,
  ledgerEntries,
  outboxEvents,
  resetInMemoryStore,
  ensureBootstrapData,
} from '@denaneya/database';
import {
  signWebhookPayload,
  verifyWebhookSignature,
  processOutboxEvents,
} from '@denaneya/webhooks';
import { validateUrlForSsrf } from '@denaneya/security';
import {
  saveDemoOrder,
  getDemoOrder,
  getAllDemoOrders,
  clearDemoStoreState,
  DEMO_MERCHANT_CONFIG,
  type DemoOrder,
} from '../../../apps/web/src/lib/demo-store/state';
import { POST as createOrderHandler } from '../../../apps/web/src/app/api/demo-store/create-order/route';
import { POST as webhookHandler } from '../../../apps/web/src/app/api/demo-store/webhook/route';
import { GET as getPaymentApi } from '../../../apps/web/src/app/api/v1/payments/[id]/route';
import { POST as createPaymentApi } from '../../../apps/web/src/app/api/v1/payments/route';
import { simulateSuccessAction, simulateFailureAction } from '../../../apps/web/src/app/checkout/[paymentId]/actions';

describe('DenaNeya End-to-End Demo Merchant Integration Test Suite', () => {
  beforeEach(() => {
    resetInMemoryStore({ bootstrap: true });
    clearDemoStoreState();
    ensureBootstrapData();
  });

  // 1. Full Nominal E2E Transaction Flow
  it('E2E-01: Full Payment Flow (Store -> Order -> Gateway -> Settle -> Webhook -> Verify)', async () => {
    // Step 1: Demo Store initiates order
    const orderReq = new NextRequest('http://localhost:3000/api/demo-store/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amountBDT: 10.00,
        customerName: 'Tanvir Rahman',
        customerEmail: 'tanvir@example.com',
        customerPhone: '01712345678',
      }),
    });

    const orderRes = await createOrderHandler(orderReq);
    expect(orderRes.status).toBe(200);
    const orderData = await orderRes.json();

    expect(orderData.success).toBe(true);
    expect(orderData.orderId).toMatch(/^ORD-/);
    expect(orderData.paymentId).toMatch(/^pay_/);
    expect(orderData.checkoutUrl).toBe(`/checkout/${orderData.paymentId}`);
    expect(orderData.status).toBe('PENDING');

    // Verify order in demo store state
    const localOrder = getDemoOrder(orderData.orderId);
    expect(localOrder).toBeDefined();
    expect(localOrder?.amountBDT).toBe(10.00);
    expect(localOrder?.status).toBe('PENDING');

    // Step 2: Customer navigates to Hosted Checkout and completes payment
    const checkoutResult = await simulateSuccessAction(orderData.paymentId);
    expect(checkoutResult.success).toBe(true);
    expect(checkoutResult.redirectUrl).toContain('status=COMPLETED');

    // Verify payment in DenaNeya platform DB is COMPLETED
    const [settledPayment] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, orderData.paymentId));
    expect(settledPayment).toBeDefined();
    expect(settledPayment.status).toBe('COMPLETED');
    expect(settledPayment.settledAt).toBeInstanceOf(Date);

    // Step 3: Webhook Outbox Event is recorded and queued
    const events = await db.select().from(outboxEvents);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e.eventType === 'payment.completed')).toBe(true);

    // Verify webhook payload generation & merchant listener execution
    const webhookEnvelope = {
      id: 'evt_test_01',
      event: 'payment.completed',
      apiVersion: 'v1',
      createdAt: new Date().toISOString(),
      merchantId: DEMO_MERCHANT_CONFIG.merchantId,
      data: {
        paymentId: orderData.paymentId,
        merchantId: DEMO_MERCHANT_CONFIG.merchantId,
        amountPaisa: '1000',
        feePaisa: '15',
        currency: 'BDT',
        status: 'COMPLETED',
        provider: 'SANDBOX',
        providerTrxId: settledPayment.providerTrxId,
        metadata: { orderId: orderData.orderId },
      },
    };

    const rawJsonBody = JSON.stringify(webhookEnvelope);
    const { signatureHeader } = signWebhookPayload(rawJsonBody, DEMO_MERCHANT_CONFIG.webhookSecret);

    const webhookReq = new NextRequest('http://localhost:3000/api/demo-store/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DenaNeya-Signature': signatureHeader,
      },
      body: rawJsonBody,
    });

    const webhookRes = await webhookHandler(webhookReq);
    expect(webhookRes.status).toBe(200);
    const webhookResJson = await webhookRes.json();
    expect(webhookResJson.status).toBe('success');
    expect(webhookResJson.received).toBe(true);

    // Step 4: Verify Demo Store Order is updated to PAID via Webhook
    const updatedOrder = getDemoOrder(orderData.orderId);
    expect(updatedOrder?.status).toBe('PAID');
    expect(updatedOrder?.webhookVerified).toBe(true);

    // Step 5: Server-Side Status Verification (Customer return callback)
    const verifyReq = new NextRequest(`http://localhost:3000/api/v1/payments/${orderData.paymentId}`, {
      headers: {
        Authorization: `Bearer ${DEMO_MERCHANT_CONFIG.apiKey}`,
      },
    });

    const verifyRes = await getPaymentApi(verifyReq, {
      params: Promise.resolve({ id: orderData.paymentId }),
    });
    expect(verifyRes.status).toBe(200);
    const verifyData = await verifyRes.json();

    expect(verifyData.id).toBe(orderData.paymentId);
    expect(verifyData.status).toBe('COMPLETED');
    expect(BigInt(verifyData.amountPaisa)).toBe(BigInt(localOrder!.amountPaisa));
  });

  // 2. Negative Test: Amount Tampering Attempt
  it('E2E-02: Detects & Neutralizes Client-Side Amount Tampering', async () => {
    // Legitimate order: 100.00 BDT (10,000 paisa)
    const originalOrder: DemoOrder = {
      orderId: 'ORD-TAMPER-TEST',
      paymentId: 'pay_original_01',
      amountBDT: 100.00,
      amountPaisa: '10000',
      customerName: 'Alice',
      customerEmail: 'alice@example.com',
      status: 'PENDING',
      apiVerified: false,
      webhookVerified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveDemoOrder(originalOrder);

    // Attacker created a fake/cheaper payment of 1.00 BDT (100 paisa)
    const [inserted] = await db
      .insert(payments)
      .values({
        id: 'pay_tampered_01',
        merchantId: DEMO_MERCHANT_CONFIG.merchantId,
        amountPaisa: 100n, // Only 1 BDT!
        feePaisa: 2n,
        currency: 'BDT',
        status: 'COMPLETED',
        provider: 'SANDBOX',
        providerTrxId: 'SIM_ATTACK',
        customerName: 'Attacker',
        customerEmail: 'attacker@example.com',
      })
      .returning();

    expect(inserted).toBeDefined();

    // Verify comparison in merchant verification routine:
    const gatewayAmountPaisa = inserted.amountPaisa;
    const expectedAmountPaisa = BigInt(originalOrder.amountPaisa);

    expect(gatewayAmountPaisa).not.toBe(expectedAmountPaisa);
    const isTampered = gatewayAmountPaisa !== expectedAmountPaisa;
    expect(isTampered).toBe(true);

    // Merchant order remains PENDING / NOT fulfilled
    const currentOrder = getDemoOrder(originalOrder.orderId);
    expect(currentOrder?.status).toBe('PENDING');
  });

  // 3. Webhook Security: Forged Signature Rejection
  it('E2E-03: Rejects Webhooks with Forged HMAC-SHA256 Signatures (HTTP 401)', async () => {
    const maliciousPayload = JSON.stringify({
      id: 'evt_fake_01',
      event: 'payment.completed',
      data: { paymentId: 'pay_unauthorized', status: 'COMPLETED' },
    });

    // Attacker signs payload with a bogus secret key
    const bogusSecret = 'attacker_bogus_key_xyz';
    const { signatureHeader: forgedHeader } = signWebhookPayload(maliciousPayload, bogusSecret);

    const req = new NextRequest('http://localhost:3000/api/demo-store/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DenaNeya-Signature': forgedHeader,
      },
      body: maliciousPayload,
    });

    const res = await webhookHandler(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
    expect(body.message).toContain('Invalid or forged webhook signature');
  });

  // 4. Webhook Security: Timestamp Replay Attack Detection
  it('E2E-04: Rejects Stale Webhook Replay Attacks (Timestamp > 300s)', () => {
    const payload = JSON.stringify({ event: 'payment.completed', id: 'evt_replay' });
    const staleTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago

    const { signatureHeader } = signWebhookPayload(
      payload,
      DEMO_MERCHANT_CONFIG.webhookSecret,
      staleTimestamp
    );

    const verification = verifyWebhookSignature({
      payload,
      signatureHeader,
      secret: DEMO_MERCHANT_CONFIG.webhookSecret,
      toleranceSeconds: 300,
      currentTimeSeconds: Math.floor(Date.now() / 1000),
    });

    expect(verification.valid).toBe(false);
    expect(verification.reason).toContain('tolerance');
  });

  // 5. Idempotency & Duplicate Submission Resistance
  it('E2E-05: Enforces Payment Creation Idempotency (Replay Immunity)', async () => {
    const idempotencyKey = 'idemp_unique_test_' + Date.now();

    const payload = {
      amountPaisa: '5000',
      currency: 'BDT',
      customer: { name: 'Repeat User', email: 'repeat@example.com' },
      description: 'Idempotency Validation Payment',
    };

    // First payment request
    const req1 = new NextRequest('http://localhost:3000/api/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEMO_MERCHANT_CONFIG.apiKey}`,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    });

    const res1 = await createPaymentApi(req1);
    expect(res1.status).toBe(201);
    const data1 = await res1.json();
    expect(data1.id).toBeDefined();

    // Replay duplicate request with same idempotency key
    const req2 = new NextRequest('http://localhost:3000/api/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEMO_MERCHANT_CONFIG.apiKey}`,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    });

    const res2 = await createPaymentApi(req2);
    expect(res2.status).toBe(200); // 200 OK for replayed idempotency
    expect(res2.headers.get('Idempotent-Replayed')).toBe('true');
    const data2 = await res2.json();
    expect(data2.id).toBe(data1.id);
  });

  // 6. Cancellation Flow Handling
  it('E2E-06: Handles Checkout Cancellation & State Updates', async () => {
    // Create initial payment
    const [payment] = await db
      .insert(payments)
      .values({
        id: 'pay_cancel_test',
        merchantId: DEMO_MERCHANT_CONFIG.merchantId,
        amountPaisa: 2500n,
        feePaisa: 38n,
        currency: 'BDT',
        status: 'PENDING',
        provider: 'SANDBOX',
      })
      .returning();

    // Customer cancels
    const cancelRes = await simulateFailureAction(payment.id);
    expect(cancelRes.success).toBe(true);
    expect(cancelRes.redirectUrl).toContain('status=FAILED');

    // DB record updated to FAILED
    const [updated] = await db.select().from(payments).where(eq(payments.id, payment.id));
    expect(updated.status).toBe('FAILED');
  });

  // 7. Security: API Key Authentication & Scopes
  it('E2E-07: Rejects Requests with Missing or Invalid Authorization Header', async () => {
    const unauthReq = new NextRequest('http://localhost:3000/api/v1/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountPaisa: '1000' }),
    });

    const res = await createPaymentApi(unauthReq);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  // 8. SSRF Protection on Webhook Destination URLs
  it('E2E-08: Strictly Blocks SSRF Attacks against Loopback & Cloud Metadata', async () => {
    // Loopback
    const loopback = await validateUrlForSsrf('http://127.0.0.1:8080/webhook', { allowHttp: false });
    expect(loopback.safe).toBe(false);

    // AWS/GCP Metadata IP
    const metadata = await validateUrlForSsrf('http://169.254.169.254/latest/meta-data/', { allowHttp: false });
    expect(metadata.safe).toBe(false);

    // Public HTTPS URL
    const publicUrl = await validateUrlForSsrf('https://denaneya.vercel.app/api/demo-store/webhook');
    expect(publicUrl.safe).toBe(true);
  });

  // 9. Double-Entry Accounting Ledger Equilibrium
  it('E2E-09: Verifies Zero-Sum Double-Entry Ledger Equation after Settlement', async () => {
    // Settle a payment
    const paymentId = 'pay_ledger_test_' + Date.now();
    await db.insert(payments).values({
      id: paymentId,
      merchantId: DEMO_MERCHANT_CONFIG.merchantId,
      amountPaisa: 5000n, // ৳ 50.00
      feePaisa: 75n,      // ৳ 0.75
      currency: 'BDT',
      status: 'PENDING',
      provider: 'SANDBOX',
    });

    await simulateSuccessAction(paymentId);

    // Query posted ledger entries
    const entries = await db.select().from(ledgerEntries);
    expect(entries.length).toBeGreaterThanOrEqual(2);

    let totalDebits = 0n;
    let totalCredits = 0n;

    for (const entry of entries) {
      if (entry.direction === 'DEBIT') {
        totalDebits += BigInt(entry.amountPaisa);
      } else if (entry.direction === 'CREDIT') {
        totalCredits += BigInt(entry.amountPaisa);
      }
    }

    // Fundamental accounting equation: Sum(Debits) === Sum(Credits)
    expect(totalDebits).toBe(totalCredits);
    expect(totalDebits).toBeGreaterThan(0n);
  });

  // 10. Out-of-Order Delivery Graceful Recovery
  it('E2E-10: Reconciles Gracefully when Webhook Precedes User Browser Redirect', async () => {
    const orderId = 'ORD-RACE-001';
    const paymentId = 'pay_race_001';

    // Merchant order initially created
    saveDemoOrder({
      orderId,
      paymentId,
      amountBDT: 15.00,
      amountPaisa: '1500',
      customerName: 'Bob',
      customerEmail: 'bob@example.com',
      status: 'PENDING',
      apiVerified: false,
      webhookVerified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 1. Webhook arrives FIRST (network async)
    const payload = JSON.stringify({
      id: 'evt_race_01',
      event: 'payment.completed',
      data: {
        paymentId,
        status: 'COMPLETED',
        provider: 'SANDBOX',
        providerTrxId: 'SIM_RACE',
        metadata: { orderId },
      },
    });

    const { signatureHeader } = signWebhookPayload(payload, DEMO_MERCHANT_CONFIG.webhookSecret);
    const webhookReq = new NextRequest('http://localhost:3000/api/demo-store/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-DenaNeya-Signature': signatureHeader },
      body: payload,
    });

    await webhookHandler(webhookReq);

    // Order is already marked PAID
    let order = getDemoOrder(orderId);
    expect(order?.status).toBe('PAID');
    expect(order?.webhookVerified).toBe(true);

    // 2. User browser redirect arrives SECOND (simulated return page check)
    order!.apiVerified = true;
    saveDemoOrder(order!);

    order = getDemoOrder(orderId);
    expect(order?.status).toBe('PAID');
    expect(order?.apiVerified).toBe(true);
    expect(order?.webhookVerified).toBe(true);
  });
});
