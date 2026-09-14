import { formatPaisaToBDT } from '@/lib/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Store } from 'lucide-react';

export interface PaymentSummaryProps {
  paymentId: string;
  merchantName: string;
  amountPaisa: bigint | number | string;
  currency?: string;
  description?: string | null;
  customerName?: string | null;
  status: string;
  isSandbox?: boolean;
}

export function PaymentSummary({
  paymentId,
  merchantName,
  amountPaisa,
  currency: _currency = 'BDT',
  description,
  customerName,
  status,
  isSandbox = false,
}: PaymentSummaryProps) {
  const formattedAmount = formatPaisaToBDT(amountPaisa);

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-md">
      <CardHeader className="pb-4">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 font-bold">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs text-slate-500 uppercase font-semibold tracking-wider">Merchant</span>
              <CardTitle className="text-lg">{merchantName || 'DenaNeya Merchant'}</CardTitle>
            </div>
          </div>
          {isSandbox && (
            <Badge variant="warning" className="uppercase font-mono text-[10px]">
              Sandbox Mode
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-500 block">Total Amount to Pay</span>
            <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {formattedAmount}
            </span>
          </div>
          <Badge variant={status === 'COMPLETED' ? 'success' : status === 'FAILED' ? 'destructive' : 'outline'}>
            {status}
          </Badge>
        </div>

        <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3">
          <div className="flex justify-between">
            <span>Payment Reference</span>
            <span className="font-mono text-slate-700 dark:text-slate-300 font-medium">{paymentId}</span>
          </div>
          {description && (
            <div className="flex justify-between">
              <span>Description</span>
              <span className="text-slate-700 dark:text-slate-300">{description}</span>
            </div>
          )}
          {customerName && (
            <div className="flex justify-between">
              <span>Customer</span>
              <span className="text-slate-700 dark:text-slate-300">{customerName}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 pt-1">
          <ShieldCheck className="w-4 h-4" />
          <span>Secured with 256-bit encryption. Zero card data stored.</span>
        </div>
      </CardContent>
    </Card>
  );
}
