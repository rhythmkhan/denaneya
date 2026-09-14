'use server';

import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { collectorDevices } from '@denaneya/database';
import { requireMerchant } from '@/lib/auth/rbac-guard';
import { revalidatePath } from 'next/cache';
import { createDevicePairingSession } from '@/lib/api/device-auth';

export async function generateDevicePairingTokenAction(deviceName: string) {
  const { merchantId } = await requireMerchant('devices:pair');

  const session = createDevicePairingSession(merchantId);

  if (db) {
    await db.insert(collectorDevices).values({
      id: 'drecord_' + crypto.randomBytes(12).toString('hex'),
      deviceId: session.deviceId,
      merchantId,
      deviceName: deviceName || 'Android Collector Device',
      publicKeyHex: 'PENDING',
      status: 'PENDING_PAIRING',
      pairingTokenHash: session.tokenHash,
      pairingTokenExpiresAt: session.expiresAt,
    });
  }

  revalidatePath('/dashboard/devices');
  return {
    success: true,
    deviceId: session.deviceId,
    qrPayload: session.qrPayload,
    expiresAt: session.expiresAt.toISOString(),
  };
}

export async function revokeDeviceAction(deviceId: string) {
  const { merchantId } = await requireMerchant('devices:revoke');

  if (db) {
    await db
      .update(collectorDevices)
      .set({
        status: 'REVOKED',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(collectorDevices.deviceId, deviceId),
          eq(collectorDevices.merchantId, merchantId)
        )
      );
  }

  revalidatePath('/dashboard/devices');
  return { success: true };
}
