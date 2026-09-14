import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { hashPassword, verifyPassword } from '@denaneya/security';
import {
  authenticateApiKey,
  API_KEY_REGEX,
  verifyKeyHash,
  assertKeyUsable,
  matchesScope,
} from '../../src/lib/api/auth';
import { ApiError } from '../../src/lib/api/errors';

describe('API Key Authentication & Security Mechanics', () => {
  it('correctly matches valid DenaNeya API key formats using production API_KEY_REGEX', () => {
    const liveSec = 'dn_live_sec_12345678901234567890123456789012';
    const testPub = 'dn_test_pub_abcdefabcdefabcdefabcdefabcdefab';
    const invalidPrefix = 'invalid_pref_12345678901234567890123456789012';
    const shortKey = 'dn_live_sec_short';

    expect(API_KEY_REGEX.test(liveSec)).toBe(true);
    expect(API_KEY_REGEX.test(testPub)).toBe(true);
    expect(API_KEY_REGEX.test(invalidPrefix)).toBe(false);
    expect(API_KEY_REGEX.test(shortKey)).toBe(false);
  });

  it('performs constant-time timing-safe hash comparison via verifyKeyHash', () => {
    const rawKey = 'dn_live_sec_99999999999999999999999999999999';
    const correctHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const incorrectHash = crypto.createHash('sha256').update(rawKey + '_wrong').digest('hex');

    expect(verifyKeyHash(correctHash, correctHash)).toBe(true);
    expect(verifyKeyHash(correctHash, incorrectHash)).toBe(false);
    expect(verifyKeyHash(correctHash, 'short_hash')).toBe(false);
  });

  it('hashes and verifies passwords using genuine Argon2id implementation', async () => {
    const password = 'StrongPassword123!@#';
    const passwordHash = await hashPassword(password);

    // Verify PHC string format
    expect(passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(passwordHash).toContain('m=65536,t=3,p=1');

    // Verify correct password matches
    const isValid = await verifyPassword(passwordHash, password);
    expect(isValid).toBe(true);

    // Verify wrong password fails
    const isInvalid = await verifyPassword(passwordHash, 'WrongPassword123!@#');
    expect(isInvalid).toBe(false);
  });

  it('enforces API key scope matching rules including wildcards via exported matchesScope', () => {
    expect(matchesScope(['*'], 'payments:write')).toBe(true);
    expect(matchesScope(['payments:*'], 'payments:write')).toBe(true);
    expect(matchesScope(['payments:*'], 'payments:read')).toBe(true);
    expect(matchesScope(['payments:*'], 'invoices:write')).toBe(false);
    expect(matchesScope(['payments:read', 'payments:write'], 'payments:write')).toBe(true);
    expect(matchesScope(['payments:read'], 'payments:write')).toBe(false);
  });

  it('authenticateApiKey rejects unauthenticated requests with HTTP 401', async () => {
    const noHeaderReq = new NextRequest('http://localhost/api/v1/payments');
    await expect(authenticateApiKey(noHeaderReq)).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });

    const malformedReq = new NextRequest('http://localhost/api/v1/payments', {
      headers: { authorization: 'Bearer bad_key' },
    });
    await expect(authenticateApiKey(malformedReq)).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });

    const nonExistentKeyReq = new NextRequest('http://localhost/api/v1/payments', {
      headers: { authorization: 'Bearer dn_live_sec_12345678901234567890123456789012' },
    });
    await expect(authenticateApiKey(nonExistentKeyReq)).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  });

  it('validates expiration and revocation state transitions via exported assertKeyUsable', () => {
    const activeKey = {
      id: 'key_1',
      revokedAt: null,
      revokedReason: null,
      expiresAt: new Date(Date.now() + 86400000), // +1 day
    };

    const revokedKey = {
      id: 'key_2',
      revokedAt: new Date(),
      revokedReason: 'Compromised key rotated by admin',
      expiresAt: null,
    };

    const expiredKey = {
      id: 'key_3',
      revokedAt: null,
      revokedReason: null,
      expiresAt: new Date(Date.now() - 1000), // expired 1s ago
    };

    // Active key passes lifecycle validation without error
    expect(() => assertKeyUsable(activeKey)).not.toThrow();

    // Revoked key throws ApiError with code API_KEY_REVOKED and status 401
    expect(() => assertKeyUsable(revokedKey)).toThrowError(ApiError);
    try {
      assertKeyUsable(revokedKey);
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.code).toBe('API_KEY_REVOKED');
      expect(err.statusCode).toBe(401);
      expect(err.message).toContain('Compromised key rotated by admin');
    }

    // Expired key throws ApiError with code API_KEY_EXPIRED and status 401
    expect(() => assertKeyUsable(expiredKey)).toThrowError(ApiError);
    try {
      assertKeyUsable(expiredKey);
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.code).toBe('API_KEY_EXPIRED');
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe('API key has expired.');
    }
  });
});
