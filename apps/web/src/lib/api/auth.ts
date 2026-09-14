import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { apiKeys, merchants } from '@denaneya/database';
import { ApiError } from './errors';

export interface AuthenticatedContext {
  merchant: {
    id: string;
    name: string;
    businessName: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
    environment: 'SANDBOX' | 'PRODUCTION';
    feeRateBps: number;
    fixedFeePaisa: bigint;
    defaultCurrency: string;
    webhookSecret?: string | null;
  };
  apiKey: {
    id: string;
    name: string;
    keyPrefix: string;
    type: 'SECRET' | 'PUBLISHABLE';
    environment: 'SANDBOX' | 'PRODUCTION';
    scopes: string[];
  };
  requestId: string;
}

export const API_KEY_REGEX = /^dn_(live|test)_(sec|pub)_([a-zA-Z0-9]{32,64})$/;

export function matchesScope(scopes: string[], requiredScope: string): boolean {
  const hasWildcard = scopes.includes('*') || scopes.includes(`${requiredScope.split(':')[0]}:*`);
  return hasWildcard || scopes.includes(requiredScope);
}

export interface KeyLifecycleRecord {
  revokedAt?: Date | null;
  revokedReason?: string | null;
  expiresAt?: Date | null;
}

export function assertKeyUsable(
  key: KeyLifecycleRecord,
  requestId: string = 'req_lifecycle'
): void {
  if (key.revokedAt) {
    throw new ApiError(
      'API_KEY_REVOKED',
      `API key was revoked on ${key.revokedAt.toISOString()}: ${key.revokedReason ?? 'No reason provided'}`,
      401,
      requestId
    );
  }

  if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) {
    throw new ApiError('API_KEY_EXPIRED', 'API key has expired.', 401, requestId);
  }
}

export const validateApiKeyLifecycle = assertKeyUsable;

export function verifyKeyHash(dbKeyHash: string, candidateKeyHash: string): boolean {
  try {
    const dbHashBuffer = Buffer.from(dbKeyHash, 'hex');
    const targetBuffer = Buffer.from(candidateKeyHash, 'hex');
    return dbHashBuffer.length === targetBuffer.length && crypto.timingSafeEqual(dbHashBuffer, targetBuffer);
  } catch {
    return false;
  }
}

export async function authenticateApiKey(
  request: NextRequest,
  requiredScope?: string
): Promise<AuthenticatedContext> {
  const requestId = request.headers.get('x-request-id') || `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ApiError('UNAUTHORIZED', 'Missing or invalid Authorization header. Expected Bearer token.', 401, requestId);
  }

  const rawKey = authHeader.slice(7).trim();
  const keyMatch = rawKey.match(API_KEY_REGEX);

  if (!keyMatch) {
    throw new ApiError('UNAUTHORIZED', 'Malformed API key format.', 401, requestId);
  }

  const envType = keyMatch[1] === 'live' ? 'PRODUCTION' : 'SANDBOX';
  const keyPrefix = rawKey.slice(0, 16);
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  // Look up candidate key records by prefix and environment
  const candidateKeys = db ? await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.keyPrefix, keyPrefix),
        eq(apiKeys.environment, envType)
      )
    ) : [];

  if (!candidateKeys || candidateKeys.length === 0) {
    throw new ApiError('UNAUTHORIZED', 'Invalid API key.', 401, requestId);
  }

  // Constant-time hash verification
  const matchedKey = candidateKeys.find((k) => verifyKeyHash(k.keyHash, keyHash));

  if (!matchedKey) {
    throw new ApiError('UNAUTHORIZED', 'Invalid API key.', 401, requestId);
  }

  // Check revocation and expiration lifecycle
  assertKeyUsable(matchedKey, requestId);

  // Fetch Merchant
  const [merchant] = db ? await db
    .select()
    .from(merchants)
    .where(eq(merchants.id, matchedKey.merchantId)) : [];

  if (!merchant) {
    throw new ApiError('UNAUTHORIZED', 'Associated merchant account not found.', 401, requestId);
  }

  if (merchant.status !== 'ACTIVE') {
    throw new ApiError('FORBIDDEN', `Merchant account is currently ${merchant.status.toLowerCase()}.`, 403, requestId);
  }

  // Enforce Scopes
  if (requiredScope) {
    const scopes = matchedKey.scopes as string[];
    if (!matchesScope(scopes, requiredScope)) {
      throw new ApiError('INSUFFICIENT_PERMISSIONS', `API key lacks required scope '${requiredScope}'.`, 403, requestId, {
        requiredScope,
        providedScopes: scopes,
      });
    }
  }

  // Asynchronously update lastUsedAt without blocking
  if (db) {
    db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, matchedKey.id))
      .catch(() => {});
  }

  return {
    merchant: {
      id: merchant.id,
      name: merchant.name,
      businessName: merchant.businessName,
      status: merchant.status,
      environment: merchant.environment,
      feeRateBps: merchant.feeRateBps,
      fixedFeePaisa: merchant.fixedFeePaisa,
      defaultCurrency: merchant.defaultCurrency,
      webhookSecret: merchant.webhookSecret,
    },
    apiKey: {
      id: matchedKey.id,
      name: matchedKey.name,
      keyPrefix: matchedKey.keyPrefix,
      type: matchedKey.type,
      environment: matchedKey.environment,
      scopes: matchedKey.scopes as string[],
    },
    requestId,
  };
}
