import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, invoiceItems } from '@denaneya/database';
import { authenticateApiKey } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { jsonResponse } from '@/lib/api/response';
import { handleRouteError } from '@/lib/api/errors';
import { createInvoiceSchema } from '@denaneya/payment-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let requestId = 'req_' + Date.now();
  try {
    const authCtx = await authenticateApiKey(request, 'invoices:write');
    requestId = authCtx.requestId;
    const rateHeaders = await checkRateLimit(request, authCtx.merchant.id);

    const rawBody = await request.json();
    const invoiceNumber =
      rawBody.invoiceNumber ||
      `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const validated = createInvoiceSchema.parse({
      ...rawBody,
      merchantId: authCtx.merchant.id,
      invoiceNumber,
      currency: 'BDT',
    });

    const subtotalPaisa = validated.items.reduce((acc, item) => acc + item.totalPaisa, 0n);
    const totalAmountPaisa = subtotalPaisa + validated.taxPaisa - validated.discountPaisa;

    const invoiceId = 'inv_' + crypto.randomBytes(12).toString('hex');

    if (db) {
      await db.transaction(async (tx) => {
        await tx.insert(invoices).values({
          id: invoiceId,
          merchantId: authCtx.merchant.id,
          invoiceNumber,
          customerName: validated.customer.name,
          customerEmail: validated.customer.email,
          customerPhone: validated.customer.phone || null,
          customerAddress: validated.customer.billingAddress || null,
          subtotalPaisa,
          taxPaisa: validated.taxPaisa,
          discountPaisa: validated.discountPaisa,
          totalAmountPaisa,
          currency: 'BDT',
          status: 'DRAFT',
          dueDate: validated.dueDate,
          notes: validated.notes || null,
          metadata: validated.metadata || null,
        });

        for (const item of validated.items) {
          await tx.insert(invoiceItems).values({
            id: 'itm_' + crypto.randomBytes(12).toString('hex'),
            invoiceId,
            description: item.description,
            quantity: item.quantity,
            unitPricePaisa: item.unitPricePaisa,
            taxRateBps: item.taxRateBps,
            totalPaisa: item.totalPaisa,
          });
        }
      });
    }

    return jsonResponse(
      {
        id: invoiceId,
        merchantId: authCtx.merchant.id,
        invoiceNumber,
        subtotalPaisa: subtotalPaisa.toString(),
        taxPaisa: validated.taxPaisa.toString(),
        discountPaisa: validated.discountPaisa.toString(),
        totalAmountPaisa: totalAmountPaisa.toString(),
        currency: 'BDT',
        status: 'DRAFT',
        dueDate: validated.dueDate.toISOString(),
        customer: validated.customer,
        itemsCount: validated.items.length,
        createdAt: new Date().toISOString(),
      },
      {
        status: 201,
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

export async function GET(request: NextRequest) {
  let requestId = 'req_' + Date.now();
  try {
    const authCtx = await authenticateApiKey(request, 'invoices:read');
    requestId = authCtx.requestId;
    const rateHeaders = await checkRateLimit(request, authCtx.merchant.id);

    let rows: any[] = [];
    if (db) {
      rows = await db
        .select()
        .from(invoices)
        .where(eq(invoices.merchantId, authCtx.merchant.id))
        .orderBy(desc(invoices.createdAt));
    }

    return jsonResponse(
      {
        data: rows.map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          customerName: inv.customerName,
          customerEmail: inv.customerEmail,
          totalAmountPaisa: inv.totalAmountPaisa.toString(),
          currency: inv.currency,
          status: inv.status,
          dueDate: inv.dueDate.toISOString(),
          createdAt: inv.createdAt.toISOString(),
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
