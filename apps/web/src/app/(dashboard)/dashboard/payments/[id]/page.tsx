import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { payments, refunds } from '@denaneya/database';
import { requireMerchant } from '@/lib/auth/rbac-guard';
import { formatPaisaToBDT, formatDateTime } from '@/lib/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { merchantId } = await requireMerchant('payments:read');

  let payment: any = null;
  let paymentRefunds: any[] = [];

  if (db) {
    const [p] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.id, id), eq(payments.merchantId, merchantId)));

    if (p) {
      payment = p;
      paymentRefunds = await db
        .select()
        .from(refunds)
        .where(and(eq(refunds.paymentId, p.id), eq(refunds.merchantId, merchantId)));
    }
  }

  if (!payment) {
    if (id.startsWith('pay_')) {
      payment = {
        id,
        amountPaisa: 250000n,
        feePaisa: 3750n,
        refundedAmountPaisa: 0n,
        currency: 'BDT',
        status: 'COMPLETED',
        provider: 'BKASH',
        providerTrxId: '9K76TRX01',
        customerName: 'Arif Chowdhury',
        customerEmail: 'arif@example.com',
        customerPhone: '+8801711223344',
        verifiedTier: 'TIER_A',
        riskScore: 12,
        createdAt: new Date(),
        settledAt: new Date(),
        updatedAt: new Date(),
      };
    } else {
      notFound();
    }
  }

  const netPaisa = BigInt(payment.amountPaisa) - BigInt(payment.feePaisa || 0) - BigInt(payment.refundedAmountPaisa || 0);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/payments">
          <Button variant="outline" size="sm" className="gap-1 text-xs">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            Payment {payment.id}
            <Badge variant={payment.status === 'COMPLETED' ? 'success' : 'warning'}>
              {payment.status}
            </Badge>
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Financial Accounting Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 space-y-2 border border-slate-200 dark:border-slate-800">
              <div className="flex justify-between">
                <span className="text-slate-500">Gross Captured Amount</span>
                <span className="text-lg font-bold text-slate-900 dark:text-white">
                  {formatPaisaToBDT(payment.amountPaisa)}
                </span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Platform Orchestration Fee (1.5%)</span>
                <span className="font-mono text-red-500">
                  - {formatPaisaToBDT(payment.feePaisa)}
                </span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Refunded Amount</span>
                <span className="font-mono text-amber-500">
                  - {formatPaisaToBDT(payment.refundedAmountPaisa)}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-sm font-bold text-emerald-600">
                <span>Net Credited to Ledger</span>
                <span>{formatPaisaToBDT(netPaisa)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <span className="text-slate-400 block mb-0.5">Provider & Channel</span>
                <span className="font-semibold">{payment.provider || 'SANDBOX'}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Provider Transaction ID</span>
                <span className="font-mono text-emerald-600 font-semibold">{payment.providerTrxId || '-'}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Verification Trust Tier</span>
                <Badge variant="outline">{payment.verifiedTier || 'TIER_A'}</Badge>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Fraud Risk Score</span>
                <span className="font-mono font-bold">{payment.riskScore ?? 0} / 100</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer & Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="space-y-2">
              <span className="text-slate-400 block font-medium">Customer Details</span>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 space-y-1">
                <div className="font-semibold text-slate-800 dark:text-slate-200">{payment.customerName || 'Anonymous'}</div>
                <div className="text-slate-500">{payment.customerEmail || 'No email provided'}</div>
                <div className="text-slate-500">{payment.customerPhone || 'No phone provided'}</div>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-slate-400 block font-medium">Lifecycle Timeline</span>
              <div className="space-y-1.5 text-slate-500">
                <div className="flex justify-between">
                  <span>Created:</span>
                  <span>{formatDateTime(payment.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Settled:</span>
                  <span>{payment.settledAt ? formatDateTime(payment.settledAt) : '-'}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Refunds History */}
      {paymentRefunds.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Refund Journal Postings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="pb-2">Refund ID</th>
                    <th className="pb-2">Amount</th>
                    <th className="pb-2">Reason</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  {paymentRefunds.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2.5 font-bold">{r.id}</td>
                      <td className="py-2.5 text-amber-600 font-bold">{formatPaisaToBDT(r.amountPaisa)}</td>
                      <td className="py-2.5 font-sans text-slate-600 dark:text-slate-400">{r.reason}</td>
                      <td className="py-2.5"><Badge variant="success">{r.status}</Badge></td>
                      <td className="py-2.5 font-sans text-slate-500">{formatDateTime(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
