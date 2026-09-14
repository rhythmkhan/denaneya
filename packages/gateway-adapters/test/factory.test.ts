import { describe, it, expect, beforeEach } from 'vitest';
import { GatewayFactory } from '../src/factory.js';
import { GatewayError } from '../src/errors.js';
import { SslCommerzAdapter } from '../src/adapters/sslcommerz.js';
import { ShurjoPayAdapter } from '../src/adapters/shurjopay.js';
import { AamarPayAdapter } from '../src/adapters/aamarpay.js';
import { BkashAdapter } from '../src/adapters/bkash.js';
import { NagadAdapter } from '../src/adapters/nagad.js';
import { MockAdapter } from '../src/adapters/mock.js';

describe('GatewayFactory', () => {
  beforeEach(() => {
    GatewayFactory.clearCache();
  });

  it('instantiates all 6 supported gateway adapters correctly', () => {
    const ssl = GatewayFactory.getAdapter('SSLCOMMERZ', {
      isSandbox: true,
      storeId: 'test_store',
      storePassword: 'test_password',
    });
    expect(ssl).toBeInstanceOf(SslCommerzAdapter);

    const sp = GatewayFactory.getAdapter('SHURJOPAY', {
      isSandbox: true,
      username: 'user',
      password: 'pwd',
      prefix: 'DN',
    });
    expect(sp).toBeInstanceOf(ShurjoPayAdapter);

    const aamar = GatewayFactory.getAdapter('AAMARPAY', {
      isSandbox: true,
      storeId: 'sid',
      signatureKey: 'skey',
    });
    expect(aamar).toBeInstanceOf(AamarPayAdapter);

    const bkash = GatewayFactory.getAdapter('BKASH', {
      isSandbox: true,
      appKey: 'ak',
      appSecret: 'as',
      username: 'u',
      password: 'p',
    });
    expect(bkash).toBeInstanceOf(BkashAdapter);

    const nagad = GatewayFactory.getAdapter('NAGAD', {
      isSandbox: true,
      merchantId: 'mid',
      merchantPrivateKey: 'pk',
      nagadPublicKey: 'pubk',
    });
    expect(nagad).toBeInstanceOf(NagadAdapter);

    const mock = GatewayFactory.getAdapter('MOCK', { isSandbox: true });
    expect(mock).toBeInstanceOf(MockAdapter);
  });

  it('reuses cached instance when cacheKey is provided', () => {
    const cacheKey = 'mer_123:SSLCOMMERZ:default';
    const adapter1 = GatewayFactory.getAdapter(
      'SSLCOMMERZ',
      { isSandbox: true, storeId: 'store1', storePassword: 'pwd' },
      cacheKey
    );
    expect(GatewayFactory.hasCached(cacheKey)).toBe(true);

    const adapter2 = GatewayFactory.getAdapter(
      'SSLCOMMERZ',
      { isSandbox: true, storeId: 'store1', storePassword: 'pwd' },
      cacheKey
    );
    expect(adapter1).toBe(adapter2);
  });

  it('throws CONFIGURATION_ERROR on unsupported provider', () => {
    expect(() =>
      GatewayFactory.getAdapter('STRIPE' as any, { isSandbox: true } as any)
    ).toThrow(GatewayError);
  });
});