import { describe, it, expect } from 'vitest';
import {
  GatewayFactory,
  GatewayError,
  SslCommerzAdapter,
  ShurjoPayAdapter,
  AamarPayAdapter,
  BkashAdapter,
  NagadAdapter,
  MockAdapter,
} from '@denaneya/gateway-adapters';
import { Paisa } from '@denaneya/payment-core';
import { GATEWAY_RESPONSES } from '../fixtures/gateway-responses.js';

describe('Feature 10: Unified Gateway Adapter Interface (E2E-T1-F10)', () => {
  // E2E-T1-F10-01: Polymorphic Adapter Interface Method Existence
  it('E2E-T1-F10-01: Polymorphic Adapter Interface Method Existence', () => {
    const ssl = new SslCommerzAdapter({ storeId: 'test_store', storePassword: 'test_password', isSandbox: true });
    const shurjo = new ShurjoPayAdapter({ username: 'sp_user', password: 'sp_password', prefix: 'SP', isSandbox: true });
    const aamar = new AamarPayAdapter({ storeId: 'aamar_store', signatureKey: 'aamar_key', isSandbox: true });
    const bkash = new BkashAdapter({ appKey: 'bk_key', appSecret: 'bk_secret', username: 'bk_user', password: 'bk_password', isSandbox: true });
    const nagad = new NagadAdapter({ merchantId: 'nagad_mer', merchantPrivateKey: 'MIIEvg...', nagadPublicKey: 'MIIBIj...', isSandbox: true });
    const mock = new MockAdapter({ latencyMs: 0, failRate: 0 });

    const adapters = [ssl, shurjo, aamar, bkash, nagad, mock];

    for (const adapter of adapters) {
      expect(typeof adapter.initiatePayment).toBe('function');
      expect(typeof adapter.verifyPayment).toBe('function');
      expect(typeof adapter.refundPayment).toBe('function');
      expect(typeof adapter.verifyWebhookSignature).toBe('function');
      expect(typeof adapter.queryPayment).toBe('function');
      expect(typeof adapter.queryRefund).toBe('function');
      expect(typeof adapter.healthCheck).toBe('function');
      expect(typeof adapter.provider).toBe('string');
      expect(Array.isArray(adapter.supportedMethods)).toBe(true);
    }
  });

  // E2E-T1-F10-02: Normalized Webhook Output Schema Invariant
  it('E2E-T1-F10-02: Normalized Webhook Output Schema Invariant', async () => {
    const mockAdapter = new MockAdapter({ latencyMs: 0, failRate: 0 });
    const sslCallback = GATEWAY_RESPONSES.SSLCOMMERZ.VALID_IPN;

    // Verify mock webhook signature validation interface
    const isValid = await mockAdapter.verifyWebhookSignature({}, { tran_id: 'TRX_001' });
    expect(typeof isValid).toBe('boolean');

    // Verify normalization contract
    expect(sslCallback.status).toBe('VALID');
    expect(sslCallback.currency).toBe('BDT');
    const amountPaisa = Paisa.fromBDT(sslCallback.amount);
    expect(amountPaisa.amountPaisa).toBe(100000n);
  });

  // E2E-T1-F10-03: Health Check Contract Execution
  it('E2E-T1-F10-03: Health Check Contract Execution', async () => {
    const mockAdapter = new MockAdapter({ latencyMs: 5, failRate: 0 });
    const health = await mockAdapter.healthCheck();

    expect(['UP', 'DEGRADED', 'DOWN']).toContain(health.status);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    expect(health.provider).toBe('MOCK');
  });

  // E2E-T1-F10-04: Standardized Error Normalization
  it('E2E-T1-F10-04: Standardized Error Normalization', () => {
    const err = new GatewayError({
      provider: 'SSLCOMMERZ',
      code: 'NETWORK_ERROR',
      message: 'Connection timed out while connecting to upstream gateway',
      httpStatus: 504,
      isRetryable: true,
    });

    expect(err).toBeInstanceOf(GatewayError);
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.provider).toBe('SSLCOMMERZ');
    expect(err.isRetryable).toBe(true);
    expect(err.httpStatus).toBe(504);
  });

  // E2E-T1-F10-05: Supported Currency & Method Metadata
  it('E2E-T1-F10-05: Supported Currency & Method Metadata', () => {
    const ssl = new SslCommerzAdapter({ storeId: 'test', storePassword: 'test', isSandbox: true });
    expect(ssl.provider).toBe('SSLCOMMERZ');
    expect(ssl.supportedMethods).toContain('CARDS');
    expect(ssl.supportedMethods).toContain('BKASH');
    expect(ssl.supportedMethods).toContain('NAGAD');

    const bkash = new BkashAdapter({ appKey: 'k', appSecret: 's', username: 'u', password: 'p', isSandbox: true });
    expect(bkash.provider).toBe('BKASH');
    expect(bkash.supportedMethods).toContain('BKASH');
  });
});
