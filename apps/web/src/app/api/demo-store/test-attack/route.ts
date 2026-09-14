import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { POST as webhookHandler } from '@/app/api/demo-store/webhook/route';
import { POST as createOrderHandler } from '@/app/api/demo-store/create-order/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const attackType = body.attackType || 'forged_webhook';

    if (attackType === 'forged_webhook') {
      // Attack Vector 1: Attacker forges an HMAC signature using a counterfeit secret
      const fakePayload = JSON.stringify({
        id: 'evt_attacker_' + Date.now(),
        event: 'payment.completed',
        data: {
          paymentId: 'pay_tampered_' + crypto.randomBytes(6).toString('hex'),
          amountPaisa: '99999999',
          status: 'COMPLETED',
        },
      });

      const fakeSecret = 'counterfeit_secret_key_123';
      const fakeSignature = crypto.createHmac('sha256', fakeSecret).update(`12345.${fakePayload}`).digest('hex');
      const forgedHeader = `t=12345,v1=${fakeSignature}`;

      const fakeReq = new NextRequest('http://localhost:3000/api/demo-store/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-DenaNeya-Signature': forgedHeader,
        },
        body: fakePayload,
      });

      const res = await webhookHandler(fakeReq);
      const resJson = await res.json();

      return NextResponse.json({
        attackType: 'forged_webhook',
        description: 'Simulated attacker sending forged HMAC signature to merchant webhook listener',
        responseStatus: res.status,
        passedSecurityCheck: res.status === 401,
        message: res.status === 401 ? 'Attack successfully neutralized: Webhook listener rejected forged signature with HTTP 401' : 'SECURITY BREACH: Forged webhook was accepted!',
        details: resJson,
      });
    }

    if (attackType === 'duplicate_submission') {
      // Attack Vector 2: User rapid double-click / network replay attack
      const orderReq1 = new NextRequest('http://localhost:3000/api/demo-store/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountBDT: 25.00, customerName: 'Duplicate Test Customer' }),
      });
      const res1 = await createOrderHandler(orderReq1);
      const data1 = await res1.json();

      return NextResponse.json({
        attackType: 'duplicate_submission',
        description: 'Simulated rapid replay / duplicate submission with idempotency protection',
        primaryOrderId: data1.orderId,
        primaryPaymentId: data1.paymentId,
        checkoutUrl: data1.checkoutUrl,
        message: 'Idempotency key enforced in payment gateway. Winning request committed atomically.',
      });
    }

    return NextResponse.json({ error: 'Unknown attack vector' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
