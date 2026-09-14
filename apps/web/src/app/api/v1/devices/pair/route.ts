import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { collectorDevices } from '@denaneya/database';
import { jsonResponse } from '@/lib/api/response';
import { ApiError, handleRouteError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let requestId = 'req_' + Date.now();
  try {
    const rawBody = await request.json().catch(() => {
      throw new ApiError('BAD_REQUEST', 'Malformed JSON in request body.', 400, requestId);
    });

    const { deviceId, pairingToken, publicKeyHex, model, osVersion, appVersion, simSlots } = rawBody;

    if (!deviceId || !pairingToken || !publicKeyHex) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'Missing required pairing fields: deviceId, pairingToken, publicKeyHex are mandatory.',
        422,
        requestId
      );
    }

    const tokenHash = crypto.createHash('sha256').update(pairingToken).digest('hex');

    let device: any = null;
    if (db) {
      const [dev] = await db
        .select()
        .from(collectorDevices)
        .where(
          and(
            eq(collectorDevices.deviceId, deviceId),
            eq(collectorDevices.pairingTokenHash, tokenHash)
          )
        );
      device = dev;
    }

    if (!device) {
      throw new ApiError('UNAUTHORIZED', 'Invalid pairing token or unrecognized device ID.', 401, requestId);
    }

    if (device.pairingTokenExpiresAt && new Date(device.pairingTokenExpiresAt).getTime() < Date.now()) {
      throw new ApiError('UNAUTHORIZED', 'Pairing token has expired. Please generate a new QR token.', 401, requestId);
    }

    // Activate device with registered EC P-256 Public Key
    if (db) {
      await db
        .update(collectorDevices)
        .set({
          publicKeyHex,
          status: 'ACTIVE',
          pairingTokenHash: null,
          pairingTokenExpiresAt: null,
          model: model || device.model,
          osVersion: osVersion || device.osVersion,
          appVersion: appVersion || device.appVersion,
          simSlots: simSlots || device.simSlots,
          lastHeartbeatAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(collectorDevices.id, device.id));
    }

    return jsonResponse(
      {
        success: true,
        deviceId,
        status: 'ACTIVE',
        message: 'Device successfully paired and public key registered.',
        registeredAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (err) {
    return handleRouteError(err, requestId);
  }
}
