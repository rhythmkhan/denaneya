import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as crypto from 'node:crypto';
import { Paisa } from '@denaneya/payment-core';
import {
  GatewayFactory,
  GatewayFailoverRouter,
  FailoverGatewayAdapter,
  GatewayError,
  BkashAdapter,
  NagadAdapter,
  SslCommerzAdapter,
  ShurjoPayAdapter,
  AamarPayAdapter,
  MockAdapter,
  sanitizeUrl,
  sanitizeString,
  sanitizeCredentials,
  normalizePemKey,
  rsaSign,
  rsaVerify,
} from '../src/index.js';

describe('Gateway Adapters: Sandbox vs Live Switching, Security & Failover Engine', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    GatewayFactory.clearCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    GatewayFactory.clearCache();
  });

  describe('1. Sandbox vs Live Production Switching via Environment Variables', () => {
    it('switches bKash between Sandbox and Live based on BKASH_IS_SANDBOX', () => {
      const adapter = new BkashAdapter({
        appKey: 'test_key',
        appSecret: 'test_secret',
        username: 'test_user',
        password: 'test_password',
      });

      // Default sandbox
      expect(adapter.isSandbox).toBe(true);
      expect((adapter as any).baseUrl).toBe('https://tokenized.sandbox.bka.sh/v2/tokenized/checkout');

      // Set to Live Production
      process.env.BKASH_IS_SANDBOX = 'false';
      expect(adapter.isSandbox).toBe(false);
      expect((adapter as any).baseUrl).toBe('https://tokenized.pay.bka.sh/v2/tokenized/checkout');

      // Switch back to Sandbox
      process.env.BKASH_IS_SANDBOX = 'true';
      expect(adapter.isSandbox).toBe(true);
      expect((adapter as any).baseUrl).toBe('https://tokenized.sandbox.bka.sh/v2/tokenized/checkout');

      // Custom BASE_URL override
      process.env.BKASH_BASE_URL = 'https://custom.bkash.proxy/api';
      expect((adapter as any).baseUrl).toBe('https://custom.bkash.proxy/api');
    });

    it('switches Nagad between Sandbox and Live based on NAGAD_IS_SANDBOX', () => {
      const adapter = new NagadAdapter({
        merchantId: 'test_merchant',
        merchantPrivateKey: 'test_key',
        nagadPublicKey: 'test_pub',
      });

      // Default sandbox
      expect(adapter.isSandbox).toBe(true);
      expect((adapter as any).baseUrl).toBe('http://sandbox.mynagad.com:10080/remote-payment-gateway-1.0/api/dfs');

      // Switch to Live Production
      process.env.NAGAD_IS_SANDBOX = 'false';
      expect(adapter.isSandbox).toBe(false);
      expect((adapter as any).baseUrl).toBe('https://api.mynagad.com/api/dfs');

      // Custom URL override
      process.env.NAGAD_BASE_URL = 'https://custom.nagad.proxy/api/dfs';
      expect((adapter as any).baseUrl).toBe('https://custom.nagad.proxy/api/dfs');
    });

    it('switches SSLCOMMERZ between Sandbox and Live based on SSLCOMMERZ_IS_SANDBOX', () => {
      const adapter = new SslCommerzAdapter({
        storeId: 'test_store',
        storePassword: 'test_password',
      });

      expect(adapter.isSandbox).toBe(true);
      expect((adapter as any).baseUrl).toBe('https://sandbox.sslcommerz.com');

      process.env.SSLCOMMERZ_IS_SANDBOX = 'false';
      expect(adapter.isSandbox).toBe(false);
      expect((adapter as any).baseUrl).toBe('https://securepay.sslcommerz.com');
    });

    it('switches shurjoPay between Sandbox and Live based on SHURJOPAY_IS_SANDBOX', () => {
      const adapter = new ShurjoPayAdapter({
        username: 'test_user',
        password: 'test_password',
        prefix: 'NOK',
      });

      expect(adapter.isSandbox).toBe(true);
      expect((adapter as any).baseUrl).toBe('https://sandbox.shurjopayment.com/api');

      process.env.SHURJOPAY_IS_SANDBOX = 'false';
      expect(adapter.isSandbox).toBe(false);
      expect((adapter as any).baseUrl).toBe('https://engine.shurjopay.com/api');
    });

    it('switches aamarPay between Sandbox and Live based on AAMARPAY_IS_SANDBOX', () => {
      const adapter = new AamarPayAdapter({
        storeId: 'test_store',
        signatureKey: 'test_key',
      });

      expect(adapter.isSandbox).toBe(true);
      expect((adapter as any).baseUrl).toBe('https://sandbox.aamarpay.com');

      process.env.AAMARPAY_IS_SANDBOX = 'false';
      expect(adapter.isSandbox).toBe(false);
      expect((adapter as any).baseUrl).toBe('https://secure.aamarpay.com');
    });

    it('loads gateway configs and adapters directly from environment variables via GatewayFactory', () => {
      process.env.SSLCOMMERZ_STORE_ID = 'env_store';
      process.env.SSLCOMMERZ_STORE_PASSWD = 'env_password';
      process.env.SSLCOMMERZ_IS_SANDBOX = 'false';

      const sslConfig = GatewayFactory.createConfigFromEnv('SSLCOMMERZ') as any;
      expect(sslConfig.storeId).toBe('env_store');
      expect(sslConfig.storePassword).toBe('env_password');
      expect(sslConfig.isSandbox).toBe(false);

      const sslAdapter = GatewayFactory.getAdapterFromEnv('SSLCOMMERZ');
      expect((sslAdapter as any).baseUrl).toBe('https://securepay.sslcommerz.com');
      expect(sslAdapter.isSandbox).toBe(false);
    });
  });

  describe('2. Request Payload Signing & Webhook Verification Hardening', () => {
    it('normalizes RSA PEM keys containing literal escaped \\n from environment variables', () => {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      // Simulate .env escaped newline format
      const escapedPrivKey = privateKey.replace(/\n/g, '\\n');
      const escapedPubKey = publicKey.replace(/\n/g, '\\n');

      const normalizedPriv = normalizePemKey(escapedPrivKey);
      const normalizedPub = normalizePemKey(escapedPubKey);

      expect(normalizedPriv).toContain('\n');
      expect(normalizedPriv).not.toContain('\\n');

      // Test RSA signing with normalized key
      const payload = JSON.stringify({ merchantId: '123', amount: '100.00' });
      const signature = rsaSign(payload, escapedPrivKey);
      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(50);

      const isValid = rsaVerify(payload, signature, escapedPubKey);
      expect(isValid).toBe(true);
    });

    it('verifies bKash webhook signatures with case-insensitive headers', async () => {
      const adapter = new BkashAdapter({
        appKey: 'bkash_key',
        appSecret: 'secret_signature_key',
        username: 'user',
        password: 'pass',
      });

      const body = JSON.stringify({ paymentID: 'PAY_123', trxID: 'TRX_123' });
      const signature = crypto
        .createHmac('sha256', 'secret_signature_key')
        .update(body)
        .digest('hex');

      // Uppercase header
      const verifiedUpper = await adapter.verifyWebhookSignature(
        { 'X-BKASH-SIGNATURE': signature },
        body
      );
      expect(verifiedUpper).toBe(true);

      // Mixed case header
      const verifiedMixed = await adapter.verifyWebhookSignature(
        { 'X-Signature': signature },
        body
      );
      expect(verifiedMixed).toBe(true);

      // Invalid signature
      const verifiedInvalid = await adapter.verifyWebhookSignature(
        { 'x-bkash-signature': 'invalid_signature_hash' },
        body
      );
      expect(verifiedInvalid).toBe(false);
    });

    it('verifies aamarPay webhook signatures with case-insensitive headers', async () => {
      const adapter = new AamarPayAdapter({
        storeId: 'test_store',
        signatureKey: 'aamar_sig_key',
      });

      const body = JSON.stringify({ mer_txnid: 'AAMAR_001', pg_txnid: 'PG_999' });
      const signature = crypto
        .createHmac('sha256', 'aamar_sig_key')
        .update(body)
        .digest('hex');

      const verified = await adapter.verifyWebhookSignature(
        { 'X-AAMARPAY-SIGNATURE': signature },
        body
      );
      expect(verified).toBe(true);
    });
  });

  describe('3. Credential Sanitization in Error Logs', () => {
    it('sanitizes sensitive query parameters from URLs in HTTP error logs', () => {
      const sensitiveUrl =
        'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php?val_id=12345&store_id=test_store&store_passwd=my_secret_store_password&format=json';

      const sanitized = sanitizeUrl(sensitiveUrl);
      expect(sanitized).toContain('val_id=12345');
      expect(sanitized).toContain('store_id=test_store');
      expect(sanitized).toContain('store_passwd=***REDACTED***');
      expect(sanitized).not.toContain('my_secret_store_password');
    });

    it('sanitizes embedded credentials and RSA private keys in GatewayError messages and rawResponse', () => {
      const fakePem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----';
      const rawErrorPayload = {
        error: 'Invalid authentication',
        appSecret: 'super_secret_bkash_key',
        nested: {
          store_passwd: 'confidential_password',
          safeField: 'display_message',
        },
      };

      const gatewayError = new GatewayError({
        provider: 'NAGAD',
        code: 'AUTHENTICATION_FAILED',
        message: `Failed to authenticate using key: ${fakePem} with password store_passwd=12345`,
        rawResponse: rawErrorPayload,
      });

      expect(gatewayError.message).not.toContain('MIIEowIBAAKCAQEA0');
      expect(gatewayError.message).toContain('***REDACTED PRIVATE KEY***');
      expect(gatewayError.message).toContain('store_passwd=***REDACTED***');

      const sanitizedResponse = gatewayError.rawResponse as any;
      expect(sanitizedResponse.appSecret).toBe('***REDACTED***');
      expect(sanitizedResponse.nested.store_passwd).toBe('***REDACTED***');
      expect(sanitizedResponse.nested.safeField).toBe('display_message');

      const json = gatewayError.toSanitizedJSON() as any;
      expect(json.rawResponse.appSecret).toBe('***REDACTED***');
    });
  });

  describe('4. Gateway Failover & Auto-Recovery Logic', () => {
    it('routes to primary gateway when healthy and fails over to secondary when primary reports DOWN', async () => {
      const mockPrimary = new MockAdapter();
      const mockFallback = new MockAdapter();

      const router = new GatewayFailoverRouter({
        primaryProvider: 'SSLCOMMERZ',
        fallbackProviders: ['SHURJOPAY'],
      });

      router.registerAdapter('SSLCOMMERZ', mockPrimary);
      router.registerAdapter('SHURJOPAY', mockFallback);

      // 1. Primary is UP -> initial payment goes to SSLCOMMERZ
      const res1 = await router.initiatePayment({
        paymentId: 'PAY_001',
        merchantId: 'M_01',
        amount: Paisa.fromBDT('100.00'),
        currency: 'BDT',
        customer: { name: 'Customer', email: 'c@test.com' },
        returnUrl: 'https://app.com/return',
        cancelUrl: 'https://app.com/cancel',
        ipnUrl: 'https://app.com/ipn',
      });

      expect(res1.providerUsed).toBe('SSLCOMMERZ');
      expect(res1.failoverOccurred).toBe(false);

      // 2. Primary gateway reports DOWN (e.g. outage or health probe)
      router.setGatewayStatus('SSLCOMMERZ', 'DOWN', 'Upstream timeout spike');
      expect(router.getHealthState('SSLCOMMERZ').status).toBe('DOWN');

      // Next payment seamlessly fails over to SHURJOPAY
      const res2 = await router.initiatePayment({
        paymentId: 'PAY_002',
        merchantId: 'M_01',
        amount: Paisa.fromBDT('200.00'),
        currency: 'BDT',
        customer: { name: 'Customer', email: 'c@test.com' },
        returnUrl: 'https://app.com/return',
        cancelUrl: 'https://app.com/cancel',
        ipnUrl: 'https://app.com/ipn',
      });

      expect(res2.providerUsed).toBe('SHURJOPAY');
      expect(res2.failoverOccurred).toBe(true);
    });

    it('fails over dynamically during in-flight call when primary throws a gateway outage error', async () => {
      const mockPrimary = new MockAdapter();
      const mockFallback = new MockAdapter();

      // Primary initiate payment will throw a 502 GATEWAY_UNAVAILABLE
      vi.spyOn(mockPrimary, 'initiatePayment').mockRejectedValueOnce(
        new GatewayError({
          provider: 'SSLCOMMERZ',
          code: 'GATEWAY_UNAVAILABLE',
          message: 'Upstream connection reset by peer',
          isRetryable: true,
        })
      );

      const router = new GatewayFailoverRouter({
        primaryProvider: 'SSLCOMMERZ',
        fallbackProviders: ['SHURJOPAY'],
      });

      router.registerAdapter('SSLCOMMERZ', mockPrimary);
      router.registerAdapter('SHURJOPAY', mockFallback);

      const res = await router.initiatePayment({
        paymentId: 'PAY_INFLIGHT_01',
        merchantId: 'M_01',
        amount: Paisa.fromBDT('500.00'),
        currency: 'BDT',
        customer: { name: 'Alice', email: 'alice@example.com' },
        returnUrl: 'https://app.com/return',
        cancelUrl: 'https://app.com/cancel',
        ipnUrl: 'https://app.com/ipn',
      });

      // Transparently succeeded on SHURJOPAY fallback
      expect(res.providerUsed).toBe('SHURJOPAY');
      expect(res.failoverOccurred).toBe(true);
      expect(router.getHealthState('SSLCOMMERZ').consecutiveFailures).toBe(1);
    });

    it('trips circuit breaker to DEGRADED and DOWN after reaching consecutive failure thresholds', async () => {
      const router = new GatewayFailoverRouter({
        primaryProvider: 'SSLCOMMERZ',
        fallbackProviders: ['SHURJOPAY'],
        failureThreshold: 3,
        degradedThreshold: 2,
      });

      const adapter = new MockAdapter();
      router.registerAdapter('SSLCOMMERZ', adapter);

      expect(router.getHealthState('SSLCOMMERZ').status).toBe('UP');

      // Failure 1
      router.recordFailure('SSLCOMMERZ', new Error('Timeout 1'));
      expect(router.getHealthState('SSLCOMMERZ').status).toBe('UP');

      // Failure 2 -> triggers DEGRADED
      router.recordFailure('SSLCOMMERZ', new Error('Timeout 2'));
      expect(router.getHealthState('SSLCOMMERZ').status).toBe('DEGRADED');

      // Failure 3 -> triggers DOWN
      router.recordFailure('SSLCOMMERZ', new Error('Timeout 3'));
      expect(router.getHealthState('SSLCOMMERZ').status).toBe('DOWN');
    });

    it('auto-recovers DOWN and DEGRADED gateways back to UP via probeAndRecover health check', async () => {
      const mockPrimary = new MockAdapter();
      const router = new GatewayFailoverRouter({
        primaryProvider: 'SSLCOMMERZ',
        fallbackProviders: ['SHURJOPAY'],
      });

      router.registerAdapter('SSLCOMMERZ', mockPrimary);
      router.setGatewayStatus('SSLCOMMERZ', 'DOWN', 'Simulated outage');
      expect(router.getHealthState('SSLCOMMERZ').status).toBe('DOWN');

      // Probing triggers healthCheck() on adapter
      const probeResults = await router.probeAndRecover('SSLCOMMERZ');
      expect(probeResults[0]!.status).toBe('UP');

      // Automatically restored to UP state
      expect(router.getHealthState('SSLCOMMERZ').status).toBe('UP');
      expect(router.getHealthState('SSLCOMMERZ').consecutiveFailures).toBe(0);
    });

    it('FailoverGatewayAdapter works as a transparent composite adapter implementing PaymentGatewayAdapter', async () => {
      const primary = new MockAdapter();
      const fallback = new MockAdapter();

      const failoverAdapter = GatewayFactory.createFailoverAdapter(
        {
          primaryProvider: 'SSLCOMMERZ',
          fallbackProviders: ['SHURJOPAY'],
        },
        new Map([
          ['SSLCOMMERZ', primary],
          ['SHURJOPAY', fallback],
        ])
      );

      // Verify health check aggregates status
      const health = await failoverAdapter.healthCheck();
      expect(health.status).toBe('UP');

      // Payment initiation works through composite adapter
      const initResult = await failoverAdapter.initiatePayment({
        paymentId: 'COMPOSITE_001',
        merchantId: 'M_01',
        amount: Paisa.fromBDT('350.00'),
        currency: 'BDT',
        customer: { name: 'Bob', email: 'bob@example.com' },
        returnUrl: 'https://checkout.com/return',
        cancelUrl: 'https://checkout.com/cancel',
        ipnUrl: 'https://checkout.com/ipn',
      });

      expect(initResult.redirectUrl).toBeDefined();

      // Verification works through composite adapter
      const verifyResult = await failoverAdapter.verifyPayment({
        paymentId: 'COMPOSITE_001',
        providerPaymentId: initResult.providerPaymentId,
      });

      expect(verifyResult.status).toBe('COMPLETED');
      expect(verifyResult.amount.toBDT()).toBe('350.00');
    });

    it('recognizes underscore and alias environment variables (e.g. SHURJO_PAY_IS_SANDBOX, BKASH_SANDBOX)', () => {
      const shurjo = new ShurjoPayAdapter({
        username: 'u',
        password: 'p',
        prefix: 'NOK',
      });
      process.env.SHURJO_PAY_IS_SANDBOX = 'false';
      expect(shurjo.isSandbox).toBe(false);

      const aamar = new AamarPayAdapter({
        storeId: 's',
        signatureKey: 'k',
      });
      process.env.AAMAR_PAY_IS_SANDBOX = 'false';
      expect(aamar.isSandbox).toBe(false);

      const ssl = new SslCommerzAdapter({
        storeId: 's',
        storePassword: 'p',
      });
      process.env.SSL_COMMERZ_SANDBOX = 'production';
      expect(ssl.isSandbox).toBe(false);

      const bkash = new BkashAdapter({
        appKey: 'k',
        appSecret: 's',
        username: 'u',
        password: 'p',
      });
      process.env.BKASH_SANDBOX = '0';
      expect(bkash.isSandbox).toBe(false);
    });

    it('invalidates cached auth tokens when sandbox mode is toggled at runtime', async () => {
      const bkash = new BkashAdapter({
        appKey: 'k',
        appSecret: 's',
        username: 'u',
        password: 'p',
      });

      // Mock grant response for sandbox
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: '0000',
            id_token: 'sandbox_token_123',
            expires_in: 3600,
          }),
          { status: 200 }
        )
      );

      const token1 = await bkash.getAuthToken();
      expect(token1).toBe('sandbox_token_123');

      // Now toggle to live production
      process.env.BKASH_IS_SANDBOX = 'false';
      expect(bkash.isSandbox).toBe(false);

      // Mock grant response for live
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: '0000',
            id_token: 'live_token_456',
            expires_in: 3600,
          }),
          { status: 200 }
        )
      );

      const token2 = await bkash.getAuthToken();
      expect(token2).toBe('live_token_456');
    });

    it('sanitizes embedded JSON credentials and opaque bearer tokens in strings', () => {
      const jsonMessage = 'Upstream error response: {"password":"secret_pass","store_passwd":"123","api_secret":"my_key"}';
      const sanitized = sanitizeString(jsonMessage);
      expect(sanitized).not.toContain('secret_pass');
      expect(sanitized).not.toContain('123');
      expect(sanitized).toContain('"password":"***REDACTED***"');
      expect(sanitized).toContain('"store_passwd":"***REDACTED***"');

      const opaqueAuth = 'Authorization: Bearer opaque_api_token_xyz_123';
      const sanitizedAuth = sanitizeString(opaqueAuth);
      expect(sanitizedAuth).not.toContain('opaque_api_token_xyz_123');
      expect(sanitizedAuth).toBe('Authorization: Bearer ***REDACTED TOKEN***');
    });

    it('sanitizes credential objects with substring keys (token, secret, signature)', () => {
      const payload = {
        merchant_token: 'token_val_1',
        api_secret: 'secret_val_2',
        webhook_signature: 'sig_val_3',
        safe_info: 'info_val_4',
      };
      const sanitized = sanitizeCredentials(payload);
      expect(sanitized.merchant_token).toBe('***REDACTED***');
      expect(sanitized.api_secret).toBe('***REDACTED***');
      expect(sanitized.webhook_signature).toBe('***REDACTED***');
      expect(sanitized.safe_info).toBe('info_val_4');
    });

    it('normalizes bare Base64 keys without headers and strips surrounding quotes', () => {
      const bareKey = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0';
      const normalized = normalizePemKey(bareKey, 'PUBLIC KEY');
      expect(normalized).toContain('-----BEGIN PUBLIC KEY-----');
      expect(normalized).toContain('-----END PUBLIC KEY-----');
      expect(normalized).toContain('MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0');

      const quotedKey = '"-----BEGIN PUBLIC KEY-----\\nMIIBIjAN\\n-----END PUBLIC KEY-----"';
      const normalizedQuoted = normalizePemKey(quotedKey);
      expect(normalizedQuoted.startsWith('"')).toBe(false);
      expect(normalizedQuoted.endsWith('"')).toBe(false);
      expect(normalizedQuoted).toContain('\n');
    });

    it('clears lastError on setGatewayStatus to UP', () => {
      const router = new GatewayFailoverRouter();
      router.setGatewayStatus('SSLCOMMERZ', 'DOWN', 'Outage error');
      expect(router.getHealthState('SSLCOMMERZ').lastError).toBe('Outage error');

      router.setGatewayStatus('SSLCOMMERZ', 'UP');
      expect(router.getHealthState('SSLCOMMERZ').lastError).toBeUndefined();
    });

    it('circuit breaker strictly skips DOWN gateways with active cooldown when healthy backup exists', async () => {
      const primary = new MockAdapter();
      const backup = new MockAdapter();

      const router = new GatewayFailoverRouter({
        primaryProvider: 'SSLCOMMERZ',
        fallbackProviders: ['SHURJOPAY'],
        recoveryCooldownMs: 60_000,
      });

      router.registerAdapter('SSLCOMMERZ', primary);
      router.registerAdapter('SHURJOPAY', backup);

      // Trip primary to DOWN
      router.setGatewayStatus('SSLCOMMERZ', 'DOWN', 'Simulated 500 spike');
      expect(router.isProviderAvailable('SSLCOMMERZ')).toBe(false);

      const primarySpy = vi.spyOn(primary, 'initiatePayment');
      const backupSpy = vi.spyOn(backup, 'initiatePayment');

      const res = await router.initiatePayment({
        paymentId: 'CB_TEST_001',
        merchantId: 'M_01',
        amount: Paisa.fromBDT('100.00'),
        currency: 'BDT',
        customer: { name: 'Test' },
        returnUrl: 'https://return.com',
        cancelUrl: 'https://cancel.com',
        ipnUrl: 'https://ipn.com',
      });

      // Primary was NEVER invoked because circuit was open
      expect(primarySpy).not.toHaveBeenCalled();
      expect(backupSpy).toHaveBeenCalledTimes(1);
      expect(res.providerUsed).toBe('SHURJOPAY');
      expect(res.failoverOccurred).toBe(true);
    });

    it('verifies SSLCOMMERZ webhook signature via IPN val_id fallback', async () => {
      const ssl = new SslCommerzAdapter({
        storeId: 'test_store',
        storePassword: 'test_password',
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'VALID',
            tran_id: 'TRX_IPN_001',
            val_id: 'VAL_999',
            amount: '100.00',
            currency: 'BDT',
          }),
          { status: 200 }
        )
      );

      const isValid = await ssl.verifyWebhookSignature({}, {
        val_id: 'VAL_999',
        tran_id: 'TRX_IPN_001',
      });

      expect(isValid).toBe(true);
    });

    it('routes FailoverGatewayAdapter stateful operations directly to detected originating provider', async () => {
      const ssl = new MockAdapter();
      const nagad = new MockAdapter();

      const adapter = GatewayFactory.createFailoverAdapter(
        { primaryProvider: 'SSLCOMMERZ', fallbackProviders: ['NAGAD'] },
        new Map([
          ['SSLCOMMERZ', ssl],
          ['NAGAD', nagad],
        ])
      );

      const sslVerifySpy = vi.spyOn(ssl, 'verifyPayment');
      const nagadVerifySpy = vi.spyOn(nagad, 'verifyPayment');

      // Verify with Nagad payment reference
      await adapter.verifyPayment({
        paymentId: 'pay_123',
        rawCallbackParams: { payment_ref_id: 'NAGAD_REF_99' },
      });

      // Targeted Nagad directly, did NOT hit SSLCOMMERZ
      expect(nagadVerifySpy).toHaveBeenCalledTimes(1);
      expect(sslVerifySpy).not.toHaveBeenCalled();
    });
  });
});
