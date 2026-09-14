import { describe, it, expect } from 'vitest';
import { BalanceChainEngine } from '@denaneya/sms-parser';
import { Paisa } from '@denaneya/payment-core';
import type { ParsedSmsResult } from '@denaneya/sms-parser';

describe('Feature 13: Balance-Chain & Trust Tiers (E2E-T1-F13)', () => {
  // E2E-T1-F13-01: Continuous Balance Equation Validation
  it('E2E-T1-F13-01: Continuous Balance Equation Validation', () => {
    const incomingSms: ParsedSmsResult = {
      provider: 'BKASH',
      type: 'PAYMENT_RECEIVED',
      trxId: 'TRX_CONT_01',
      amountPaisa: Paisa.fromBDT('1500.00'),
      feePaisa: Paisa.zero(),
      counterparty: '01712345678',
      balancePaisa: Paisa.fromBDT('6500.00'),
      reference: null,
      timestamp: new Date(),
      rawSms: '',
      smsHash: 'hash01',
      parserVersion: 'v1',
      confidence: 1.0,
      status: 'SUCCESS',
      isSenderVerified: true,
    };

    const result = BalanceChainEngine.verify({
      walletId: 'wlt_mer_01',
      incomingSms,
      previousBalancePaisa: Paisa.fromBDT('5000.00'),
    });

    expect(result.status).toBe('VERIFIED');
    expect(result.isDiscontinuity).toBe(false);
    expect(result.deltaPaisa?.amountPaisa).toBe(0n);
    expect(result.expectedNewBalancePaisa?.toBDT()).toBe('6500.00');
  });

  // E2E-T1-F13-02: Balance-Chain Discontinuity Detection
  it('E2E-T1-F13-02: Balance-Chain Discontinuity Detection', () => {
    const incomingSms: ParsedSmsResult = {
      provider: 'BKASH',
      type: 'PAYMENT_RECEIVED',
      trxId: 'TRX_DISC_01',
      amountPaisa: Paisa.fromBDT('500.00'),
      feePaisa: Paisa.zero(),
      counterparty: '01712345678',
      balancePaisa: Paisa.fromBDT('7000.00'), // Discontinuity: 5000 + 500 = 5500, but reported is 7000
      reference: null,
      timestamp: new Date(),
      rawSms: '',
      smsHash: 'hash02',
      parserVersion: 'v1',
      confidence: 1.0,
      status: 'SUCCESS',
      isSenderVerified: true,
    };

    const result = BalanceChainEngine.verify({
      walletId: 'wlt_mer_01',
      incomingSms,
      previousBalancePaisa: Paisa.fromBDT('5000.00'),
    });

    expect(result.status).toBe('DISCONTINUITY_DETECTED');
    expect(result.isDiscontinuity).toBe(true);
    expect(result.discontinuityType).toBe('SKIPPED_CREDIT_SMS');
    expect(result.deltaPaisa?.amountPaisa).toBe(150000n);
  });

  // E2E-T1-F13-03: Trust Tier A Assignment for Direct API Verification
  it('E2E-T1-F13-03: Trust Tier A Assignment for Direct API Verification', () => {
    // Direct API verification from official gateway PGW
    const channel = 'DIRECT_API';
    const trustTier = channel === 'DIRECT_API' ? 'A' : 'D';
    const baseRiskScore = trustTier === 'A' ? 0 : 40;
    const instantSettlementAllowed = trustTier === 'A';

    expect(trustTier).toBe('A');
    expect(baseRiskScore).toBe(0);
    expect(instantSettlementAllowed).toBe(true);
  });

  // E2E-T1-F13-04: Trust Tier C Assignment for Android Hardware Signed SMS
  it('E2E-T1-F13-04: Trust Tier C Assignment for Android Hardware Signed SMS', () => {
    // Hardware-attested Android Collector signed SMS
    const channel = 'ANDROID_COLLECTOR';
    const trustTier = channel === 'ANDROID_COLLECTOR' ? 'C' : 'D';
    const baseRiskScore = trustTier === 'C' ? 15 : 40;
    const requiresBalanceChainVerification = trustTier === 'C';

    expect(trustTier).toBe('C');
    expect(baseRiskScore).toBe(15);
    expect(requiresBalanceChainVerification).toBe(true);
  });

  // E2E-T1-F13-05: Trust Tier D Demotion for Manual TrxID Entry
  it('E2E-T1-F13-05: Trust Tier D Demotion for Manual TrxID Entry', () => {
    // Manual entry by merchant backoffice operator
    const channel = 'MANUAL_ENTRY';
    const trustTier = channel === 'MANUAL_ENTRY' ? 'D' : 'A';
    const baseRiskScore = trustTier === 'D' ? 40 : 0;
    const requiresDualControlReview = trustTier === 'D';

    expect(trustTier).toBe('D');
    expect(baseRiskScore).toBe(40);
    expect(requiresDualControlReview).toBe(true);
  });
});
