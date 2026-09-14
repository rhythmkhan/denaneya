import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, invoiceItems, merchants } from '@denaneya/database';
import { requireMerchant } from '@/lib/auth/rbac-guard';
import { formatPaisaToBDT } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InvoiceActionsClient } from './invoice-actions-client';
import { ArrowLeft, Mail, Phone } from 'lucide-react';

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { merchantId } = await requireMerchant('invoices:read');

  let invoice: any = null;
  let items: any[] = [];
  let merchant: any = null;

  if (db) {
    const [inv] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.merchantId, merchantId)));
    invoice = inv;

    if (invoice) {
      items = await db
        .select()
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, invoice.id));

      const [m] = await db
        .select()
        .from(merchants)
        .where(eq(merchants.id, merchantId));
      merchant = m;
    }
  }

  // Fallback demo for previews
  if (!invoice) {
    if (id.startsWith('inv_demo')) {
      invoice = {
        id,
        invoiceNumber: 'INV-2026-0001',
        customerName: 'Dhaka Tech Solutions Ltd.',
        customerEmail: 'billing@dhakatech.com',
        customerPhone: '+8801711223344',
        subtotalPaisa: 11904762n,
        taxPaisa: 595238n,
        discountPaisa: 0n,
        totalAmountPaisa: 12500000n,
        currency: 'BDT',
        status: 'SENT',
        dueDate: new Date(Date.now() + 86400000 * 7),
        notes: 'Payment is due within 7 days via DenaNeya digital checkout.',
        createdAt: new Date(),
      };
      items = [
        {
          id: 'itm_01',
          description: 'Payment Orchestration API Integration',
          quantity: 1,
          unitPricePaisa: 10000000n,
          taxRateBps: 500,
          totalPaisa: 10500000n,
        },
        {
          id: 'itm_02',
          description: 'Multi-SIM Android Collector Setup',
          quantity: 2,
          unitPricePaisa: 952381n,
          taxRateBps: 500,
          totalPaisa: 2000000n,
        },
      ];
      merchant = {
        businessName: 'DenaNeya Enterprise',
        email: 'support@denaneya.com.bd',
        phone: '+88029876543',
      };
    } else {
      notFound();
    }
  }

  const subtotal = typeof invoice.subtotalPaisa === 'bigint' ? invoice.subtotalPaisa : BigInt(invoice.subtotalPaisa || 0);
  const tax = typeof invoice.taxPaisa === 'bigint' ? invoice.taxPaisa : BigInt(invoice.taxPaisa || 0);
  const total = typeof invoice.totalAmountPaisa === 'bigint' ? invoice.totalAmountPaisa : BigInt(invoice.totalAmountPaisa || 0);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between items-center print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/invoices">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Invoice {invoice.invoiceNumber}
              </h1>
              <Badge variant={invoice.status === 'PAID' ? 'success' : invoice.status === 'SENT' ? 'info' : 'secondary'}>
                {invoice.status}
              </Badge>
            </div>
            <p className="text-xs text-slate-500">
              Issued on {new Date(invoice.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <InvoiceActionsClient invoiceId={invoice.id} invoiceNumber={invoice.invoiceNumber} />
      </div>

      {/* Pixel-perfect Printable Invoice Box */}
      <div className="p-8 md:p-12 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm print:shadow-none print:border-none print:p-0">
        <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-8">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-base">
                দ
              </div>
              <span className="font-bold text-xl tracking-tight text-slate-900 dark:text-white">
                {merchant?.businessName || 'DenaNeya Merchant'}
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-500 space-y-0.5">
              {merchant?.email && <div>{merchant.email}</div>}
              {merchant?.phone && <div>{merchant.phone}</div>}
              <div>Dhaka, Bangladesh</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Invoice</div>
            <div className="font-mono text-base font-bold text-slate-900 dark:text-white mt-1">
              {invoice.invoiceNumber}
            </div>
            <div className="text-xs text-slate-500 mt-2 space-y-0.5">
              <div>Issue Date: {new Date(invoice.createdAt).toLocaleDateString()}</div>
              <div className="font-medium text-slate-700 dark:text-slate-300">
                Due Date: {new Date(invoice.dueDate).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>

        <div className="my-8 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Billed To</div>
            <div className="font-bold text-slate-900 dark:text-white text-sm mt-1">
              {invoice.customerName}
            </div>
            <div className="text-xs text-slate-500 mt-1 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <Mail className="w-3 h-3 text-slate-400" /> {invoice.customerEmail}
              </div>
              {invoice.customerPhone && (
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3 h-3 text-slate-400" /> {invoice.customerPhone}
                </div>
              )}
            </div>
          </div>
          <div className="text-right md:text-right">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Payment Status</div>
            <div className="mt-1">
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {formatPaisaToBDT(total)}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Status: <span className="font-semibold text-slate-700 dark:text-slate-300">{invoice.status}</span>
            </div>
          </div>
        </div>

        {/* Itemized Table */}
        <div className="overflow-x-auto my-8">
          <table className="w-full text-left text-xs">
            <thead className="border-y border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
              <tr>
                <th className="py-3 px-2">Description</th>
                <th className="py-3 px-2 text-center w-16">Qty</th>
                <th className="py-3 px-2 text-right w-28">Unit Price</th>
                <th className="py-3 px-2 text-center w-20">VAT</th>
                <th className="py-3 px-2 text-right w-32">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {items.map((item) => {
                const itemTotal = typeof item.totalPaisa === 'bigint' ? item.totalPaisa : BigInt(item.totalPaisa || 0);
                const unitPrice = typeof item.unitPricePaisa === 'bigint' ? item.unitPricePaisa : BigInt(item.unitPricePaisa || 0);

                return (
                  <tr key={item.id}>
                    <td className="py-3 px-2 font-medium text-slate-900 dark:text-white">
                      {item.description}
                    </td>
                    <td className="py-3 px-2 text-center text-slate-600 dark:text-slate-300">
                      {item.quantity}
                    </td>
                    <td className="py-3 px-2 text-right text-slate-600 dark:text-slate-300">
                      {formatPaisaToBDT(unitPrice)}
                    </td>
                    <td className="py-3 px-2 text-center text-slate-500">
                      {(item.taxRateBps || 0) / 100}%
                    </td>
                    <td className="py-3 px-2 text-right font-semibold text-slate-900 dark:text-white">
                      {formatPaisaToBDT(itemTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Summary Breakdown */}
        <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="w-64 space-y-2 text-xs">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal:</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {formatPaisaToBDT(subtotal)}
              </span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Total VAT / Tax:</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {formatPaisaToBDT(tax)}
              </span>
            </div>
            <div className="flex justify-between text-base font-bold text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-800">
              <span>Total Due:</span>
              <span className="text-emerald-600 dark:text-emerald-400">
                {formatPaisaToBDT(total)}
              </span>
            </div>
          </div>
        </div>

        {invoice.notes && (
          <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
            <div className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Notes / Payment Terms:</div>
            <p>{invoice.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
