import * as crypto from 'node:crypto';
import { Paisa } from '@denaneya/payment-core';
import { BasePaymentGatewayAdapter } from '../adapter.js';
import { GatewayError } from '../errors.js';
import type {
  InitiatePaymentParams,
  InitiatePaymentResult,
  VerifyPaymentParams,
  VerifyPaymentResult,
  RefundParams,
  RefundResult,
  PaymentDetailsResult,
  RefundDetailsResult,
  GatewayHealthStatus,
  MockConfig,
  GatewayTransactionStatus,
} from '../types.js';

interface MockPaymentRecord {
  paymentId: string;
  amount: Paisa;
  status: GatewayTransactionStatus;
  providerTrxId?: string;
  providerPaymentId: string;
  refundedAmount: Paisa;
  createdAt: Date;
}

interface MockRefundRecord {
  providerRefundId: string;
  paymentId: string;
  providerTrxId: string;
  amount: Paisa;
  status: 'SUCCEEDED' | 'PENDING' | 'FAILED';
  createdAt: Date;
}

export class MockAdapter extends BasePaymentGatewayAdapter<MockConfig> {
  readonly provider = 'MOCK' as const;
  readonly supportedMethods = [
    'CARDS',
    'BKASH',
    'NAGAD',
    'ROCKET',
    'UPAY',
    'INTERNET_BANKING',
  ] as const;

  private static readonly records = new Map<string, MockPaymentRecord>();
  private static readonly refundRecords = new Map<string, MockRefundRecord>();

  constructor(config: MockConfig = { isSandbox: true }) {
    super(config);
  }

  static clearMockData(): void {
    MockAdapter.records.clear();
    MockAdapter.refundRecords.clear();
  }

  private async simulateDelay(): Promise<void> {
    const delay = this.config.simulatedLatencyMs ?? 5;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    await this.simulateDelay();

    // Check idempotency
    const existing = MockAdapter.records.get(params.paymentId);
    if (existing) {
      return {
        provider: this.provider,
        redirectUrl: `${params.returnUrl}?paymentId=${params.paymentId}&status=success&session=${existing.providerPaymentId}`,
        providerPaymentId: existing.providerPaymentId,
        sessionData: { mockSessionId: existing.providerPaymentId },
      };
    }

    const sessionId = `mock_sess_${crypto.randomBytes(8).toString('hex')}`;
    const record: MockPaymentRecord = {
      paymentId: params.paymentId,
      amount: params.amount,
      status: 'PENDING',
      providerPaymentId: sessionId,
      refundedAmount: Paisa.zero(),
      createdAt: new Date(),
    };

    MockAdapter.records.set(params.paymentId, record);

    return {
      provider: this.provider,
      redirectUrl: `${params.returnUrl}?paymentId=${params.paymentId}&status=success&session=${sessionId}`,
      providerPaymentId: sessionId,
      sessionData: { mockSessionId: sessionId },
    };
  }

  async verifyPayment(params: VerifyPaymentParams): Promise<VerifyPaymentResult> {
    await this.simulateDelay();

    const record =
      MockAdapter.records.get(params.paymentId) ||
      (params.providerPaymentId
        ? Array.from(MockAdapter.records.values()).find(
            (r) => r.providerPaymentId === params.providerPaymentId
          )
        : undefined);

    const amountToCheck = params.amount || record?.amount || Paisa.zero();
    const paisaVal = amountToCheck.amountPaisa;

    // Test vector pattern evaluations if enabled
    if (this.config.mockFailurePatterns ?? true) {
      const remainder = paisaVal % 100n;
      if (remainder === 99n) {
        if (record) record.status = 'FAILED';
        return {
          provider: this.provider,
          status: 'FAILED',
          providerTrxId: '',
          providerPaymentId: record?.providerPaymentId || 'mock_sess_declined',
          amount: amountToCheck,
          fee: Paisa.zero(),
          currency: 'BDT',
          paidAt: new Date(),
          rawResponse: { reason: 'CARD_DECLINED', code: 'PAYMENT_DECLINED' },
        };
      }
      if (remainder === 98n) {
        throw new GatewayError({
          provider: this.provider,
          code: 'NETWORK_TIMEOUT',
          message: 'Simulated network timeout during mock verification',
          isRetryable: true,
        });
      }
      if (remainder === 97n) {
        if (record) record.status = 'FAILED';
        return {
          provider: this.provider,
          status: 'FAILED',
          providerTrxId: '',
          providerPaymentId: record?.providerPaymentId || 'mock_sess_insufficient',
          amount: amountToCheck,
          fee: Paisa.zero(),
          currency: 'BDT',
          paidAt: new Date(),
          rawResponse: { reason: 'INSUFFICIENT_FUNDS' },
        };
      }
      if (remainder === 96n) {
        if (record) record.status = 'EXPIRED';
        return {
          provider: this.provider,
          status: 'EXPIRED',
          providerTrxId: '',
          providerPaymentId: record?.providerPaymentId || 'mock_sess_expired',
          amount: amountToCheck,
          fee: Paisa.zero(),
          currency: 'BDT',
          paidAt: new Date(),
          rawResponse: { reason: 'EXPIRED_SESSION' },
        };
      }
    }

    const providerTrxId = `MOCK_TRX_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    if (record) {
      record.status = 'COMPLETED';
      record.providerTrxId = providerTrxId;
    }

    return {
      provider: this.provider,
      status: 'COMPLETED',
      providerTrxId,
      providerPaymentId: record?.providerPaymentId || params.providerPaymentId || 'mock_sess',
      amount: amountToCheck,
      fee: Paisa.zero(),
      currency: 'BDT',
      cardType: 'MOCK-SANDBOX',
      paidAt: new Date(),
      rawResponse: { status: 'COMPLETED', providerTrxId },
    };
  }

  async refundPayment(params: RefundParams): Promise<RefundResult> {
    await this.simulateDelay();

    if (params.refundAmount.gt(params.totalCapturedAmount)) {
      throw new GatewayError({
        provider: this.provider,
        code: 'REFUND_EXCEEDS_AMOUNT',
        message: 'Refund amount cannot exceed total captured amount',
      });
    }

    const record = MockAdapter.records.get(params.paymentId);
    if (record) {
      const newRefunded = record.refundedAmount.add(params.refundAmount);
      if (newRefunded.gt(record.amount)) {
        throw new GatewayError({
          provider: this.provider,
          code: 'REFUND_EXCEEDS_AMOUNT',
          message: 'Cumulative refund exceeds captured payment amount',
        });
      }
      record.refundedAmount = newRefunded;
    }

    const providerRefundId = `MOCK_REF_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const refundRecord: MockRefundRecord = {
      providerRefundId,
      paymentId: params.paymentId,
      providerTrxId: params.providerTrxId,
      amount: params.refundAmount,
      status: 'SUCCEEDED',
      createdAt: new Date(),
    };
    MockAdapter.refundRecords.set(providerRefundId, refundRecord);
    MockAdapter.refundRecords.set(params.refundId, refundRecord);

    return {
      provider: this.provider,
      status: 'SUCCEEDED',
      providerRefundId,
      refundAmount: params.refundAmount,
      refundedAt: new Date(),
      rawResponse: { status: 'SUCCEEDED', providerRefundId },
    };
  }

  async verifyWebhookSignature(
    headers: Record<string, string>,
    _body: string | Record<string, unknown>
  ): Promise<boolean> {
    const signature = headers['x-mock-signature'] || headers['signature'];
    return signature !== 'invalid';
  }

  async queryPayment(providerTrxId: string): Promise<PaymentDetailsResult> {
    await this.simulateDelay();

    const record = Array.from(MockAdapter.records.values()).find(
      (r) => r.providerTrxId === providerTrxId || r.paymentId === providerTrxId
    );

    if (!record) {
      return {
        provider: this.provider,
        providerTrxId,
        status: 'FAILED',
        amount: Paisa.zero(),
        currency: 'BDT',
        rawResponse: { error: 'Transaction not found in mock store' },
      };
    }

    return {
      provider: this.provider,
      paymentId: record.paymentId,
      providerTrxId: record.providerTrxId || providerTrxId,
      status: record.status,
      amount: record.amount,
      currency: 'BDT',
      paidAt: record.createdAt,
      rawResponse: { ...record },
    };
  }

  async queryRefund(refundId: string): Promise<RefundDetailsResult> {
    await this.simulateDelay();

    const record = MockAdapter.refundRecords.get(refundId);
    if (!record) {
      return {
        provider: this.provider,
        providerRefundId: refundId,
        providerTrxId: '',
        status: 'FAILED',
        amount: Paisa.zero(),
        rawResponse: { error: 'Refund not found in mock store', refundId },
      };
    }

    return {
      provider: this.provider,
      providerRefundId: record.providerRefundId,
      providerTrxId: record.providerTrxId,
      status: record.status,
      amount: record.amount,
      rawResponse: { ...record },
    };
  }

  async healthCheck(): Promise<GatewayHealthStatus> {
    return {
      provider: this.provider,
      status: 'UP',
      latencyMs: this.config.simulatedLatencyMs ?? 1,
      timestamp: new Date(),
    };
  }
}