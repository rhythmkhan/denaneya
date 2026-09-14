import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  signQStashMessage,
  verifyQStashSignature,
  QStashReceiver,
  QStashClient,
} from '../src/qstash.js';

describe('Upstash QStash Message Signing, Verification & Key Rotation', () => {
  const currentKey = 'sig_test_current_secret_key_11111';
  const nextKey = 'sig_test_next_secret_key_22222';
  const targetUrl = 'https://api.denaneya.com/api/v1/webhooks/worker';
  const rawBody = JSON.stringify({ eventId: 'evt_001', action: 'DISPATCH' });

  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.QSTASH_CURRENT_SIGNING_KEY;
    delete process.env.QSTASH_NEXT_SIGNING_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('signQStashMessage', () => {
    it('produces a valid 3-part HS256 JWT signature header with claims', () => {
      const token = signQStashMessage({
        body: rawBody,
        url: targetUrl,
        key: currentKey,
      });

      const parts = token.split('.');
      expect(parts.length).toBe(3);

      const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8'));
      expect(header.alg).toBe('HS256');
      expect(header.typ).toBe('JWT');

      const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
      expect(payload.iss).toBe('Upstash');
      expect(payload.sub).toBe(targetUrl);
      expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect(payload.body).toBeDefined();
    });

    it('requires a signing key', () => {
      expect(() =>
        signQStashMessage({
          body: rawBody,
          url: targetUrl,
          key: '',
        })
      ).toThrow(/signing key is required/);
    });
  });

  describe('verifyQStashSignature & Key Rotation', () => {
    it('verifies signature signed with current signing key', () => {
      const signature = signQStashMessage({
        body: rawBody,
        url: targetUrl,
        key: currentKey,
      });

      const result = verifyQStashSignature({
        signature,
        body: rawBody,
        url: targetUrl,
        currentSigningKey: currentKey,
        nextSigningKey: nextKey,
      });

      expect(result.valid).toBe(true);
      expect(result.keyUsed).toBe('current');
      expect(result.claims?.iss).toBe('Upstash');
    });

    it('verifies signature signed with next signing key (zero-downtime key rotation)', () => {
      // During key rotation, Upstash QStash switches to signing with the next key
      const signature = signQStashMessage({
        body: rawBody,
        url: targetUrl,
        key: nextKey,
      });

      const result = verifyQStashSignature({
        signature,
        body: rawBody,
        url: targetUrl,
        currentSigningKey: currentKey,
        nextSigningKey: nextKey,
      });

      expect(result.valid).toBe(true);
      expect(result.keyUsed).toBe('next');
      expect(result.reason).toBeUndefined();
    });

    it('simulates seamless key rotation lifecycle without dropping messages', () => {
      const keyV1 = 'key_version_1';
      const keyV2 = 'key_version_2';
      const keyV3 = 'key_version_3';

      // Phase 1: V1 is current, V2 is next (rotation in preparation)
      const sigV1 = signQStashMessage({ body: rawBody, url: targetUrl, key: keyV1 });
      const verifyPhase1 = verifyQStashSignature({
        signature: sigV1,
        body: rawBody,
        url: targetUrl,
        currentSigningKey: keyV1,
        nextSigningKey: keyV2,
      });
      expect(verifyPhase1.valid).toBe(true);
      expect(verifyPhase1.keyUsed).toBe('current');

      // Phase 2: QStash switches to V2 before app config is updated
      const sigV2 = signQStashMessage({ body: rawBody, url: targetUrl, key: keyV2 });
      const verifyPhase2 = verifyQStashSignature({
        signature: sigV2,
        body: rawBody,
        url: targetUrl,
        currentSigningKey: keyV1,
        nextSigningKey: keyV2,
      });
      expect(verifyPhase2.valid).toBe(true);
      expect(verifyPhase2.keyUsed).toBe('next');

      // Phase 3: App updates configuration: V2 promoted to current, V3 set as next
      const verifyPhase3 = verifyQStashSignature({
        signature: sigV2,
        body: rawBody,
        url: targetUrl,
        currentSigningKey: keyV2,
        nextSigningKey: keyV3,
      });
      expect(verifyPhase3.valid).toBe(true);
      expect(verifyPhase3.keyUsed).toBe('current');

      // Old key V1 is now rejected
      const verifyOld = verifyQStashSignature({
        signature: sigV1,
        body: rawBody,
        url: targetUrl,
        currentSigningKey: keyV2,
        nextSigningKey: keyV3,
      });
      expect(verifyOld.valid).toBe(false);
      expect(verifyOld.reason).toContain('failed for both current and next');
    });

    it('falls back to environment variables when keys are not explicitly passed', () => {
      process.env.QSTASH_CURRENT_SIGNING_KEY = currentKey;
      process.env.QSTASH_NEXT_SIGNING_KEY = nextKey;

      const signature = signQStashMessage({
        body: rawBody,
        url: targetUrl,
        key: currentKey,
      });

      const result = verifyQStashSignature({
        signature,
        body: rawBody,
        url: targetUrl,
      });

      expect(result.valid).toBe(true);
      expect(result.keyUsed).toBe('current');
    });

    it('rejects signature when neither key matches', () => {
      const signature = signQStashMessage({
        body: rawBody,
        url: targetUrl,
        key: 'unknown_hostile_key',
      });

      const result = verifyQStashSignature({
        signature,
        body: rawBody,
        url: targetUrl,
        currentSigningKey: currentKey,
        nextSigningKey: nextKey,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('failed for both current and next');
    });

    it('rejects signature when no keys are configured in options or environment', () => {
      const signature = signQStashMessage({
        body: rawBody,
        url: targetUrl,
        key: currentKey,
      });

      const result = verifyQStashSignature({
        signature,
        body: rawBody,
        url: targetUrl,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('No QStash signing keys configured');
    });

    it('rejects when message body has been tampered with', () => {
      const signature = signQStashMessage({
        body: rawBody,
        url: targetUrl,
        key: currentKey,
      });

      const tamperedBody = JSON.stringify({ eventId: 'evt_001', action: 'MALICIOUS' });
      const result = verifyQStashSignature({
        signature,
        body: tamperedBody,
        url: targetUrl,
        currentSigningKey: currentKey,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('body SHA-256 hash mismatch');
    });

    it('rejects when destination URL does not match', () => {
      const signature = signQStashMessage({
        body: rawBody,
        url: 'https://api.denaneya.com/api/v1/legit_endpoint',
        key: currentKey,
      });

      const result = verifyQStashSignature({
        signature,
        body: rawBody,
        url: 'https://api.denaneya.com/api/v1/other_endpoint',
        currentSigningKey: currentKey,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Destination URL mismatch');
    });

    it('rejects expired messages outside tolerance window', () => {
      const now = 1726300000;
      const signature = signQStashMessage({
        body: rawBody,
        url: targetUrl,
        key: currentKey,
        expSeconds: 60,
        clockTimeSeconds: now,
      });

      const result = verifyQStashSignature({
        signature,
        body: rawBody,
        url: targetUrl,
        currentSigningKey: currentKey,
        toleranceSeconds: 300,
        clockTimeSeconds: now + 500, // 500s later > 60 + 300 tolerance
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Signature expired');
    });

    it('rejects malformed signature headers', () => {
      const res1 = verifyQStashSignature({
        signature: 'not-a-jwt',
        body: rawBody,
        currentSigningKey: currentKey,
      });
      expect(res1.valid).toBe(false);
      expect(res1.reason).toContain('expected 3 dot-separated segments');

      const res2 = verifyQStashSignature({
        signature: '',
        body: rawBody,
        currentSigningKey: currentKey,
      });
      expect(res2.valid).toBe(false);
      expect(res2.reason).toContain('Missing Upstash-Signature header');
    });
  });

  describe('QStashReceiver', () => {
    it('verifies signatures using configured instance keys', () => {
      const receiver = new QStashReceiver({
        currentSigningKey: currentKey,
        nextSigningKey: nextKey,
      });

      const sigNext = signQStashMessage({ body: rawBody, url: targetUrl, key: nextKey });
      const result = receiver.verify({
        signature: sigNext,
        body: rawBody,
        url: targetUrl,
      });

      expect(result.valid).toBe(true);
      expect(result.keyUsed).toBe('next');
    });
  });

  describe('QStashClient', () => {
    it('publishes delayed retry message with proper QStash headers', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ messageId: 'msg_qstash_999' }), { status: 200 })
      );

      const client = new QStashClient({
        baseUrl: 'https://qstash.upstash.io/v2',
        token: 'qstash_bearer_token',
      });

      const res = await client.publish({
        destinationUrl: targetUrl,
        body: { event: 'retry_webhook', deliveryId: 'whd_123' },
        delaySeconds: 60,
        retries: 3,
        callbackUrl: 'https://api.denaneya.com/api/v1/webhooks/callback',
        failureCallbackUrl: 'https://api.denaneya.com/api/v1/webhooks/dlq-callback',
        deduplicationId: 'dedup_whd_123',
      });

      expect(res.messageId).toBe('msg_qstash_999');
      expect(fetchSpy).toHaveBeenCalledWith(
        `https://qstash.upstash.io/v2/publish/${targetUrl}`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer qstash_bearer_token',
            'Upstash-Delay': '60s',
            'Upstash-Retries': '3',
            'Upstash-Callback': 'https://api.denaneya.com/api/v1/webhooks/callback',
            'Upstash-Failure-Callback': 'https://api.denaneya.com/api/v1/webhooks/dlq-callback',
            'Upstash-Deduplication-Id': 'dedup_whd_123',
          }),
        })
      );
    });

    it('throws if QStash token is missing', async () => {
      const client = new QStashClient({ token: '' });
      await expect(
        client.publish({
          destinationUrl: targetUrl,
          body: { test: 1 },
        })
      ).rejects.toThrow(/QStash token must be configured/);
    });
  });

  describe('Edge Case Hardening: URL bypass protection, whitespace trimming & padding tolerance', () => {
    it('rejects signature if destination URL is provided but token has no sub claim', () => {
      // Craft a token with no sub claim
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ iss: 'Upstash', exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
      const signingInput = `${header}.${payload}`;
      const sig = require('crypto').createHmac('sha256', currentKey).update(signingInput).digest('base64url');
      const tokenWithoutSub = `${signingInput}.${sig}`;

      const res = verifyQStashSignature({
        signature: tokenWithoutSub,
        body: rawBody,
        url: targetUrl,
        currentSigningKey: currentKey,
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Destination URL mismatch');
    });

    it('successfully handles signing keys with leading/trailing whitespace', () => {
      const sig = signQStashMessage({
        body: rawBody,
        url: targetUrl,
        key: `  ${currentKey}  \n`,
      });

      const res = verifyQStashSignature({
        signature: sig,
        body: rawBody,
        url: targetUrl,
        currentSigningKey: `\t${currentKey} `,
      });

      expect(res.valid).toBe(true);
      expect(res.keyUsed).toBe('current');
    });

    it('normalizes signatures with trailing base64 padding', () => {
      const sig = signQStashMessage({
        body: rawBody,
        url: targetUrl,
        key: currentKey,
      });

      // Add padding to signature segment
      const paddedSig = `${sig}==`;

      const res = verifyQStashSignature({
        signature: paddedSig,
        body: rawBody,
        url: targetUrl,
        currentSigningKey: currentKey,
      });

      expect(res.valid).toBe(true);
    });
  });
});
