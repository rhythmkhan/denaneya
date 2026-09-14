import { describe, it, expect, vi } from 'vitest';
import { WebhookService } from '../src/client.js';

describe('WebhookService Facade & End-to-End Integrity', () => {
  it('provides unified outbox, polling, and verification interface', async () => {
    const mockDb: any = {};
    const service = new WebhookService(mockDb);

    // 1. Test signature verification through facade
    const secret = 'whsec_facade_secret_123';
    const rawPayload = JSON.stringify({ event: 'ping', test: true });
    const timestamp = Math.floor(Date.now() / 1000);

    const { signatureHeader } = (await import('../src/signature.js')).signWebhookPayload(
      rawPayload,
      secret,
      timestamp
    );

    const verifyResult = service.verifySignature({
      payload: rawPayload,
      signatureHeader,
      secret,
      toleranceSeconds: 300,
    });

    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.timestamp).toBe(timestamp);

    // 2. Test enqueueEvent through facade
    let insertedValue: any = null;
    const mockTx = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((val) => {
          insertedValue = val;
          return Promise.resolve();
        }),
      }),
    };

    const outboxRecord = await service.enqueueEvent(mockTx, {
      merchantId: 'mer_facade_test',
      eventType: 'ping',
      payload: { ping: true },
    });

    expect(outboxRecord.status).toBe('PENDING');
    expect(insertedValue.merchantId).toBe('mer_facade_test');
  });
});