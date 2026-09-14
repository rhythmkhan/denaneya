import { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { invoices, invoiceItems } from '@denaneya/database';
import { authenticateApiKey } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { jsonResponse } from '@/lib/api/response';
import { ApiError, handleRouteError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const updateInvoiceBodySchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'VOID']).optional(),
  dueDate: z.string().optional(),
  notes: z.string().trim().max(1000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let requestId = 'req_' + Date.now();
  try {
    const { id } = await params;
    const authCtx = await authenticateApiKey(request, 'invoices:read');
    requestId = authCtx.requestId;
    const rateHeaders = await checkRateLimit(request, authCtx.merchant.id);

    let invoice: any = null;
    let items: any[] = [];

    if (db) {
      const [inv] = await db
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.id, id),
            eq(invoices.merchantId, authCtx.merchant.id)
          )
        );
      invoice = inv;

      if (invoice) {
        items = await db
          .select()
          .from(invoiceItems)
          .where(eq(invoiceItems.invoiceId, invoice.id));
      }
    }

    if (!invoice) {
      throw new ApiError('NOT_FOUND', `Invoice '${id}' not found.`, 404, requestId);
    }

    return jsonResponse(
      {
        id: invoice.id,
        merchantId: invoice.merchantId,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
        customerEmail: invoice.customerEmail,
        customerPhone: invoice.customerPhone,
        customerAddress: invoice.customerAddress,
        subtotalPaisa: invoice.subtotalPaisa.toString(),
        taxPaisa: invoice.taxPaisa.toString(),
        discountPaisa: invoice.discountPaisa.toString(),
        totalAmountPaisa: invoice.totalAmountPaisa.toString(),
        currency: invoice.currency,
        status: invoice.status,
        dueDate: invoice.dueDate.toISOString(),
        paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
        items: items.map((i) => ({
          id: i.id,
          description: i.description,
          quantity: i.quantity,
          unitPricePaisa: i.unitPricePaisa.toString(),
          taxRateBps: i.taxRateBps,
          totalPaisa: i.totalPaisa.toString(),
        })),
        notes: invoice.notes,
        createdAt: invoice.createdAt.toISOString(),
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let requestId = 'req_' + Date.now();
  try {
    const { id } = await params;
    const authCtx = await authenticateApiKey(request, 'invoices:write');
    requestId = authCtx.requestId;
    const rateHeaders = await checkRateLimit(request, authCtx.merchant.id);

    const rawBody = await request.json().catch(() => ({}));
    const parseResult = updateInvoiceBodySchema.safeParse(rawBody);

    if (!parseResult.success) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'Invalid invoice update parameters.',
        422,
        requestId,
        { errors: parseResult.error.errors }
      );
    }

    const { status, dueDate, notes, metadata } = parseResult.data;

    let existing: any = null;
    if (db) {
      const [inv] = await db
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.id, id),
            eq(invoices.merchantId, authCtx.merchant.id)
          )
        );
      existing = inv;
    }

    if (!existing) {
      throw new ApiError('NOT_FOUND', `Invoice '${id}' not found.`, 404, requestId);
    }

    if (existing.status === 'PAID') {
      throw new ApiError('BAD_REQUEST', 'Cannot modify a paid invoice.', 400, requestId);
    }

    if (existing.status === 'VOID') {
      throw new ApiError('BAD_REQUEST', 'Cannot modify a voided invoice.', 400, requestId);
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (status) {
      updates.status = status;
    }
    if (dueDate) {
      const parsedDate = new Date(dueDate);
      if (isNaN(parsedDate.getTime())) {
        throw new ApiError('VALIDATION_ERROR', 'Invalid dueDate format.', 422, requestId);
      }
      updates.dueDate = parsedDate;
    }
    if (notes !== undefined) {
      updates.notes = notes;
    }
    if (metadata !== undefined) {
      updates.metadata = metadata;
    }

    let updatedInvoice: any = existing;
    if (db) {
      const [updated] = await db
        .update(invoices)
        .set(updates)
        .where(
          and(
            eq(invoices.id, id),
            eq(invoices.merchantId, authCtx.merchant.id)
          )
        )
        .returning();
      updatedInvoice = updated;
    }

    return jsonResponse(
      {
        id: updatedInvoice.id,
        merchantId: updatedInvoice.merchantId,
        invoiceNumber: updatedInvoice.invoiceNumber,
        customerName: updatedInvoice.customerName,
        totalAmountPaisa: updatedInvoice.totalAmountPaisa.toString(),
        currency: updatedInvoice.currency,
        status: updatedInvoice.status,
        dueDate: updatedInvoice.dueDate.toISOString(),
        createdAt: updatedInvoice.createdAt.toISOString(),
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let requestId = 'req_' + Date.now();
  try {
    const { id } = await params;
    const authCtx = await authenticateApiKey(request, 'invoices:write');
    requestId = authCtx.requestId;
    const rateHeaders = await checkRateLimit(request, authCtx.merchant.id);

    let existing: any = null;
    if (db) {
      const [inv] = await db
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.id, id),
            eq(invoices.merchantId, authCtx.merchant.id)
          )
        );
      existing = inv;
    }

    if (!existing) {
      throw new ApiError('NOT_FOUND', `Invoice '${id}' not found.`, 404, requestId);
    }

    if (existing.status === 'PAID') {
      throw new ApiError('BAD_REQUEST', 'Cannot void a paid invoice.', 400, requestId);
    }

    if (db) {
      await db
        .update(invoices)
        .set({
          status: 'VOID',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(invoices.id, id),
            eq(invoices.merchantId, authCtx.merchant.id)
          )
        );
    }

    return jsonResponse(
      {
        success: true,
        message: `Invoice '${id}' marked as VOID.`,
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
