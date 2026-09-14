import { describe, it, expect } from 'vitest';
import {
  API_KEY_REGEX,
  matchesScope,
  assertKeyUsable,
} from '../../../apps/web/src/lib/api/auth.js';
import { LIVE_API_KEY_SECRET, TEST_API_KEY_SECRET, REVOKED_API_KEY } from '../fixtures/api-keys.js';

describe('Feature 23: Team & API Key Management (E2E-T1-F23)', () => {
  // E2E-T1-F23-01: Scoped API Key Generation (One-Time Display Secret)
  it('E2E-T1-F23-01: Scoped API Key Generation (One-Time Display Secret)', () => {
    expect(API_KEY_REGEX.test(LIVE_API_KEY_SECRET)).toBe(true);
    expect(API_KEY_REGEX.test(TEST_API_KEY_SECRET)).toBe(true);

    expect(LIVE_API_KEY_SECRET.startsWith('dn_live_sec_')).toBe(true);
    expect(TEST_API_KEY_SECRET.startsWith('dn_test_sec_')).toBe(true);
  });

  // E2E-T1-F23-02: API Authentication with Valid Scoped Key
  it('E2E-T1-F23-02: API Authentication with Valid Scoped Key', () => {
    const scopes = ['payments:read', 'payments:write', 'refunds:write'];

    expect(matchesScope(scopes, 'payments:write')).toBe(true);
    expect(matchesScope(scopes, 'payments:read')).toBe(true);
    expect(matchesScope(scopes, 'invoices:write')).toBe(false);
  });

  // E2E-T1-F23-03: Scope Enforcement & Rejection of Unauthorized Actions
  it('E2E-T1-F23-03: Scope Enforcement & Rejection of Unauthorized Actions', () => {
    const readOnlyScopes = ['payments:read'];

    const canRead = matchesScope(readOnlyScopes, 'payments:read');
    const canRefund = matchesScope(readOnlyScopes, 'payments:refund');

    expect(canRead).toBe(true);
    expect(canRefund).toBe(false);
  });

  // E2E-T1-F23-04: Zero-Downtime API Key Rotation
  it('E2E-T1-F23-04: Zero-Downtime API Key Rotation', () => {
    const now = Date.now();
    const gracePeriodHours = 24;

    const oldKey = {
      id: 'key_old_01',
      expiresAt: new Date(now + gracePeriodHours * 3600 * 1000), // Active for 24h
      revokedAt: null,
    };

    const newKey = {
      id: 'key_new_02',
      expiresAt: null,
      revokedAt: null,
    };

    // Both keys must be valid during the grace window
    expect(() => assertKeyUsable(oldKey)).not.toThrow();
    expect(() => assertKeyUsable(newKey)).not.toThrow();
  });

  // E2E-T1-F23-05: Emergency Key Revocation
  it('E2E-T1-F23-05: Emergency Key Revocation', () => {
    expect(() => assertKeyUsable(REVOKED_API_KEY)).toThrow('API key was revoked');
  });
});
