import { describe, it, expect } from 'vitest';
import { signWebhookPayload, verifyWebhookSignature } from '../src/signature.js';

describe('HMAC-SHA256 Signature Engine', () => {
  const secret = 'whsec_test_secret_key_1234567890abcdef';
  const payload = JSON.stringify({
    id: 'evt_test_1',
    event: 'payment.completed',
    data: { amountPaisa: '100000', currency: 'BDT' },
  });

  it('generates a well-formed signature header with t and v1', () => {
    const timestamp = 1726244000;
    const { signatureHeader, signature } = signWebhookPayload(payload, secret, timestamp);

    expect(signatureHeader).toBe(`t=1726244000,v1=${signature}`);
    expect(signature).toHaveLength(64); // 32-byte hex string
  });

  it('verifies a valid signature successfully', () => {
    const timestamp = 1726244000;
    const { signatureHeader } = signWebhookPayload(payload, secret, timestamp);

    const result = verifyWebhookSignature({
      payload,
      signatureHeader,
      secret,
      currentTimeSeconds: 1726244010, // 10s drift
      toleranceSeconds: 300,
    });

    expect(result.valid).toBe(true);
    expect(result.timestamp).toBe(timestamp);
  });

  it('rejects signature when payload is tampered with', () => {
    const timestamp = 1726244000;
    const { signatureHeader } = signWebhookPayload(payload, secret, timestamp);
    const tamperedPayload = payload.replace('100000', '200000');

    const result = verifyWebhookSignature({
      payload: tamperedPayload,
      signatureHeader,
      secret,
      currentTimeSeconds: 1726244010,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('mismatch');
  });

  it('rejects signature when secret is incorrect', () => {
    const timestamp = 1726244000;
    const { signatureHeader } = signWebhookPayload(payload, secret, timestamp);

    const result = verifyWebhookSignature({
      payload,
      signatureHeader,
      secret: 'wrong_secret',
      currentTimeSeconds: 1726244010,
    });

    expect(result.valid).toBe(false);
  });

  it('rejects signature when timestamp drift exceeds tolerance (replay protection)', () => {
    const timestamp = 1726244000;
    const { signatureHeader } = signWebhookPayload(payload, secret, timestamp);

    const result = verifyWebhookSignature({
      payload,
      signatureHeader,
      secret,
      currentTimeSeconds: 1726244400, // 400s drift > 300s
      toleranceSeconds: 300,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('drift (400s) exceeds allowed tolerance');
  });

  it('rejects malformed signature headers', () => {
    expect(
      verifyWebhookSignature({
        payload,
        signatureHeader: 'invalid_header',
        secret,
      }).valid
    ).toBe(false);

    expect(
      verifyWebhookSignature({
        payload,
        signatureHeader: 't=notanumber,v1=abcd',
        secret,
      }).valid
    ).toBe(false);

    expect(
      verifyWebhookSignature({
        payload,
        signatureHeader: '',
        secret,
      }).valid
    ).toBe(false);
  });
});