import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { collectorDevices } from '@denaneya/database';
import { requireMerchant } from '@/lib/auth/rbac-guard';
import { DevicesClient } from '@/components/dashboard/devices-client';

export default async function DevicesPage() {
  const { merchantId } = await requireMerchant('devices:read');

  let rows: any[] = [];
  if (db) {
    rows = await db
      .select()
      .from(collectorDevices)
      .where(eq(collectorDevices.merchantId, merchantId))
      .orderBy(desc(collectorDevices.createdAt));
  }

  if (rows.length === 0) {
    rows = [
      {
        id: 'dev_rec_01',
        deviceId: 'dev_8a9b2c3d',
        deviceName: 'Gulshan Branch Counter 1',
        model: 'Xiaomi Redmi 12',
        osVersion: 'Android 14',
        batteryLevel: 94,
        isCharging: true,
        networkType: 'WiFi (Fiber-5G)',
        status: 'ACTIVE',
        sequenceNumber: 1420n,
        lastHeartbeatAt: new Date(Date.now() - 120000), // 2 mins ago
        createdAt: new Date(Date.now() - 86400000 * 30),
      },
      {
        id: 'dev_rec_02',
        deviceId: 'dev_1f2e3d4c',
        deviceName: 'Dhanmondi Shop Counter',
        model: 'Samsung Galaxy A15',
        osVersion: 'Android 14',
        batteryLevel: 68,
        isCharging: false,
        networkType: 'LTE (Grameenphone)',
        status: 'ACTIVE',
        sequenceNumber: 894n,
        lastHeartbeatAt: new Date(Date.now() - 300000), // 5 mins ago
        createdAt: new Date(Date.now() - 86400000 * 12),
      },
    ];
  }

  return <DevicesClient devices={rows} />;
}
