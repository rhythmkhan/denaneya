import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { payments } from '@denaneya/database';
import { requireMerchant } from '@/lib/auth/rbac-guard';
import { PaymentsClientTable } from '@/components/dashboard/payments-client-table';

export default async function PaymentsPage() {
  const { merchantId } = await requireMerchant('payments:read');

  let rows: any[] = [];
  if (db) {
    rows = await db
      .select()
      .from(payments)
      .where(eq(payments.merchantId, merchantId))
      .orderBy(desc(payments.createdAt))
      .limit(50);
  }

  // Fallback demo items if empty
  if (rows.length === 0) {
    rows = [
      { id: 'pay_9f83a812001', amountPaisa: 250000n, refundedAmountPaisa: 0n, currency: 'BDT', status: 'COMPLETED', provider: 'BKASH', providerTrxId: '9K76TRX01', customerName: 'Arif Chowdhury', customerPhone: '+8801711223344', riskScore: 12, createdAt: new Date() },
      { id: 'pay_9f83a812002', amountPaisa: 500000n, refundedAmountPaisa: 150000n, currency: 'BDT', status: 'PARTIALLY_REFUNDED', provider: 'NAGAD', providerTrxId: 'NG984210', customerName: 'Farhana Yasmin', customerPhone: '+8801811223344', riskScore: 28, createdAt: new Date(Date.now() - 3600000) },
      { id: 'pay_9f83a812003', amountPaisa: 125000n, refundedAmountPaisa: 0n, currency: 'BDT', status: 'REQUIRES_ACTION', provider: 'SSLCOMMERZ', providerTrxId: null, customerName: 'Tanvir Ahmed', customerPhone: '+8801911223344', riskScore: 5, createdAt: new Date(Date.now() - 7200000) },
    ];
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Payments & Settlements</h1>
        <p className="text-xs text-slate-500">
          Monitor incoming payments, filter by status, and process balance-checked refunds.
        </p>
      </div>

      <PaymentsClientTable payments={rows} />
    </div>
  );
}
