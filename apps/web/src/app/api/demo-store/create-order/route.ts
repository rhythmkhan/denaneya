import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import {
  saveDemoOrder,
  DEMO_MERCHANT_CONFIG,
  type DemoOrder,
} from '@/lib/demo-store/state';
import { POST as createPaymentApi } from '@/app/api/v1/payments/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const amountBDT = Math.max(0.01, Number(body.amountBDT || 10.00));
    const customerName = String(body.customerName || 'Test Customer').trim();
    const customerEmail = String(body.customerEmail || 'customer@example.com').trim();
    const customerPhone = String(body.customerPhone || '01712345678').trim();
    const deliveryAddress = body.deliveryAddress || {
      street: 'House 12, Road 4, Dhanmondi',
      city: 'Dhaka',
      state: 'Dhaka',
      postalCode: '1209',
      country: 'BD',
    };

    const orderId = `ORD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const amountPaisa = BigInt(Math.round(amountBDT * 100));

    // Resolve base application origin
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
    const protocol = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    const baseUrl = `${protocol}://${host}`;
    const redirectUrl = `${baseUrl}/demo-store/success?order_id=${orderId}`;

    const paymentRequestPayload = {
      amountPaisa: amountPaisa.toString(),
      currency: 'BDT',
      provider: 'SANDBOX',
      customer: {
        name: customerName,
        email: customerEmail,
        phone: customerPhone,
        billingAddress: deliveryAddress,
      },
      description: `Order ${orderId} - Demo Gadget Purchase`,
      redirectUrl,
      metadata: {
        orderId,
        storeName: DEMO_MERCHANT_CONFIG.storeName,
        redirectUrl,
      },
    };

    const idempotencyKey = `idemp_${orderId}`;

    // Execute server-to-server call to DenaNeya's Payment API
    let paymentData: any = null;

    // Try HTTP fetch first for genuine network routing validation
    try {
      const response = await fetch(`${baseUrl}/api/v1/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEMO_MERCHANT_CONFIG.apiKey}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(paymentRequestPayload),
        signal: AbortSignal.timeout(800),
      });

      if (response.ok) {
        paymentData = await response.json();
      }
    } catch {
      // Network loopback fallback (for environments where self-referencing fetch is restricted)
    }

    // Direct route invocation fallback for zero-network environments
    if (!paymentData) {
      const internalReq = new NextRequest(new URL('/api/v1/payments', baseUrl).toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEMO_MERCHANT_CONFIG.apiKey}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(paymentRequestPayload),
      });
      const internalRes = await createPaymentApi(internalReq);
      paymentData = await internalRes.json();
    }

    if (!paymentData || !paymentData.id) {
      return NextResponse.json(
        { error: 'Failed to create payment in DenaNeya gateway', details: paymentData },
        { status: 502 }
      );
    }

    const paymentId = paymentData.id;
    const checkoutUrl = `/checkout/${paymentId}`;

    // Save order in Demo Store Local DB
    const orderRecord: DemoOrder = {
      orderId,
      paymentId,
      amountBDT,
      amountPaisa: amountPaisa.toString(),
      customerName,
      customerEmail,
      customerPhone,
      status: 'PENDING',
      apiVerified: false,
      webhookVerified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveDemoOrder(orderRecord);

    return NextResponse.json({
      success: true,
      orderId,
      paymentId,
      checkoutUrl,
      amountBDT,
      status: 'PENDING',
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Internal Server Error in Demo Store', message: err.message },
      { status: 500 }
    );
  }
}
