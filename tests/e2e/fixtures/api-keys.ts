import crypto from 'node:crypto';
import { TEST_CONSTANTS } from '../config/test-constants.js';

export interface TestApiKey {
  id: string;
  name: string;
  rawKey: string;
  keyPrefix: string;
  keyHash: string;
  merchantId: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  scopes: string[];
  revokedAt: Date | null;
  revokedReason: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export function hashApiKeySecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

export function generateTestApiKeyString(
  env: 'live' | 'test' = 'live',
  type: 'sec' | 'pub' = 'sec'
): string {
  return dn___;
}

export const LIVE_API_KEY_SECRET = 'dn_live_sec_11112222333344445555666677778888';
export const LIVE_API_KEY: TestApiKey = {
  id: 'key_01h8livekey012345678901',
  name: 'Live Production Key',
  rawKey: LIVE_API_KEY_SECRET,
  keyPrefix: LIVE_API_KEY_SECRET.slice(0, 16),
  keyHash: hashApiKeySecret(LIVE_API_KEY_SECRET),
  merchantId: TEST_CONSTANTS.MERCHANT_A.ID,
  environment: 'PRODUCTION',
  scopes: [
    'payments:read',
    'payments:create',
    'payments:cancel',
    'payments:refund',
    'invoices:read',
    'invoices:write',
    'payment_links:read',
    'payment_links:write',
    'webhooks:read',
    'webhooks:write',
    'devices:read',
    'devices:pair',
  ],
  revokedAt: null,
  revokedReason: null,
  expiresAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

export const TEST_API_KEY_SECRET = 'dn_test_sec_aaaabbbbccccddddeeeeffff00001111';
export const TEST_API_KEY: TestApiKey = {
  id: 'key_01h8testkey012345678901',
  name: 'Sandbox Test Key',
  rawKey: TEST_API_KEY_SECRET,
  keyPrefix: TEST_API_KEY_SECRET.slice(0, 16),
  keyHash: hashApiKeySecret(TEST_API_KEY_SECRET),
  merchantId: TEST_CONSTANTS.MERCHANT_B.ID,
  environment: 'SANDBOX',
  scopes: ['*'],
  revokedAt: null,
  revokedReason: null,
  expiresAt: null,
  createdAt: new Date('2026-01-15T00:00:00Z'),
};

export const READONLY_API_KEY_SECRET = 'dn_live_sec_readonly111122223333444455556666';
export const READONLY_API_KEY: TestApiKey = {
  id: 'key_01h8readonly01234567890',
  name: 'Readonly Key',
  rawKey: READONLY_API_KEY_SECRET,
  keyPrefix: READONLY_API_KEY_SECRET.slice(0, 16),
  keyHash: hashApiKeySecret(READONLY_API_KEY_SECRET),
  merchantId: TEST_CONSTANTS.MERCHANT_A.ID,
  environment: 'PRODUCTION',
  scopes: ['payments:read', 'invoices:read', 'payment_links:read'],
  revokedAt: null,
  revokedReason: null,
  expiresAt: null,
  createdAt: new Date('2026-02-01T00:00:00Z'),
};

export const REVOKED_API_KEY_SECRET = 'dn_live_sec_revokedkey111122223333444455556666';
export const REVOKED_API_KEY: TestApiKey = {
  id: 'key_01h8revoked012345678901',
  name: 'Compromised Revoked Key',
  rawKey: REVOKED_API_KEY_SECRET,
  keyPrefix: REVOKED_API_KEY_SECRET.slice(0, 16),
  keyHash: hashApiKeySecret(REVOKED_API_KEY_SECRET),
  merchantId: TEST_CONSTANTS.MERCHANT_A.ID,
  environment: 'PRODUCTION',
  scopes: ['payments:read', 'payments:create'],
  revokedAt: new Date('2026-02-10T12:00:00Z'),
  revokedReason: 'Key compromised during audit',
  expiresAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

export const EXPIRED_API_KEY_SECRET = 'dn_test_sec_expiredkey111122223333444455556666';
export const EXPIRED_API_KEY: TestApiKey = {
  id: 'key_01h8expired012345678901',
  name: 'Expired Key',
  rawKey: EXPIRED_API_KEY_SECRET,
  keyPrefix: EXPIRED_API_KEY_SECRET.slice(0, 16),
  keyHash: hashApiKeySecret(EXPIRED_API_KEY_SECRET),
  merchantId: TEST_CONSTANTS.MERCHANT_B.ID,
  environment: 'SANDBOX',
  scopes: ['payments:read'],
  revokedAt: null,
  revokedReason: null,
  expiresAt: new Date('2026-01-01T00:00:00Z'),
  createdAt: new Date('2025-12-01T00:00:00Z'),
};
