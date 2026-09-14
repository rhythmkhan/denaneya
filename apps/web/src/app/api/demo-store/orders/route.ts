import { NextRequest, NextResponse } from 'next/server';
import {
  getAllDemoOrders,
  getDemoWebhookLogs,
  clearDemoStoreState,
  DEMO_MERCHANT_CONFIG,
} from '@/lib/demo-store/state';
import { db } from '@/lib/db';
import { processOutboxEvents } from '@denaneya/webhooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const orders = getAllDemoOrders();
  const webhookLogs = getDemoWebhookLogs();

  return NextResponse.json({
    orders,
    webhookLogs,
    config: {
      merchantId: DEMO_MERCHANT_CONFIG.merchantId,
      storeName: DEMO_MERCHANT_CONFIG.storeName,
      currency: DEMO_MERCHANT_CONFIG.currency,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action;

    if (action === 'flush_outbox') {
      if (db) {
        const result = await processOutboxEvents(db);
        return NextResponse.json({ success: true, result });
      }
      return NextResponse.json({ success: false, message: 'Database not initialized' });
    }

    if (action === 'clear_state') {
      clearDemoStoreState();
      return NextResponse.json({ success: true, message: 'Demo store state cleared' });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
