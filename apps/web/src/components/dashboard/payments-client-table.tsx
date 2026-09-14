'use client';

import * as React from 'react';
import Link from 'next/link';
import { formatPaisaToBDT, formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefundDialog } from '@/components/dashboard/refund-dialog';
import { Search, RotateCcw } from 'lucide-react';

export interface PaymentItem {
  id: string;
  amountPaisa: bigint | string;
  refundedAmountPaisa: bigint | string;
  currency: string;
  status: string;
  provider: string | null;
  providerTrxId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  riskScore: number | null;
  createdAt: string | Date;
}

export function PaymentsClientTable({ payments }: { payments: PaymentItem[] }) {
  const [filterStatus, setFilterStatus] = React.useState('ALL');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedForRefund, setSelectedForRefund] = React.useState<PaymentItem | null>(null);

  const filtered = payments.filter((p) => {
    if (filterStatus !== 'ALL' && p.status !== filterStatus) return false;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      return (
        p.id.toLowerCase().includes(s) ||
        (p.customerName && p.customerName.toLowerCase().includes(s)) ||
        (p.providerTrxId && p.providerTrxId.toLowerCase().includes(s))
      );
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search Reference, Customer, TrxID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          {['ALL', 'COMPLETED', 'REQUIRES_ACTION', 'PROCESSING', 'REFUNDED'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                filterStatus === st
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-100'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
              <tr>
                <th className="p-3">Reference ID</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Method</th>
                <th className="p-3">TrxID</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Status</th>
                <th className="p-3">Risk Score</th>
                <th className="p-3">Date</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    No transactions match your query.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const canRefund = (p.status === 'COMPLETED' || p.status === 'PARTIALLY_REFUNDED') && BigInt(p.amountPaisa) > BigInt(p.refundedAmountPaisa || 0);

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                      <td className="p-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                        <Link href={`/dashboard/payments/${p.id}`} className="hover:underline text-emerald-600">
                          {p.id}
                        </Link>
                      </td>
                      <td className="p-3 text-slate-700 dark:text-slate-300">
                        {p.customerName || 'Anonymous'}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {p.provider || 'SANDBOX'}
                        </Badge>
                      </td>
                      <td className="p-3 font-mono text-slate-500">
                        {p.providerTrxId || '-'}
                      </td>
                      <td className="p-3 font-bold text-slate-900 dark:text-white">
                        {formatPaisaToBDT(p.amountPaisa)}
                      </td>
                      <td className="p-3">
                        <Badge variant={p.status === 'COMPLETED' ? 'success' : p.status === 'REFUNDED' ? 'secondary' : p.status === 'FAILED' ? 'destructive' : 'warning'}>
                          {p.status}
                        </Badge>
                      </td>
                      <td className="p-3 font-mono">
                        {p.riskScore !== null ? (
                          <span className={p.riskScore > 60 ? 'text-red-500 font-bold' : p.riskScore > 30 ? 'text-amber-500' : 'text-emerald-500'}>
                            {p.riskScore}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="p-3 text-slate-500">
                        {formatDate(p.createdAt)}
                      </td>
                      <td className="p-3 text-right">
                        {canRefund && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedForRefund(p)}
                            className="h-7 px-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 gap-1"
                          >
                            <RotateCcw className="w-3 h-3" /> Refund
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedForRefund && (
        <RefundDialog
          open={Boolean(selectedForRefund)}
          onOpenChange={(open) => !open && setSelectedForRefund(null)}
          paymentId={selectedForRefund.id}
          totalCapturedPaisa={selectedForRefund.amountPaisa}
          alreadyRefundedPaisa={selectedForRefund.refundedAmountPaisa || 0n}
        />
      )}
    </div>
  );
}
