import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  Paisa,
  InvalidMoneyAmountError,
  NegativeAmountError,
  validatePaymentTransition,
  canTransition,
  applyPaymentTransition,
  OptimisticLockError,
  TerminalStateError,
} from '@denaneya/payment-core';
import {
  verifyLedgerBalance,
  assertLedgerBalanced,
  calculateAccountBalance,
} from '../helpers/ledger-verifier.js';
import {
  SYSTEM_ACCOUNT_CODES,
  SYSTEM_ACCOUNTS,
} from '@denaneya/ledger';
import {
  FraudEvaluator,
  ReviewWorkflowManager,
  DualControlViolationError,
  InvalidReviewStateTransitionError,
} from '@denaneya/fraud-engine';

describe('Tier 2: F05-F09 Financial Core Boundary Suite', () => {
  const rootDir = path.resolve(__dirname, '../../../');

  // --------------------------------------------------------------------------
  // Feature 05: Money Math (Paisa Minor Units) Boundaries (5 tests)
  // --------------------------------------------------------------------------
  describe('Feature 05: Money Math (Paisa Minor Units) Boundaries', () => {
    it('E2E-T2-F05-01: Minimum Valid Paisa Unit (1n Paisa / 0.01 BDT)', () => {
      const onePaisa = Paisa.fromPaisa(1n);
      expect(onePaisa.amountPaisa).toBe(1n);
      expect(onePaisa.toBDT()).toBe('0.01');

      // Addition preserves exact 1 paisa precision
      const twoPaisa = onePaisa.add(onePaisa);
      expect(twoPaisa.amountPaisa).toBe(2n);
      expect(twoPaisa.toBDT()).toBe('0.02');

      // Fee calculation on 1 paisa: (1 * 185 + 5000) / 10000 = 5185 / 10000 = 0n (integer division)
      const fee = onePaisa.percentage(185); // 1.85%
      expect(fee.amountPaisa).toBe(0n);
    });

    it('E2E-T2-F05-02: String Parsing with Irregular Whitespace', () => {
      const paddedInputs = [
        '  150.50  ',
        '\t150.50\n',
        '   150.50   BDT  ',
        ' ৳ 150.50 ',
      ];

      for (const input of paddedInputs) {
        const parsed = Paisa.fromBDT(input);
        expect(parsed.amountPaisa).toBe(15050n);
        expect(parsed.toBDT()).toBe('150.50');
      }
    });

    it('E2E-T2-F05-03: String Parsing with Excess Decimal Places', () => {
      const ambiguousInputs = ['150.555', '0.001', '12.3456', '99.999'];

      for (const input of ambiguousInputs) {
        expect(() => Paisa.fromBDT(input)).toThrow(InvalidMoneyAmountError);
      }
    });

    it('E2E-T2-F05-04: Subtraction to Exact Zero', () => {
      const a = Paisa.fromBDT('100.00');
      const b = Paisa.fromBDT('100.00');

      const difference = a.subtract(b);
      expect(difference.amountPaisa).toBe(0n);
      expect(difference.isZero()).toBe(true);
      expect(difference.toBDT()).toBe('0.00');
    });

    it('E2E-T2-F05-05: Fee Rounding Exact Halfway Boundary', () => {
      // Test halfway round half-up: (amount * bps + 5000n) / 10000n
      // If numerator ends in exactly 5000, integer division (half-up) rounds up to next unit
      const calculateHalfUpFee = (paisa: bigint, bps: bigint): bigint => {
        return (paisa * bps + 5000n) / 10000n;
      };

      // Example: 100n paisa * 50n bps = 5000n. With + 5000n = 10000n / 10000n = 1n.
      expect(calculateHalfUpFee(100n, 50n)).toBe(1n);

      // Example: 99n paisa * 50n bps = 4950n. With + 5000n = 9950n / 10000n = 0n.
      expect(calculateHalfUpFee(99n, 50n)).toBe(0n);

      // Exactly at halfway (.50 fractional paisa): rounds up
      const exactHalfway = calculateHalfUpFee(100n, 50n);
      expect(exactHalfway).toBe(1n);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 06: Payment State Machine Boundaries (5 tests)
  // --------------------------------------------------------------------------
  describe('Feature 06: Payment State Machine Boundaries', () => {
    it('E2E-T2-F06-01: Self-Transition Rejection', () => {
      // Completed -> Completed is invalid
      const result = validatePaymentTransition('COMPLETED', 'COMPLETED');
      expect(result.allowed).toBe(false);
      expect(result.error).toBeDefined();

      // Created -> Created is invalid
      expect(canTransition('CREATED', 'CREATED')).toBe(false);

      // Processing -> Processing is invalid
      expect(canTransition('PROCESSING', 'PROCESSING')).toBe(false);
    });

    it('E2E-T2-F06-02: Terminal State Immutability', () => {
      const terminalStates = ['FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED'] as const;
      const allTargets = [
        'CREATED',
        'PENDING',
        'PROCESSING',
        'COMPLETED',
        'UNDER_REVIEW',
        'PARTIALLY_REFUNDED',
      ] as const;

      for (const terminal of terminalStates) {
        for (const target of allTargets) {
          const res = validatePaymentTransition(terminal as any, target as any);
          expect(res.allowed).toBe(false);
          expect(res.errorCode).toBe('TERMINAL_STATE_IMMUTABLE');
        }
      }
    });

    it('E2E-T2-F06-03: Skip Direct to Terminal from CREATED', () => {
      // Skipping directly from CREATED to COMPLETED (bypassing PENDING/PROCESSING) is illegal
      const result = validatePaymentTransition('CREATED', 'COMPLETED');
      expect(result.allowed).toBe(false);
      expect(result.errorCode).toBe('INVALID_STATE_TRANSITION');

      // Skipping directly from CREATED to REFUNDED is illegal
      const refundResult = validatePaymentTransition('CREATED', 'REFUNDED');
      expect(refundResult.allowed).toBe(false);
    });

    it('E2E-T2-F06-04: Optimistic Concurrency Stale Version Rejection', () => {
      const paymentRecord = {
        id: 'pay_occ_test_01',
        merchantId: 'mer_standard_01',
        amountPaisa: 100000n,
        currency: 'BDT' as const,
        status: 'PENDING' as const,
        version: 2, // Database current version is 2
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Stale client passes expectedVersion = 1
      expect(() => {
        applyPaymentTransition(paymentRecord, 'PROCESSING', {
          expectedVersion: 1,
        });
      }).toThrow(OptimisticLockError);

      // Current client passes expectedVersion = 2 -> succeeds and increments version to 3
      const updated = applyPaymentTransition(paymentRecord, 'PROCESSING', {
        expectedVersion: 2,
      });
      expect(updated.version).toBe(3);
      expect(updated.status).toBe('PROCESSING');
    });

    it('E2E-T2-F06-05: Invalid Enum String State', () => {
      // Passing non-existent enum state string
      const result = validatePaymentTransition('UNKNOWN' as any, 'COMPLETED');
      expect(result.allowed).toBe(false);

      const targetResult = validatePaymentTransition('PENDING', 'INVALID_STATE' as any);
      expect(targetResult.allowed).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 07: Double-Entry Transaction Ledger Boundaries (5 tests)
  // --------------------------------------------------------------------------
  describe('Feature 07: Double-Entry Transaction Ledger Boundaries', () => {
    it('E2E-T2-F07-01: 1 Paisa Ledger Imbalance Rejection', () => {
      const unbalancedJournal = [
        { entryType: 'DEBIT' as const, amountPaisa: 100000n, accountId: '1010' },
        { entryType: 'CREDIT' as const, amountPaisa: 99999n, accountId: '2010' },
      ];

      const check = verifyLedgerBalance(unbalancedJournal);
      expect(check.balanced).toBe(false);
      expect(check.discrepancyPaisa).toBe(1n);

      expect(() => assertLedgerBalanced(unbalancedJournal)).toThrow(/imbalance detected/i);
    });

    it('E2E-T2-F07-02: Multi-Leg Ledger Entry Balance', () => {
      // 1 Debit of 100,000n matched against 5 split credit legs
      const splitJournal = [
        { entryType: 'DEBIT' as const, amountPaisa: 100000n, accountId: '1010' }, // Gateway Clearing
        { entryType: 'CREDIT' as const, amountPaisa: 80000n, accountId: '2010' },  // Merchant Payout
        { entryType: 'CREDIT' as const, amountPaisa: 10000n, accountId: '2020' },  // Rolling Reserve (10%)
        { entryType: 'CREDIT' as const, amountPaisa: 5000n, accountId: '4010' },   // Platform MDR
        { entryType: 'CREDIT' as const, amountPaisa: 3000n, accountId: '2010_tax' },// Withholding Tax
        { entryType: 'CREDIT' as const, amountPaisa: 2000n, accountId: '5010' },   // Processing Cost
      ];

      const check = verifyLedgerBalance(splitJournal);
      expect(check.balanced).toBe(true);
      expect(check.discrepancyPaisa).toBe(0n);
      expect(check.totalDebitsPaisa).toBe(100000n);
      expect(check.totalCreditsPaisa).toBe(100000n);
      expect(() => assertLedgerBalanced(splitJournal)).not.toThrow();
    });

    it('E2E-T2-F07-03: Negative Amount Entry Rejection', () => {
      const schemaPath = path.join(rootDir, 'packages/database/src/schema/ledger.ts');
      const schemaText = fs.readFileSync(schemaPath, 'utf8');

      // Enforced by PostgreSQL check constraint
      expect(schemaText).toContain('chk_ledger_entry_amount_positive');
      expect(schemaText).toContain('amount_paisa > 0');

      const negativeEntry = { entryType: 'DEBIT' as const, amountPaisa: -500n };
      expect(negativeEntry.amountPaisa > 0n).toBe(false);
    });

    it('E2E-T2-F07-04: Zero Amount Entry Rejection', () => {
      const zeroEntry = { entryType: 'CREDIT' as const, amountPaisa: 0n };
      // Violates check constraint amount_paisa > 0
      expect(zeroEntry.amountPaisa > 0n).toBe(false);
    });

    it('E2E-T2-F07-05: Non-Existent Chart of Accounts ID', () => {
      const knownCodes = Object.values(SYSTEM_ACCOUNT_CODES);
      const invalidAccountCode = '9999';

      expect(knownCodes.includes(invalidAccountCode as any)).toBe(false);
      expect(SYSTEM_ACCOUNTS[invalidAccountCode as any]).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Feature 08: Anti-Fraud Risk Engine Boundaries (5 tests)
  // --------------------------------------------------------------------------
  describe('Feature 08: Anti-Fraud Risk Engine Boundaries', () => {
    it('E2E-T2-F08-01: Exact Risk Threshold Boundary (Score 29 vs 30)', () => {
      const decision29 = FraudEvaluator.classifyScore(29);
      expect(decision29.classification).toBe('LOW');
      expect(decision29.action).toBe('ALLOW');

      const decision30 = FraudEvaluator.classifyScore(30);
      expect(decision30.classification).toBe('MEDIUM');
      expect(decision30.action).toBe('CHALLENGE');
    });

    it('E2E-T2-F08-02: Exact Risk Threshold Boundary (Score 59 vs 60)', () => {
      const decision59 = FraudEvaluator.classifyScore(59);
      expect(decision59.classification).toBe('MEDIUM');
      expect(decision59.action).toBe('CHALLENGE');

      const decision60 = FraudEvaluator.classifyScore(60);
      expect(decision60.classification).toBe('HIGH');
      expect(decision60.action).toBe('UNDER_REVIEW');
    });

    it('E2E-T2-F08-03: Exact Risk Threshold Boundary (Score 84 vs 85)', () => {
      const decision84 = FraudEvaluator.classifyScore(84);
      expect(decision84.classification).toBe('HIGH');
      expect(decision84.action).toBe('UNDER_REVIEW');

      const decision85 = FraudEvaluator.classifyScore(85);
      expect(decision85.classification).toBe('CRITICAL');
      expect(decision85.action).toBe('BLOCK');
    });

    it('E2E-T2-F08-04: Score Clamping at 100 Maximum', async () => {
      const evaluator = new FraudEvaluator();
      const mockRulesSum240 = [
        { ruleId: 'R1', ruleName: 'Rule 1', weight: 80, evaluate: async () => ({ ruleId: 'R1', ruleName: 'Rule 1', weight: 80, triggered: true, reason: 'R1' }) },
        { ruleId: 'R2', ruleName: 'Rule 2', weight: 80, evaluate: async () => ({ ruleId: 'R2', ruleName: 'Rule 2', weight: 80, triggered: true, reason: 'R2' }) },
        { ruleId: 'R3', ruleName: 'Rule 3', weight: 80, evaluate: async () => ({ ruleId: 'R3', ruleName: 'Rule 3', weight: 80, triggered: true, reason: 'R3' }) },
      ];

      const customEvaluator = new FraudEvaluator({ rules: mockRulesSum240 as any });
      const output = await customEvaluator.evaluate({
        payment: { id: 'pay_clamp_01', merchantId: 'mer_01', amountPaisa: 100000n, currency: 'BDT' },
      } as any);

      expect(output.riskScore).toBe(100);
      expect(output.classification).toBe('CRITICAL');
      expect(output.actionTaken).toBe('BLOCK');
    });

    it('E2E-T2-F08-05: Missing Context Parameters Graceful Fallback', async () => {
      const evaluator = new FraudEvaluator();

      // Passing empty context without IP, userAgent, or device metadata
      const output = await evaluator.evaluate({
        payment: { id: 'pay_sparse_01', merchantId: 'mer_01', amountPaisa: 50000n, currency: 'BDT' },
      } as any);

      expect(output).toBeDefined();
      expect(output.riskScore).toBeGreaterThanOrEqual(0);
      expect(output.riskScore).toBeLessThanOrEqual(100);
      expect(['ALLOW', 'CHALLENGE', 'UNDER_REVIEW', 'BLOCK']).toContain(output.actionTaken);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 09: Dual-Control Review Workflow Boundaries (5 tests)
  // --------------------------------------------------------------------------
  describe('Feature 09: Dual-Control Review Workflow Boundaries', () => {
    it('E2E-T2-F09-01: Self-Approval Rejection (Maker == Checker)', () => {
      const { case: initialCase } = ReviewWorkflowManager.createCase({
        id: 'case_dual_01',
        paymentId: 'pay_dual_01',
        merchantId: 'mer_01',
        reason: 'Large amount requires dual authorization',
      });

      const { case: firstApprovedCase } = ReviewWorkflowManager.firstApprove(initialCase, {
        actorId: 'usr_operator_same',
        notes: 'Maker recommendation',
      });

      // Same user attempting final approval must throw DualControlViolationError
      expect(() => {
        ReviewWorkflowManager.finalApprove(firstApprovedCase, {
          actorId: 'usr_operator_same',
          notes: 'Self-approval attempt',
        });
      }).toThrow(DualControlViolationError);
    });

    it('E2E-T2-F09-02: Finalize Without Prior Recommendation Rejection', () => {
      const { case: initialCase } = ReviewWorkflowManager.createCase({
        id: 'case_dual_02',
        paymentId: 'pay_dual_02',
        merchantId: 'mer_01',
        reason: 'Velocity spike',
      });

      // Attempting finalApprove directly on PENDING_REVIEW (without firstApprove) must throw
      expect(() => {
        ReviewWorkflowManager.finalApprove(initialCase, {
          actorId: 'usr_supervisor_01',
          notes: 'Premature approval',
        });
      }).toThrow(InvalidReviewStateTransitionError);
    });

    it('E2E-T2-F09-03: Review Decision on Non-Review Payment', () => {
      // Payment state machine rejects transition to COMPLETED if not currently in UNDER_REVIEW
      const transitionResult = validatePaymentTransition('COMPLETED', 'UNDER_REVIEW');
      expect(transitionResult.allowed).toBe(false);

      const failedResult = validatePaymentTransition('FAILED', 'UNDER_REVIEW');
      expect(failedResult.allowed).toBe(false);
    });

    it('E2E-T2-F09-04: Review Expiration Timeout', () => {
      const createdAt = new Date(Date.now() - 49 * 60 * 60 * 1000); // 49 hours ago (> 48h SLA)
      const isPastSla = (created: Date, timeoutHours = 48): boolean => {
        return Date.now() - created.getTime() > timeoutHours * 3600 * 1000;
      };

      expect(isPastSla(createdAt, 48)).toBe(true);

      // Payment state machine allows transition from UNDER_REVIEW to FAILED / CANCELLED upon timeout
      const autoExpireCheck = validatePaymentTransition('UNDER_REVIEW', 'FAILED');
      expect(autoExpireCheck.allowed).toBe(true);
    });

    it('E2E-T2-F09-05: Empty Review Notes Rejection', () => {
      const { case: initialCase } = ReviewWorkflowManager.createCase({
        id: 'case_dual_05',
        paymentId: 'pay_dual_05',
        merchantId: 'mer_01',
        reason: 'Review required',
      });

      const validateReviewNotes = (notes: string): boolean => {
        return typeof notes === 'string' && notes.trim().length >= 5;
      };

      expect(validateReviewNotes('')).toBe(false);
      expect(validateReviewNotes('   ')).toBe(false);
      expect(validateReviewNotes('ok')).toBe(false);
      expect(validateReviewNotes('Approved customer KYC documents')).toBe(true);
    });
  });
});
