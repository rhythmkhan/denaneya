import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@denaneya/webhooks';
import {
  getDemoOrderByPaymentId,
  getDemoOrder,
  saveDemoOrder,
  recordDemoWebhookLog,
  DEMO_MERCHANT_CONFIG,
} from '@/lib/demo-store/state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const receivedAt = new Date().toISOString();
  const signatureHeader = request.headers.get('x-denaneya-signature') || '';

  let rawBody = '';
  try {
    rawBody = await request.text();
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to read request payload' }, { status: 400 });
  }

  // 1. Verify HMAC-SHA256 signature using constant-time comparison
  const verifyResult = verifyWebhookSignature({
    payload: rawBody,
    signatureHeader,
    secret: DEMO_MERCHANT_CONFIG.webhookSecret,
    toleranceSeconds: 300, // 5 minutes replay window
  });

  if (!verifyResult.valid) {
    recordDemoWebhookLog({
      id: 'log_' + Date.now().toString(36),
      receivedAt,
      eventType: 'UNKNOWN',
      paymentId: 'UNKNOWN',
      signatureHeader,
      signatureValid: false,
      payloadSummary: { error: verifyResult.reason || 'Invalid HMAC signature' },
    });

    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: 'Invalid or forged webhook signature',
        reason: verifyResult.reason,
      },
      { status: 401 }
    );
  }

  // 2. Parse verified payload
  let envelope: any = {};
  try {
    envelope = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
  }

  const eventType = envelope.event || 'payment.completed';
  const data = envelope.data || {};
  const paymentId = data.paymentId || data.id;
  const orderId = data.metadata?.orderId;

  // 3. Match Order & Update Local Merchant Database
  let matchedOrder = orderId ? getDemoOrder(orderId) : undefined;
  if (!matchedOrder && paymentId) {
    matchedOrder = getDemoOrderByPaymentId(paymentId);
  }

  if (matchedOrder) {
    if (eventType === 'payment.completed') {
      matchedOrder.status = 'PAID';
      matchedOrder.webhookVerified = true;
      matchedOrder.webhookReceivedAt = receivedAt;
      if (data.provider) matchedOrder.provider = data.provider;
      if (data.providerTrxId) matchedOrder.providerTrxId = data.providerTrxId;
      saveDemoOrder(matchedOrder);
    } else if (eventType === 'payment.failed') {
      matchedOrder.status = 'FAILED';
      matchedOrder.webhookVerified = true;
      matchedOrder.webhookReceivedAt = receivedAt;
      saveDemoOrder(matchedOrder);
    }
  }

  // 4. Record in Audit Log
  recordDemoWebhookLog({
    id: envelope.id || 'evt_' + Date.now().toString(36),
    receivedAt,
    eventType,
    paymentId: paymentId || 'N/A',
    orderId: matchedOrder?.orderId || orderId || 'N/A',
    signatureHeader,
    signatureValid: true,
    payloadSummary: {
      eventType,
      paymentId,
      amountPaisa: data.amountPaisa,
      status: data.status,
      providerTrxId: data.providerTrxId,
    },
  });

  return NextResponse.json({
    status: 'success',
    received: true,
    eventId: envelope.id,
    orderId: matchedOrder?.orderId,
  });
}
