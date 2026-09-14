import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Clock, ArrowRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function CheckoutStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ paymentId: string }>;
  searchParams: Promise<{ status?: string; trxId?: string }>;
}) {
  const { paymentId } = await params;
  const { status = 'COMPLETED', trxId } = await searchParams;

  const isSuccess = status === 'COMPLETED';
  const isFailed = status === 'FAILED' || status === 'CANCELLED';

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
      <div className={`h-2 ${isSuccess ? 'bg-emerald-500' : isFailed ? 'bg-red-500' : 'bg-amber-500'}`} />
      <CardHeader className="text-center pt-8 pb-4">
        <div className="mx-auto mb-3">
          {isSuccess ? (
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>
          ) : isFailed ? (
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950 text-red-600 flex items-center justify-center mx-auto">
              <XCircle className="w-10 h-10" />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-600 flex items-center justify-center mx-auto">
              <Clock className="w-10 h-10" />
            </div>
          )}
        </div>

        <CardTitle className="text-2xl font-bold">
          {isSuccess ? 'Payment Successful' : isFailed ? 'Payment Failed' : 'Payment Processing'}
        </CardTitle>
        <p className="text-xs text-slate-500 mt-1">
          {isSuccess
            ? 'Your payment has been verified and settled.'
            : isFailed
            ? 'The payment attempt was declined or cancelled.'
            : 'Your transaction is being verified by our network.'}
        </p>
      </CardHeader>

      <CardContent className="space-y-4 text-xs">
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-500">Payment ID</span>
            <span className="font-mono text-slate-800 dark:text-slate-200 font-semibold">{paymentId}</span>
          </div>
          {trxId && (
            <div className="flex justify-between">
              <span className="text-slate-500">Provider TrxID</span>
              <span className="font-mono text-emerald-600 font-semibold">{trxId}</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Status</span>
            <Badge variant={isSuccess ? 'success' : isFailed ? 'destructive' : 'warning'}>
              {status}
            </Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Settled At</span>
            <span className="text-slate-800 dark:text-slate-200">{new Date().toLocaleTimeString()}</span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="pt-2 pb-6">
        <Link href="/" className="w-full">
          <Button className="w-full gap-2">
            Return to Merchant Website <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
