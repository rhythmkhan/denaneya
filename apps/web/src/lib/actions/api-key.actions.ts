'use server';

import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { apiKeys } from '@denaneya/database';
import { requireMerchant } from '@/lib/auth/rbac-guard';
import { revalidatePath } from 'next/cache';

export async function createApiKeyAction(params: {
  name: string;
  type?: 'SECRET' | 'PUBLISHABLE';
  environment?: 'SANDBOX' | 'PRODUCTION';
  scopes?: string[];
}) {
  const { merchantId } = await requireMerchant('api_keys:create');

  const keyType = params.type || 'SECRET';
  const env = params.environment || 'SANDBOX';
  const prefix = env === 'PRODUCTION' ? (keyType === 'SECRET' ? 'dn_live_sec_' : 'dn_live_pub_') : (keyType === 'SECRET' ? 'dn_test_sec_' : 'dn_test_pub_');
  const rawToken = crypto.randomBytes(16).toString('hex');
  const fullPlaintextKey = `${prefix}${rawToken}`;
  const keyPrefix = fullPlaintextKey.slice(0, 16);
  const keyHash = crypto.createHash('sha256').update(fullPlaintextKey).digest('hex');

  const keyId = 'key_' + crypto.randomBytes(12).toString('hex');
  const scopes = params.scopes?.length ? params.scopes : ['payments:read', 'payments:write'];

  if (db) {
    await db.insert(apiKeys).values({
      id: keyId,
      merchantId,
      name: params.name || 'API Key',
      keyPrefix,
      keyHash,
      type: keyType,
      environment: env,
      scopes,
    });
  }

  revalidatePath('/dashboard/api-keys');
  return {
    success: true,
    keyId,
    plaintextKey: fullPlaintextKey, // Disclosed ONLY once upon creation!
  };
}

export async function rotateApiKeyAction(keyId: string) {
  const { merchantId } = await requireMerchant('api_keys:rotate');

  if (!db) {
    return { success: true, plaintextKey: 'dn_test_sec_rotated123' };
  }

  const [oldKey] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.merchantId, merchantId)));

  if (!oldKey) {
    throw new Error('Key not found.');
  }

  // Grace period: old key expires in 24 hours
  const gracePeriodExpiry = new Date(Date.now() + 24 * 3600 * 1000);
  await db
    .update(apiKeys)
    .set({ expiresAt: gracePeriodExpiry, updatedAt: new Date() })
    .where(eq(apiKeys.id, keyId));

  // Issue new key with same config
  const prefix = oldKey.keyPrefix.slice(0, 12);
  const rawToken = crypto.randomBytes(16).toString('hex');
  const newPlaintextKey = `${prefix}${rawToken}`;
  const newPrefix = newPlaintextKey.slice(0, 16);
  const newHash = crypto.createHash('sha256').update(newPlaintextKey).digest('hex');
  const newKeyId = 'key_' + crypto.randomBytes(12).toString('hex');

  await db.insert(apiKeys).values({
    id: newKeyId,
    merchantId,
    name: `${oldKey.name} (Rotated)`,
    keyPrefix: newPrefix,
    keyHash: newHash,
    type: oldKey.type,
    environment: oldKey.environment,
    scopes: oldKey.scopes,
  });

  revalidatePath('/dashboard/api-keys');
  return {
    success: true,
    keyId: newKeyId,
    plaintextKey: newPlaintextKey,
    gracePeriodExpiresAt: gracePeriodExpiry.toISOString(),
  };
}

export async function revokeApiKeyAction(keyId: string, reason: string = 'Revoked by administrator') {
  const { merchantId } = await requireMerchant('api_keys:revoke');

  if (db) {
    await db
      .update(apiKeys)
      .set({
        revokedAt: new Date(),
        revokedReason: reason,
        updatedAt: new Date(),
      })
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.merchantId, merchantId)));
  }

  revalidatePath('/dashboard/api-keys');
  return { success: true };
}
