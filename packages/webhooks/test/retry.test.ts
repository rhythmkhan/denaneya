import { describe, it, expect } from 'vitest';
import { calculateNextRetryDelay, RETRY_INTERVALS_MS, MAX_DELIVERY_ATTEMPTS } from '../src/retry.js';

describe('Webhook Retry Policy & Jitter', () => {
  it('calculates expected backoff delay with 20% jitter window', () => {
    // Attempt 1 -> interval 0 (1 minute = 60,000ms)
    const delay1 = calculateNextRetryDelay(1);
    expect(delay1).toBeGreaterThanOrEqual(60000);
    expect(delay1).toBeLessThanOrEqual(72000); // 60,000 + 20% jitter

    // Attempt 2 -> interval 1 (5 minutes = 300,000ms)
    const delay2 = calculateNextRetryDelay(2);
    expect(delay2).toBeGreaterThanOrEqual(300000);
    expect(delay2).toBeLessThanOrEqual(360000);

    // Attempt 3 -> interval 2 (15 minutes = 900,000ms)
    const delay3 = calculateNextRetryDelay(3);
    expect(delay3).toBeGreaterThanOrEqual(900000);
    expect(delay3).toBeLessThanOrEqual(1080000);

    // Attempt 4 -> interval 3 (1 hour = 3,600,000ms)
    const delay4 = calculateNextRetryDelay(4);
    expect(delay4).toBeGreaterThanOrEqual(3600000);
    expect(delay4).toBeLessThanOrEqual(4320000);
  });

  it('enforces maximum 5 delivery attempts ceiling', () => {
    expect(MAX_DELIVERY_ATTEMPTS).toBe(5);
    expect(RETRY_INTERVALS_MS.length).toBe(5);
  });
});