import Link from 'next/link';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices } from '@denaneya/database';
import { requireMerchant } from '@/lib/auth/rbac-guard';
import { formatPaisaToBDT } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, FileText, ArrowUpRight } from 'lucide-react';

export default async function InvoicesPage() {
  const { merchantId } = await requireMerchant('invoices:read');

  let rows: any[] = [];
  if (db) {
    rows = await db
      .select()
      .from(invoices)
      .where(eq(invoices.merchantId, merchantId))
      .orderBy(desc(invoices.createdAt));
  }

  if (rows.length === 0) {
    rows = [
      {
        id: 'inv_demo_01',
        invoiceNumber: 'INV-2026-0001',
        customerName: 'Dhaka Tech Solutions Ltd.',
        customerEmail: 'billing@dhakatech.com',
        totalAmountPaisa: 12500000n, // 1,25,000.00 BDT
        status: 'SENT',
        dueDate: new Date(Date.now() + 86400000 * 7),
        createdAt: new Date(),
      },
      {
        id: 'inv_demo_02',
        invoiceNumber: 'INV-2026-0002',
        customerName: 'Rahim Textile Mills',
        customerEmail: 'accounts@rahimtextile.com',
        totalAmountPaisa: 4500000n, // 45,000.00 BDT
        status: 'PAID',
        dueDate: new Date(Date.now() - 86400000 * 2),
        paidAt: new Date(Date.now() - 86400000),
        createdAt: new Date(Date.now() - 86400000 * 10),
      },
      {
        id: 'inv_demo_03',
        invoiceNumber: 'INV-2026-0003',
        customerName: 'Bengal Logistics Co.',
        customerEmail: 'finance@bengallogistics.com.bd',
        totalAmountPaisa: 890000n, // 8,900.00 BDT
        status: 'OVERDUE',
        dueDate: new Date(Date.now() - 86400000 * 4),
        createdAt: new Date(Date.now() - 86400000 * 18),
      },
    ];
  }

  const totalInvoicedPaisa = rows.reduce(
    (acc, inv) => acc + (typeof inv.totalAmountPaisa === 'bigint' ? inv.totalAmountPaisa : BigInt(inv.totalAmountPaisa || 0)),
    0n
  );
  const totalPaidPaisa = rows
    .filter((inv) => inv.status === 'PAID')
    .reduce(
      (acc, inv) => acc + (typeof inv.totalAmountPaisa === 'bigint' ? inv.totalAmountPaisa : BigInt(inv.totalAmountPaisa || 0)),
      0n
    );
  const overdueCount = rows.filter((inv) => inv.status === 'OVERDUE' || (inv.status !== 'PAID' && new Date(inv.dueDate) < new Date())).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Digital Invoicing</h1>
          <p className="text-xs text-slate-500">
            Create itemized B2B invoices with automated VAT calculation and track payment status.
          </p>
        </div>
        <Link href="/dashboard/invoices/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" /> Create Invoice
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Total Invoiced</div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            {formatPaisaToBDT(totalInvoicedPaisa)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">{rows.length} total invoices</div>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Total Paid</div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {formatPaisaToBDT(totalPaidPaisa)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {rows.filter((i) => i.status === 'PAID').length} settled
          </div>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Overdue / Action Needed</div>
          <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {overdueCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Past due date</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
              <tr>
                <th className="p-3">Invoice Number</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Due Date</th>
                <th className="p-3">Total Amount</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {rows.map((inv) => {
                const amount = typeof inv.totalAmountPaisa === 'bigint' ? inv.totalAmountPaisa : BigInt(inv.totalAmountPaisa || 0);
                const statusVariant =
                  inv.status === 'PAID'
                    ? 'success'
                    : inv.status === 'SENT'
                    ? 'info'
                    : inv.status === 'OVERDUE'
                    ? 'destructive'
                    : 'secondary';

                return (
                  <tr key={inv.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="p-3 font-mono font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      {inv.invoiceNumber}
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-slate-900 dark:text-white">{inv.customerName}</div>
                      <div className="text-[11px] text-slate-400">{inv.customerEmail}</div>
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-300">
                      {new Date(inv.dueDate).toLocaleDateString()}
                    </td>
                    <td className="p-3 font-medium text-slate-900 dark:text-white">
                      {formatPaisaToBDT(amount)}
                    </td>
                    <td className="p-3">
                      <Badge variant={statusVariant}>{inv.status}</Badge>
                    </td>
                    <td className="p-3 text-right">
                      <Link href={`/dashboard/invoices/${inv.id}`}>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                          View <ArrowUpRight className="w-3 h-3" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
