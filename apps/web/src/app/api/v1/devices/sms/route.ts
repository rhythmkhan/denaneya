import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { collectorDevices, collectorEvents, smsMessages, payments } from '@denaneya/database';
import { jsonResponse } from '@/lib/api/response';
import { ApiError, handleRouteError } from '@/lib/api/errors';
import { parseMfsSms, BalanceChainEngine } from '@denaneya/sms-parser';
import { settlePaymentAtomic } from '@denaneya/ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { verifySignedCollectorPayload } from '@/lib/api/device-auth';

export async function POST(request: NextRequest) {
  let requestId = 'req_' + Date.now();
  try {
    const rawPayload = await request.json().catch(() => {
      throw new ApiError('BAD_REQUEST', 'Malformed JSON in request body.', 400, requestId);
    });

    const { device } = await verifySignedCollectorPayload(rawPayload, 'SMS_RECEIVED', requestId);
    const { sequenceNumber, nonce, timestamp, eventType, payload, signature } = rawPayload;

    // 6. Record Collector Event & Update Device Sequence
    if (db) {
      await db.transaction(async (tx) => {
        await tx.insert(collectorEvents).values({
          id: 'evt_' + crypto.randomBytes(12).toString('hex'),
          deviceId: device.id,
          merchantId: device.merchantId,
          sequenceNumber: BigInt(sequenceNumber),
          nonce,
          eventType: eventType as any,
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
            batteryLevel: payload.batteryLevel ?? device.batteryLevel,
            isCharging: payload.isCharging ?? device.isCharging,
          })
          .where(eq(collectorDevices.id, device.id));
      });
    }

    // 7. Parse SMS & Deduplication
    const sender = payload.sender || '';
    const messageText = payload.messageText || '';
    const parsedSms = parseMfsSms(sender, messageText);
    const smsId = 'sms_' + crypto.randomBytes(12).toString('hex');
    const smsHash = parsedSms.smsHash || crypto.createHash('sha256').update(sender + messageText).digest('hex');

    if (db) {
      const [existingSms] = await db
        .select()
        .from(smsMessages)
        .where(eq(smsMessages.hash, smsHash));

      if (existingSms) {
        return jsonResponse({
          status: 'DUPLICATE_IGNORED',
          message: 'SMS message has already been received and processed.',
          smsId: existingSms.id,
        });
      }

      await db.insert(smsMessages).values({
        id: smsId,
        merchantId: device.merchantId,
        deviceId: device.id,
        provider: parsedSms.provider,
        sender,
        text: messageText,
        amountPaisa: parsedSms.amountPaisa.amountPaisa,
        trxId: parsedSms.trxId || null,
        counterpartyMsisdn: parsedSms.counterparty || null,
        rollingBalancePaisa: parsedSms.balancePaisa?.amountPaisa || null,
        feePaisa: parsedSms.feePaisa?.amountPaisa || 0n,
        hash: smsHash,
        parserVersion: parsedSms.parserVersion,
        simSlot: payload.simSlot ?? 0,
        receivedAt: new Date(payload.receivedAt || Date.now()),
        status: parsedSms.status === 'PARSER_UNRECOGNIZED' ? 'PARSER_UNRECOGNIZED' : 'PARSED',
      });
    }

    // 8. Balance Continuity Verification
    if (parsedSms.balancePaisa) {
      BalanceChainEngine.verify({
        walletId: `${device.merchantId}_${parsedSms.provider}`,
        incomingSms: parsedSms,
        previousBalancePaisa: null,
      });
    }

    // 9. Payment Matching & Atomic Settlement
    let matchedPaymentId: string | null = null;
    if (parsedSms.trxId && parsedSms.amountPaisa.isPositive() && db) {
      const candidatePayments = await db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.merchantId, device.merchantId),
            eq(payments.amountPaisa, parsedSms.amountPaisa.amountPaisa),
            eq(payments.status, 'REQUIRES_ACTION')
          )
        );

      if (candidatePayments.length > 0 && candidatePayments[0]) {
        const candidate = candidatePayments[0];
        matchedPaymentId = candidate.id;

        await settlePaymentAtomic(db, {
          paymentId: candidate.id,
          providerTrxId: parsedSms.trxId,
          provider: parsedSms.provider,
          amountPaisa: parsedSms.amountPaisa.amountPaisa,
          smsMessageId: smsId,
        });
      }
    }

    return jsonResponse(
      {
        status: 'PROCESSED',
        smsId,
        provider: parsedSms.provider,
        trxId: parsedSms.trxId,
        matchedPaymentId,
      },
      { status: 200 }
    );
  } catch (err) {
    return handleRouteError(err, requestId);
  }
}
