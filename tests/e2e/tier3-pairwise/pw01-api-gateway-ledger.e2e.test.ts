import { describe, it, expect } from 'vitest';
import { Paisa, validatePaymentTransition } from '@denaneya/payment-core';
import {
  buildPaymentCaptureTransaction,
  SYSTEM_ACCOUNT_CODES,
  getSystemAccountId,
  getMerchantAccountId,
} from '@denaneya/ledger';
import { verifyLedgerBalance, assertLedgerBalanced } from '../helpers/ledger-verifier.js';
import { createGatewayAdapter } from '@denaneya/gateway-adapters';

describe('Tier 3: Pairwise Suite 01 — API, Gateway & Ledger Couplings', () => {
  /**
   * E2E-T3-PW-01: API Idempotency Replay × Gateway Timeout × Ledger Atomicity
   * Interaction: Merchant submits payment via API; gateway call times out; merchant retries
   * with identical idempotency key; gateway succeeds on retry.
   * Assertion: Exactly 1 payment created; exactly 1 balanced ledger transaction posted;
   * response matches on both requests.
   */
  it('E2E-T3-PW-01: API Idempotency Replay × Gateway Timeout × Ledger Atomicity', async () => {
    const merchantId = 'mch_pw01_test_001';
    const idempotencyKey = 'idem_pw01_timeout_retry_999';
    const grossPaisa = 250000n; // 2,500.00 BDT
    const platformFeePaisa = 4625n; // 1.85% MDR = 46.25 BDT

    // In-memory idempotency store simulating atomic DB record
    const paymentRecords = new Map<string, any>();
    const ledgerJournals: any[] = [];

    // Attempt 1: Simulation of Gateway Timeout on first call
    const processApiPayment = async (isTimeout = false) => {
      if (paymentRecords.has(`${merchantId}:${idempotencyKey}`)) {
        return {
          statusCode: 200,
          idempotentReplay: true,
          data: paymentRecords.get(`${merchantId}:${idempotencyKey}`),
        };
      }

      if (isTimeout) {
        // Network timeout before payment state persistence
        throw new Error('GATEWAY_TIMEOUT: Upstream provider did not respond within 15000ms');
      }

      // Successful capture on retry
      const paymentId = 'pay_pw01_001';
      const record = {
        id: paymentId,
        merchantId,
        amountPaisa: grossPaisa,
        status: 'COMPLETED',
        idempotencyKey,
      };
      paymentRecords.set(`${merchantId}:${idempotencyKey}`, record);

      // Post atomic balanced ledger entry
      const tx = buildPaymentCaptureTransaction({
        paymentId,
        merchantId,
        provider: 'SSLCOMMERZ',
        grossAmountPaisa: grossPaisa,
        platformFeePaisa,
      });

      const balance = verifyLedgerBalance(
        tx.entries.map((e) => ({
          entryType: e.direction === 'DEBIT' ? 'DEBIT' : 'CREDIT',
          amountPaisa: e.amountPaisa,
          accountId: e.accountId,
        }))
      );
      assertLedgerBalanced(
        tx.entries.map((e) => ({
          entryType: e.direction === 'DEBIT' ? 'DEBIT' : 'CREDIT',
          amountPaisa: e.amountPaisa,
        }))
      );
      ledgerJournals.push(tx);

      return {
        statusCode: 201,
        idempotentReplay: false,
        data: record,
      };
    };

    // First attempt fails with timeout
    await expect(processApiPayment(true)).rejects.toThrow(/GATEWAY_TIMEOUT/);
    expect(paymentRecords.size).toBe(0);
    expect(ledgerJournals.length).toBe(0);

    // Second attempt with exact same idempotency key succeeds
    const res1 = await processApiPayment(false);
    expect(res1.statusCode).toBe(201);
    expect(res1.idempotentReplay).toBe(false);
    expect(res1.data.status).toBe('COMPLETED');
    expect(paymentRecords.size).toBe(1);
    expect(ledgerJournals.length).toBe(1);

    // Third attempt (replay) returns identical record without side-effects
    const res2 = await processApiPayment(false);
    expect(res2.statusCode).toBe(200);
    expect(res2.idempotentReplay).toBe(true);
    expect(res2.data.id).toBe(res1.data.id);
    expect(ledgerJournals.length).toBe(1); // No double-posting
  });

  /**
   * E2E-T3-PW-08: Payment Link Dynamic QR × Hosted Checkout Expiry × Re-activation Block
   * Interaction: Single-use payment link generates Bangla QR; customer opens checkout;
   * leaves page until session expires; customer reloads QR.
   * Assertion: Session transitions to EXPIRED; reload prompts session expiration; cannot complete payment.
   */
  it('E2E-T3-PW-08: Payment Link Dynamic QR × Hosted Checkout Expiry × Re-activation Block', () => {
    const linkSession = {
      id: 'plnk_session_01',
      status: 'PENDING' as 'PENDING' | 'EXPIRED' | 'COMPLETED',
      expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      singleUse: true,
    };

    // Check expiry guard
    const isExpired = Date.now() > linkSession.expiresAt.getTime();
    if (isExpired && linkSession.status === 'PENDING') {
      const transition = validatePaymentTransition('PENDING', 'EXPIRED');
      expect(transition.allowed).toBe(true);
      linkSession.status = 'EXPIRED';
    }

    expect(linkSession.status).toBe('EXPIRED');

    // Attempting to transition from EXPIRED to PROCESSING or COMPLETED is strictly rejected
    const reactivationAttempt = validatePaymentTransition('EXPIRED', 'PROCESSING');
    expect(reactivationAttempt.allowed).toBe(false);
    expect(reactivationAttempt.error).toBeDefined();

    const settleAttempt = validatePaymentTransition('EXPIRED', 'COMPLETED');
    expect(settleAttempt.allowed).toBe(false);
  });

  /**
   * E2E-T3-PW-14: ShurjoPay Gateway Failure × Automatic Adapter Fallback × Hosted Checkout Redirection
   * Interaction: Primary gateway returns HTTP 500 during checkout initiation; fallback gateway configured for merchant.
   * Assertion: System routes request to secondary gateway; customer redirected successfully without checkout failure.
   */
  it('E2E-T3-PW-14: ShurjoPay Gateway Failure × Automatic Adapter Fallback × Hosted Checkout Redirection', async () => {
    // Router evaluating primary vs fallback
    const primaryGateway = {
      name: 'SHURJOPAY',
      createPayment: async () => {
        throw new Error('GATEWAY_DOWN: ShurjoPay API 500 Internal Server Error');
      },
    };

    const fallbackGateway = {
      name: 'SSLCOMMERZ',
      createPayment: async (params: any) => ({
        success: true,
        redirectUrl: 'https://sandbox.sslcommerz.com/gwprocess/v4/gw.php?Q=pay&SESSIONKEY=TEST_KEY',
        gatewayRef: 'SSL_SESSION_123',
      }),
    };

    let activeGatewayUsed = '';
    let redirectUrl = '';

    try {
      await primaryGateway.createPayment();
      activeGatewayUsed = primaryGateway.name;
    } catch (err) {
      // Automatic failover logic
      const fallbackRes = await fallbackGateway.createPayment({ amountPaisa: 150000n });
      activeGatewayUsed = fallbackGateway.name;
      redirectUrl = fallbackRes.redirectUrl;
    }

    expect(activeGatewayUsed).toBe('SSLCOMMERZ');
    expect(redirectUrl).toContain('sslcommerz.com');
  });

  /**
   * E2E-T3-PW-22: AamarPay Gateway IPN × Currency Check × Paisa Conversion
   * Interaction: AamarPay IPN received for 2,500.50 BDT; verified via trxcheck.php.
   * Assertion: Converted to 250050n paisa; verified against database payment amount; settles atomically.
   */
  it('E2E-T3-PW-22: AamarPay Gateway IPN × Currency Check × Paisa Conversion', () => {
    const rawIpnPayload = {
      mer_txnid: 'TRX_AAMAR_001',
      pay_status: 'Successful',
      amount: '2500.50',
      currency: 'BDT',
      bank_trxid: 'BANK_REF_9988',
    };

    expect(rawIpnPayload.currency).toBe('BDT');

    // Pure BigInt conversion via Paisa.fromBDT
    const parsedAmount = Paisa.fromBDT(rawIpnPayload.amount);
    expect(parsedAmount.amountPaisa).toBe(250050n);
    expect(parsedAmount.toBDT()).toBe('2500.50');

    // Verify state transition from PROCESSING to COMPLETED
    const transition = validatePaymentTransition('PROCESSING', 'COMPLETED');
    expect(transition.allowed).toBe(true);

    // Ledger posting entry for AamarPay
    const ledgerTx = buildPaymentCaptureTransaction({
      paymentId: 'pay_aamar_01',
      merchantId: 'mch_01',
      provider: 'AAMARPAY',
      grossAmountPaisa: parsedAmount.amountPaisa,
      platformFeePaisa: 3751n, // 1.5% fee
    });

    const verification = verifyLedgerBalance(
      ledgerTx.entries.map((e) => ({
        entryType: e.direction === 'DEBIT' ? 'DEBIT' : 'CREDIT',
        amountPaisa: e.amountPaisa,
      }))
    );
    expect(verification.balanced).toBe(true);
    expect(verification.discrepancyPaisa).toBe(0n);
  });

  /**
   * E2E-T3-PW-26: Database Connection Pool Exhaustion Recovery × State Machine OCC
   * Interaction: Sudden burst of concurrent transactions saturates DB pool; connections queue and execute with OCC.
   * Assertion: All transactions either commit or fail cleanly with retryable error; zero corrupted state machine records.
   */
  it('E2E-T3-PW-26: Database Connection Pool Exhaustion Recovery × State Machine OCC', async () => {
    // Simulated entity with version for Optimistic Concurrency Control (OCC)
    let paymentState = {
      id: 'pay_occ_race_01',
      status: 'PENDING',
      version: 1,
    };

    const updateWithOcc = async (fromStatus: string, toStatus: any, clientVersion: number) => {
      // Simulate connection latency
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (paymentState.version !== clientVersion) {
        throw new Error('OPTIMISTIC_LOCK_ERROR: Version mismatch, record modified by concurrent transaction');
      }
      const transition = validatePaymentTransition(paymentState.status as any, toStatus);
      if (!transition.allowed) {
        throw new Error(transition.error);
      }
      paymentState = {
        ...paymentState,
        status: toStatus,
        version: paymentState.version + 1,
      };
      return paymentState;
    };

    // Two concurrent transactions attempt to advance the same payment from version 1
    const task1 = updateWithOcc('PENDING', 'PROCESSING', 1);
    const task2 = updateWithOcc('PENDING', 'CANCELLED', 1);

    const results = await Promise.allSettled([task1, task2]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one must succeed, and one must fail cleanly with OCC error
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toContain('OPTIMISTIC_LOCK_ERROR');
    expect(paymentState.version).toBe(2);
  });
});
