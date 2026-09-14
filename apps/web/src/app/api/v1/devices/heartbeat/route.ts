import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { collectorDevices, collectorEvents } from '@denaneya/database';
import { jsonResponse } from '@/lib/api/response';
import { ApiError, handleRouteError } from '@/lib/api/errors';
import { verifySignedCollectorPayload } from '@/lib/api/device-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let requestId = 'req_' + Date.now();
  try {
    const rawBody = await request.json().catch(() => {
      throw new ApiError('BAD_REQUEST', 'Malformed JSON in request body.', 400, requestId);
    });

    const { device } = await verifySignedCollectorPayload(rawBody, 'HEARTBEAT', requestId);
    const { deviceId, sequenceNumber, nonce, timestamp, payload, signature } = rawBody;

    if (db) {
      await db.transaction(async (tx) => {
        await tx.insert(collectorEvents).values({
          id: 'evt_' + crypto.randomBytes(12).toString('hex'),
          deviceId: device.id,
          merchantId: device.merchantId,
          sequenceNumber: BigInt(sequenceNumber),
          nonce,
          eventType: 'HEARTBEAT',
          payload,
          signature,
          timestamp: BigInt(timestamp),
          status: 'PROCESSED',
        });

        await tx
          .update(collectorDevices)
          .set({
            sequenceNumber: BigInt(sequenceNumber),
            lastHeartbeatAt: new Date(),
            batteryLevel: payload.batteryLevel !== undefined ? payload.batteryLevel : device.batteryLevel,
            isCharging: payload.isCharging !== undefined ? payload.isCharging : device.isCharging,
            networkType: payload.networkType || device.networkType,
            updatedAt: new Date(),
          })
          .where(eq(collectorDevices.id, device.id));
      });
    }

    return jsonResponse(
      {
        success: true,
        deviceId,
        status: 'ACTIVE',
        receivedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (err) {
    return handleRouteError(err, requestId);
  }
}
