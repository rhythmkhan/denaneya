'use server';

import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, invoiceItems } from '@denaneya/database';
import { requireMerchant } from '@/lib/auth/rbac-guard';
import { revalidatePath } from 'next/cache';
import { Paisa } from '@denaneya/payment-core';

export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unitPriceBDT: number | string;
  taxRateBps?: number;
}

export async function createInvoiceAction(params: {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  dueDate: string;
  items: InvoiceItemInput[];
  notes?: string;
}) {
  const { merchantId } = await requireMerchant('invoices:write');

  if (!params.customerName || !params.customerEmail || !params.items.length) {
    throw new Error('Customer information and at least one item are required.');
  }

  const invoiceId = 'inv_' + crypto.randomBytes(12).toString('hex');
  const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  let calculatedSubtotalPaisa = 0n;
  let calculatedTaxPaisa = 0n;

  const itemRecords = params.items.map((item) => {
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const unitPricePaisa = Paisa.fromBDT(String(item.unitPriceBDT).trim()).toPaisa();
    const taxBps = BigInt(item.taxRateBps || 0);
    const basePaisa = BigInt(qty) * unitPricePaisa;
    const taxPaisa = (basePaisa * taxBps) / 10000n;
    const totalPaisa = basePaisa + taxPaisa;

    calculatedSubtotalPaisa += basePaisa;
    calculatedTaxPaisa += taxPaisa;

    return {
      id: 'itm_' + crypto.randomBytes(12).toString('hex'),
      invoiceId,
      description: item.description,
      quantity: qty,
      unitPricePaisa,
      taxRateBps: Number(taxBps),
      totalPaisa,
    };
  });

  const totalAmountPaisa = calculatedSubtotalPaisa + calculatedTaxPaisa;

  if (db) {
    await db.transaction(async (tx) => {
      await tx.insert(invoices).values({
        id: invoiceId,
        merchantId,
        invoiceNumber,
        customerName: params.customerName,
        customerEmail: params.customerEmail,
        customerPhone: params.customerPhone || null,
        subtotalPaisa: calculatedSubtotalPaisa,
        taxPaisa: calculatedTaxPaisa,
        discountPaisa: 0n,
        totalAmountPaisa,
        currency: 'BDT',
        status: 'DRAFT',
        dueDate: new Date(params.dueDate),
        notes: params.notes || null,
      });

      for (const item of itemRecords) {
        await tx.insert(invoiceItems).values(item);
      }
    });
  }

  revalidatePath('/dashboard/invoices');
  return { success: true, invoiceId, invoiceNumber };
}

export async function sendInvoiceAction(invoiceId: string) {
  const { merchantId } = await requireMerchant('invoices:write');

  if (db) {
    await db
      .update(invoices)
      .set({
        status: 'SENT',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(invoices.id, invoiceId),
          eq(invoices.merchantId, merchantId)
        )
      );
  }

  revalidatePath('/dashboard/invoices');
  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  return { success: true };
}
