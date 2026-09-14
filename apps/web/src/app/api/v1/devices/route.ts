import { NextRequest } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { collectorDevices } from '@denaneya/database';
import { authenticateApiKey } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { jsonResponse } from '@/lib/api/response';
import { handleRouteError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  let requestId = 'req_' + Date.now();
  try {
    const authCtx = await authenticateApiKey(request, 'devices:read');
    requestId = authCtx.requestId;
    const rateHeaders = await checkRateLimit(request, authCtx.merchant.id);

    let rows: any[] = [];
    if (db) {
      rows = await db
        .select()
        .from(collectorDevices)
        .where(eq(collectorDevices.merchantId, authCtx.merchant.id))
        .orderBy(desc(collectorDevices.createdAt));
    }

    return jsonResponse(
      {
        data: rows.map((dev) => ({
          id: dev.id,
          deviceId: dev.deviceId,
          deviceName: dev.deviceName,
          model: dev.model || 'Unknown',
          osVersion: dev.osVersion || null,
          appVersion: dev.appVersion || null,
          batteryLevel: dev.batteryLevel ?? null,
          isCharging: dev.isCharging ?? null,
          networkType: dev.networkType || null,
          status: dev.status,
          lastHeartbeatAt: dev.lastHeartbeatAt ? dev.lastHeartbeatAt.toISOString() : null,
          createdAt: dev.createdAt.toISOString(),
        })),
      },
      {
        status: 200,
        headers: {
          ...rateHeaders,
          'X-Request-Id': requestId,
        },
      }
    );
  } catch (err) {
    return handleRouteError(err, requestId);
  }
}
