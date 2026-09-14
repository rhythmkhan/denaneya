import { describe, it, expect } from 'vitest';
import { Paisa, validatePaymentTransition } from '@denaneya/payment-core';
import { parseMfsSms, BalanceChainEngine } from '@denaneya/sms-parser';
import {
  signDevicePayload,
  verifyDevicePayload,
} from '../helpers/signature-helper.js';
import { EC_P256_TEST_KEY } from '../fixtures/crypto-keys.js';
import { buildPaymentCaptureTransaction } from '@denaneya/ledger';
import { verifyLedgerBalance } from '../helpers/ledger-verifier.js';

describe('Tier 4: Workload Scenario 02 — Retail Store Cashier MFS QR via Android Collector', () => {
  /**
   * E2E-T4-SC-02: Retail Store Cashier MFS QR Payment via Android Collector
   * POS terminal creates dynamic QR -> Customer pays via bKash -> Android collector intercepts SMS ->
   * Signs with Keystore -> Server verifies ECDSA -> Balance-chain checked -> Matches POS session -> Settle
   */
  it('E2E-T4-SC-02: Retail Store Cashier MFS QR Payment via Android Collector', () => {
    // 1. Device paired at counter
    const device = {
      id: 'dev_pos_bashundhara_01',
      merchantId: 'mch_retail_clothier_01',
      publicKeyPem: EC_P256_TEST_KEY.publicKeyPem,
      status: 'ACTIVE',
      simSlot0Number: '01711998877',
      lastMonotonicSequence: 400,
    };

    // 2. POS creates dynamic QR payment session for 2,450.00 BDT
    const qrAmount = Paisa.fromBDT('2450.00');
    expect(qrAmount.amountPaisa).toBe(245000n);

    const posSession = {
      id: 'sess_pos_qr_2450',
      merchantId: device.merchantId,
      amountPaisa: qrAmount.amountPaisa,
      status: 'PENDING' as any,
      matchedTrxId: null as string | null,
    };

    // 3. Customer pays to merchant SIM; SIM receives SMS
    const rawSms =
      'You have received Tk 2,450.00 from 01711223344. Fee Tk 0.00. Balance Tk 14,950.00. TrxID 9KPOS12345 at 13/09/2026 16:20';

    // 4. Android Collector signs payload with hardware Keystore
    const sequenceNumber = 401;
    const timestamp = new Date().toISOString();
    const eventPayload = {
      deviceId: device.id,
      sequenceNumber,
      timestamp,
      rawSms,
      sender: 'bKash',
      simSlot: 0,
      nonce: 'nonce_pos_' + Date.now(),
    };

    const signature = signDevicePayload(eventPayload, EC_P256_TEST_KEY.privateKeyPem);

    // 5. Server validates signature & monotonic sequence
    const isSignatureValid = verifyDevicePayload(eventPayload, signature, device.publicKeyPem);
    expect(isSignatureValid).toBe(true);

    expect(sequenceNumber).toBeGreaterThan(device.lastMonotonicSequence);
    device.lastMonotonicSequence = sequenceNumber;

    // 6. SMS parser extracts TrxID and amount
    const parsed = parseMfsSms(eventPayload.sender, eventPayload.rawSms);
    expect(parsed.status).toBe('SUCCESS');
    expect(parsed.trxId).toBe('9KPOS12345');
    expect(parsed.amountPaisa.amountPaisa).toBe(245000n);

    // 7. Balance-chain continuity check (baseline was 12,500.00 BDT: 12500 + 2450 = 14950)
    const chainVerification = BalanceChainEngine.verify({
      walletId: 'wlt_sim0_pos',
      incomingSms: parsed,
      previousBalancePaisa: Paisa.fromBDT('12500.00'),
    });
    expect(chainVerification.status).toBe('VERIFIED');
    expect(chainVerification.isDiscontinuity).toBe(false);
    expect(chainVerification.expectedNewBalancePaisa?.toBDT()).toBe('14950.00');

    // 8. Match incoming transaction against pending POS checkout session
    if (parsed.amountPaisa.amountPaisa === posSession.amountPaisa) {
      posSession.matchedTrxId = parsed.trxId;
      const tProcessing = validatePaymentTransition(posSession.status, 'PROCESSING');
      expect(tProcessing.allowed).toBe(true);
      posSession.status = 'PROCESSING';

      const tCompleted = validatePaymentTransition(posSession.status, 'COMPLETED');
      expect(tCompleted.allowed).toBe(true);
      posSession.status = 'COMPLETED';
    }

    expect(posSession.status).toBe('COMPLETED');
    expect(posSession.matchedTrxId).toBe('9KPOS12345');

    // 9. Post ledger settlement
    const ledgerTx = buildPaymentCaptureTransaction({
      paymentId: posSession.id,
      merchantId: posSession.merchantId,
      provider: 'BKASH',
      grossAmountPaisa: posSession.amountPaisa,
      platformFeePaisa: 4533n, // 1.85% MDR
    });

    const v = verifyLedgerBalance(
      ledgerTx.entries.map((e) => ({
        entryType: e.direction === 'DEBIT' ? 'DEBIT' : 'CREDIT',
        amountPaisa: e.amountPaisa,
      }))
    );
    expect(v.balanced).toBe(true);
  });
});
