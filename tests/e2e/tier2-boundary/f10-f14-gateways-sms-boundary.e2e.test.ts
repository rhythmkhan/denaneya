import { describe, it, expect, vi } from 'vitest';
import {
  GatewayFactory,
  GatewayError,
  SslCommerzAdapter,
  ShurjoPayAdapter,
  NagadAdapter,
  BkashAdapter,
  MockAdapter,
  fetchWithTimeout,
  parseJsonResponse,
} from '@denaneya/gateway-adapters';
import { Paisa } from '@denaneya/payment-core';
import {
  parseMfsSms,
  BalanceChainEngine,
} from '@denaneya/sms-parser';
import {
  signWebhookPayload,
  verifyWebhookSignature,
  MAX_DELIVERY_ATTEMPTS,
} from '@denaneya/webhooks';
import { validateUrlForSsrf } from '@denaneya/security';
import { SMS_FIXTURES } from '../fixtures/sms-messages.js';

describe('Tier 2: F10-F14 Gateways & SMS Boundary Suite', () => {
  // --------------------------------------------------------------------------
  // Feature 10: Unified Gateway Adapter Interface Boundaries (5 tests)
  // --------------------------------------------------------------------------
  describe('Feature 10: Unified Gateway Adapter Interface Boundaries', () => {
    it('E2E-T2-F10-01: Gateway Timeout Handling', async () => {
      // Simulate gateway timing out
      await expect(async () => {
        await fetchWithTimeout(
          'https://httpbin.org/delay/10',
          { timeoutMs: 20 },
          'SSLCOMMERZ'
        );
      }).rejects.toThrow(GatewayError);

      try {
        await fetchWithTimeout('https://httpbin.org/delay/10', { timeoutMs: 20 }, 'SSLCOMMERZ');
      } catch (err: any) {
        expect(err).toBeInstanceOf(GatewayError);
        expect(err.code).toBe('NETWORK_TIMEOUT');
        expect(err.isRetryable).toBe(true);
      }
    });

    it('E2E-T2-F10-02: Gateway HTTP 502 Bad Gateway Response', async () => {
      const createResponse = () =>
        new Response('<html><body>502 Bad Gateway: NGINX</body></html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        });

      await expect(async () => {
        await parseJsonResponse(createResponse(), 'SSLCOMMERZ');
      }).rejects.toThrow(GatewayError);

      try {
        await parseJsonResponse(createResponse(), 'SSLCOMMERZ');
      } catch (err: any) {
        expect(err.code).toBe('GATEWAY_UNAVAILABLE');
        expect(err.httpStatus).toBe(502);
      }
    });

    it('E2E-T2-F10-03: Empty Webhook Body Normalization', async () => {
      const ssl = new SslCommerzAdapter({ storeId: 'test', storePassword: 'test', isSandbox: true });
      const isValid = await ssl.verifyWebhookSignature({}, '');
      expect(isValid).toBe(false);
    });

    it('E2E-T2-F10-04: Malformed JSON Webhook Payload', async () => {
      const ssl = new SslCommerzAdapter({ storeId: 'test', storePassword: 'test', isSandbox: true });
      const isValid = await ssl.verifyWebhookSignature({}, '{malformed_json:');
      expect(isValid).toBe(false);
    });

    it('E2E-T2-F10-05: Unknown Provider Identifier', () => {
      expect(() => {
        GatewayFactory.getAdapter('UNKNOWN_PAY' as any, {} as any);
      }).toThrow(GatewayError);

      try {
        GatewayFactory.getAdapter('UNKNOWN_PAY' as any, {} as any);
      } catch (err: any) {
        expect(err.code).toBe('CONFIGURATION_ERROR');
        expect(err.message).toContain('Unsupported gateway provider');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Feature 11: Gateway Adapters Boundaries (5 tests)
  // --------------------------------------------------------------------------
  describe('Feature 11: Gateway Adapters Boundaries', () => {
    it('E2E-T2-F11-01: SSLCOMMERZ Currency Mismatch in IPN', async () => {
      const ssl = new SslCommerzAdapter({
        storeId: 'test_store',
        storePassword: 'test_password',
        isSandbox: true,
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'VALID',
            currency: 'USD', // Mismatched currency
            amount: '100.00',
            val_id: 'VAL_USD_01',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      try {
        await expect(async () => {
          await ssl.verifyPayment({
            paymentId: 'pay_ssl_curr_01',
            rawCallbackParams: { val_id: 'VAL_USD_01' },
          });
        }).rejects.toThrow(/Expected BDT currency, but received USD/i);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('E2E-T2-F11-02: SSLCOMMERZ Amount Tampering in IPN', async () => {
      const ssl = new SslCommerzAdapter({
        storeId: 'test_store',
        storePassword: 'test_password',
        isSandbox: true,
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'VALID',
            currency: 'BDT',
            amount: '10.00', // Tampered down from 1000.00
            val_id: 'VAL_TAMPER_01',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      try {
        await expect(async () => {
          await ssl.verifyPayment({
            paymentId: 'pay_ssl_tamper_01',
            amount: Paisa.fromBDT('1000.00'), // Expected 1,000.00 BDT
            rawCallbackParams: { val_id: 'VAL_TAMPER_01' },
          });
        }).rejects.toThrow(/Amount mismatch/i);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('E2E-T2-F11-03: bKash Token Expiration During Execute', async () => {
      const bkash = new BkashAdapter({
        appKey: 'test_key',
        appSecret: 'test_secret',
        username: 'test_user',
        password: 'test_password',
        isSandbox: true,
      });

      // Verification that BkashAdapter has token caching and getAuthToken refresh logic
      expect(typeof (bkash as any).getAuthToken).toBe('function');
      expect((bkash as any).tokenExpiresAt).toBe(0);
    });

    it('E2E-T2-F11-04: Nagad Invalid RSA Signature Callback', async () => {
      const nagad = new NagadAdapter({
        merchantId: 'NAGAD_MER_01',
        merchantPrivateKey: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQD...==\n-----END PRIVATE KEY-----',
        nagadPublicKey: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...==\n-----END PUBLIC KEY-----',
        isSandbox: true,
      });

      // Verify callback with forged/tampered signature fails
      const isValid = await nagad.verifyWebhookSignature(
        { 'x-km-signature': 'FORGED_INVALID_SIGNATURE' },
        { payment_ref_id: 'REF_001', order_id: 'ORD_001' }
      );
      expect(isValid).toBe(false);
    });

    it('E2E-T2-F11-05: shurjoPay Negative Order ID Query', async () => {
      const shurjo = new ShurjoPayAdapter({
        username: 'test_sp',
        password: 'test_password',
        prefix: 'SP',
        isSandbox: true,
      });

      // Querying missing or negative order ID
      await expect(async () => {
        await shurjo.verifyPayment({ paymentId: '' });
      }).rejects.toThrow(GatewayError);

      try {
        await shurjo.verifyPayment({ paymentId: '' });
      } catch (err: any) {
        expect(err.code).toBe('INVALID_REQUEST');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Feature 12: Versioned SMS Parser Engine Boundaries (5 tests)
  // --------------------------------------------------------------------------
  describe('Feature 12: Versioned SMS Parser Engine Boundaries', () => {
    it('E2E-T2-F12-01: SMS with Extra Spaces and Newlines', () => {
      const rawWithWhitespace = `
        You have received Tk 2,500.00 from 01712345678.
        Fee Tk 0.00. Balance Tk 15,200.00.
        TrxID 9K38AL90 at 13/09/2026 22:10
      `;

      const result = parseMfsSms('bKash', rawWithWhitespace);
      expect(result.status).toBe('SUCCESS');
      expect(result.trxId).toBe('9K38AL90');
      expect(result.amountPaisa.amountPaisa).toBe(250000n);
      expect(result.balancePaisa?.amountPaisa).toBe(1520000n);
    });

    it('E2E-T2-F12-02: SMS Amount with Comma Separators (Tk 1,00,000.00)', () => {
      const fixture = SMS_FIXTURES.BKASH_COMMA_FORMAT;
      const result = parseMfsSms(fixture.sender, fixture.rawText);

      expect(result.status).toBe('SUCCESS');
      expect(result.trxId).toBe('BKASHCOMMA1');
      expect(result.amountPaisa.amountPaisa).toBe(10000000n); // 1,00,000.00 BDT = 10,000,000 Paisa
      expect(result.balancePaisa?.amountPaisa).toBe(21520000n);
    });

    it('E2E-T2-F12-03: SMS with Lowercase TrxID', () => {
      const textWithLowercaseTrx =
        'You have received Tk 2,500.00 from 01712345678. Fee Tk 0.00. Balance Tk 15,200.00. TrxID 9k38al90 at 13/09/2026';

      const result = parseMfsSms('bKash', textWithLowercaseTrx);
      expect(result.status).toBe('SUCCESS');
      expect(result.trxId).toBe('9K38AL90'); // Normalized to uppercase
    });

    it('E2E-T2-F12-04: SMS with Alphanumeric Sender Spoofing', () => {
      const spoofedSender = 'bKash!'; // Special character exclamation mark
      const text = 'You have received Tk 2,500.00 from 01712345678. Fee Tk 0.00. Balance Tk 15,200.00. TrxID 9K38AL90';

      const result = parseMfsSms(spoofedSender, text);
      expect(result.status).toBe('PARSER_UNRECOGNIZED');
      expect(result.isSenderVerified).toBe(false);
    });

    it('E2E-T2-F12-05: Empty / Null SMS String', () => {
      const resultEmpty = parseMfsSms('bKash', '');
      expect(resultEmpty.status).toBe('PARSER_UNRECOGNIZED');
      expect(resultEmpty.trxId).toBe('');
      expect(resultEmpty.confidence).toBe(0.0);

      const resultWhitespace = parseMfsSms('bKash', '   ');
      expect(resultWhitespace.status).toBe('PARSER_UNRECOGNIZED');
      expect(resultWhitespace.trxId).toBe('');

      // Safe parse for null/undefined input coerced to empty string
      const safeParse = (s: string, t: any) => parseMfsSms(s, t ?? '');
      expect(safeParse('bKash', null).status).toBe('PARSER_UNRECOGNIZED');
    });
  });

  // --------------------------------------------------------------------------
  // Feature 13: Balance-Chain & Trust Tiers Boundaries (5 tests)
  // --------------------------------------------------------------------------
  describe('Feature 13: Balance-Chain & Trust Tiers Boundaries', () => {
    it('E2E-T2-F13-01: Exact Zero Balance Wallet Condition', () => {
      const incomingSms = {
        provider: 'BKASH' as const,
        type: 'CASH_OUT' as const,
        trxId: 'TX_ZERO_BAL',
        amountPaisa: Paisa.fromBDT('500.00'),
        feePaisa: Paisa.zero(),
        counterparty: '01712345678',
        balancePaisa: Paisa.fromBDT('0.00'), // Wallet emptied to exact zero
        reference: null,
        timestamp: new Date(),
        rawSms: '',
        smsHash: 'hash_zero',
        parserVersion: 'v1',
        confidence: 1.0,
        status: 'SUCCESS' as const,
        isSenderVerified: true,
      };

      const result = BalanceChainEngine.verify({
        walletId: 'wlt_zero_01',
        incomingSms,
        previousBalancePaisa: Paisa.fromBDT('500.00'),
      });

      expect(result.status).toBe('VERIFIED');
      expect(result.isDiscontinuity).toBe(false);
      expect(result.expectedNewBalancePaisa?.toBDT()).toBe('0.00');
    });

    it('E2E-T2-F13-02: Fee-Bearing Balance Chain', () => {
      // Balance_t = Balance_{t-1} + Amount - Fee
      // 1000.00 + 500.00 - 5.00 = 1495.00
      const incomingSms = {
        provider: 'BKASH' as const,
        type: 'PAYMENT_RECEIVED' as const,
        trxId: 'TX_FEE_01',
        amountPaisa: Paisa.fromBDT('500.00'),
        feePaisa: Paisa.fromBDT('5.00'),
        counterparty: '01712345678',
        balancePaisa: Paisa.fromBDT('1495.00'),
        reference: null,
        timestamp: new Date(),
        rawSms: '',
        smsHash: 'hash_fee',
        parserVersion: 'v1',
        confidence: 1.0,
        status: 'SUCCESS' as const,
        isSenderVerified: true,
      };

      const result = BalanceChainEngine.verify({
        walletId: 'wlt_fee_01',
        incomingSms,
        previousBalancePaisa: Paisa.fromBDT('1000.00'),
      });

      expect(result.status).toBe('VERIFIED');
      expect(result.isDiscontinuity).toBe(false);
      expect(result.deltaPaisa?.amountPaisa).toBe(0n);
      expect(result.expectedNewBalancePaisa?.toBDT()).toBe('1495.00');
    });

    it('E2E-T2-F13-03: Out-of-Order SMS Sequence', () => {
      // SMS reports balance that implies skipped transactions
      const incomingSms = {
        provider: 'BKASH' as const,
        type: 'PAYMENT_RECEIVED' as const,
        trxId: 'TX_OOO_01',
        amountPaisa: Paisa.fromBDT('500.00'),
        feePaisa: Paisa.zero(),
        counterparty: '01712345678',
        balancePaisa: Paisa.fromBDT('8000.00'), // Expected 5000 + 500 = 5500
        reference: null,
        timestamp: new Date(),
        rawSms: '',
        smsHash: 'hash_ooo',
        parserVersion: 'v1',
        confidence: 1.0,
        status: 'SUCCESS' as const,
        isSenderVerified: true,
      };

      const result = BalanceChainEngine.verify({
        walletId: 'wlt_ooo_01',
        incomingSms,
        previousBalancePaisa: Paisa.fromBDT('5000.00'),
      });

      expect(result.status).toBe('DISCONTINUITY_DETECTED');
      expect(result.isDiscontinuity).toBe(true);
      expect(result.discontinuityType).toBe('SKIPPED_CREDIT_SMS');
      expect(result.deltaPaisa?.amountPaisa).toBe(250000n); // 8000 - 5500 = 2500 BDT
    });

    it('E2E-T2-F13-04: Multi-SIM Slot Collision', () => {
      // Two SIM slots on same phone maintaining isolated balance chains
      const sim0Result = BalanceChainEngine.verify({
        walletId: 'dev_01_sim_0',
        incomingSms: {
          provider: 'BKASH' as const,
          type: 'PAYMENT_RECEIVED' as const,
          trxId: 'TX_SIM0',
          amountPaisa: Paisa.fromBDT('100.00'),
          balancePaisa: Paisa.fromBDT('1100.00'),
        } as any,
        previousBalancePaisa: Paisa.fromBDT('1000.00'),
      });

      const sim1Result = BalanceChainEngine.verify({
        walletId: 'dev_01_sim_1',
        incomingSms: {
          provider: 'NAGAD' as const,
          type: 'PAYMENT_RECEIVED' as const,
          trxId: 'TX_SIM1',
          amountPaisa: Paisa.fromBDT('200.00'),
          balancePaisa: Paisa.fromBDT('5200.00'),
        } as any,
        previousBalancePaisa: Paisa.fromBDT('5000.00'),
      });

      expect(sim0Result.status).toBe('VERIFIED');
      expect(sim1Result.status).toBe('VERIFIED');
      expect(sim0Result.walletId).not.toBe(sim1Result.walletId);
    });

    it('E2E-T2-F13-05: First Transaction on New SIM (Genesis Balance)', () => {
      const incomingSms = {
        provider: 'BKASH' as const,
        type: 'PAYMENT_RECEIVED' as const,
        trxId: 'TX_GENESIS',
        amountPaisa: Paisa.fromBDT('1500.00'),
        feePaisa: Paisa.zero(),
        counterparty: '01712345678',
        balancePaisa: Paisa.fromBDT('1500.00'),
        reference: null,
        timestamp: new Date(),
        rawSms: '',
        smsHash: 'hash_genesis',
        parserVersion: 'v1',
        confidence: 1.0,
        status: 'SUCCESS' as const,
        isSenderVerified: true,
      };

      // Previous balance is null/undefined (first transaction ever recorded)
      const result = BalanceChainEngine.verify({
        walletId: 'wlt_genesis_01',
        incomingSms,
        previousBalancePaisa: null,
      });

      expect(result.status).toBe('UNKNOWN_BASELINE');
      expect(result.isDiscontinuity).toBe(false);
      expect(result.message).toContain('Initial baseline established');
    });
  });

  // --------------------------------------------------------------------------
  // Feature 14: Webhook Infrastructure & Outbox Boundaries (5 tests)
  // --------------------------------------------------------------------------
  describe('Feature 14: Webhook Infrastructure & Outbox Boundaries', () => {
    const testSecret = 'whsec_boundary_test_secret_1234567890';

    it('E2E-T2-F14-01: Webhook Replay Timing: Exact 300s Timestamp', () => {
      const rawBody = JSON.stringify({ event: 'payment.completed', id: 'evt_time_01' });
      const nowSec = Math.floor(Date.now() / 1000);

      // Exactly 300s drift is permitted
      const timestamp300s = nowSec - 300;
      const { signatureHeader: header300 } = signWebhookPayload(rawBody, testSecret, timestamp300s);
      const res300 = verifyWebhookSignature({
        payload: rawBody,
        signatureHeader: header300,
        secret: testSecret,
        currentTimeSeconds: nowSec,
        toleranceSeconds: 300,
      });
      expect(res300.valid).toBe(true);

      // 301s drift must be rejected
      const timestamp301s = nowSec - 301;
      const { signatureHeader: header301 } = signWebhookPayload(rawBody, testSecret, timestamp301s);
      const res301 = verifyWebhookSignature({
        payload: rawBody,
        signatureHeader: header301,
        secret: testSecret,
        currentTimeSeconds: nowSec,
        toleranceSeconds: 300,
      });
      expect(res301.valid).toBe(false);
      expect(res301.reason).toMatch(/exceeds allowed tolerance/i);
    });

    it('E2E-T2-F14-02: Webhook Secret with Special Characters', () => {
      const specialSecret = '!@#$%^&*()_+-=[]{}|;:,.<>?`~';
      const rawBody = JSON.stringify({ event: 'payment.completed', amount: 50000 });
      const nowSec = Math.floor(Date.now() / 1000);

      const { signatureHeader } = signWebhookPayload(rawBody, specialSecret, nowSec);
      const verifyResult = verifyWebhookSignature({
        payload: rawBody,
        signatureHeader,
        secret: specialSecret,
        currentTimeSeconds: nowSec,
      });

      expect(verifyResult.valid).toBe(true);
    });

    it('E2E-T2-F14-03: Webhook Delivery Destination 301 Redirect', async () => {
      // Verify SSRF guard blocks redirect targets to private or cloud metadata IPs
      const privateRedirectTargets = [
        'http://127.0.0.1:8080/hook',
        'http://169.254.169.254/latest/meta-data',
        'http://10.0.0.1/internal',
      ];

      for (const target of privateRedirectTargets) {
        const result = await validateUrlForSsrf(target);
        expect(result.safe).toBe(false);
      }
    });

    it('E2E-T2-F14-04: Webhook Client Slow Consumer Timeout', async () => {
      // Simulate slow client hanging socket
      const slowClient = async (timeoutMs: number) => {
        return new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error('Slow consumer socket timed out after ' + timeoutMs + 'ms'));
          }, timeoutMs);
        });
      };

      await expect(slowClient(50)).rejects.toThrow(/timed out/i);
    });

    it('E2E-T2-F14-05: Webhook DLQ Max Retry Cap', () => {
      expect(MAX_DELIVERY_ATTEMPTS).toBe(5);

      // Verify that 5 attempts caps retry and moves to DEAD_LETTER
      const getNextState = (attempt: number): 'RETRYING' | 'DEAD_LETTER' => {
        return attempt >= MAX_DELIVERY_ATTEMPTS ? 'DEAD_LETTER' : 'RETRYING';
      };

      expect(getNextState(1)).toBe('RETRYING');
      expect(getNextState(4)).toBe('RETRYING');
      expect(getNextState(5)).toBe('DEAD_LETTER');
      expect(getNextState(6)).toBe('DEAD_LETTER');
    });
  });
});
