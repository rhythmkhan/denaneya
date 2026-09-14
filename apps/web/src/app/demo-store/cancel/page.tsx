import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { XCircle, ArrowLeft, ShoppingBag } from 'lucide-react';
import { DEMO_MERCHANT_CONFIG } from '@/lib/demo-store/state';

export const dynamic = 'force-dynamic';

export default async function DemoStoreCancelPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string; payment_id?: string }>;
}) {
  const { order_id, payment_id } = await searchParams;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4 sm:px-6">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/demo-store" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
            <ShoppingBag className="w-4 h-4" /> {DEMO_MERCHANT_CONFIG.storeName}
          </Link>
          <Badge variant="outline" className="text-xs font-mono">
            Payment Cancelled
          </Badge>
        </div>

        <Card className="border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
          <div className="h-2 bg-amber-500" />
          <CardHeader className="text-center pt-8 pb-4">
            <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-10 h-10" />
            </div>
            <CardTitle className="text-2xl font-bold">Payment Cancelled</CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              You cancelled the checkout process. No funds were debited from your account.
            </p>
          </CardHeader>

          <CardContent className="space-y-3 text-xs">
            <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Order ID</span>
                <span className="font-mono font-semibold">{order_id || 'N/A'}</span>
              </div>
              {payment_id && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Payment ID</span>
                  <span className="font-mono">{payment_id}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Status</span>
                <Badge variant="destructive">CANCELLED</Badge>
              </div>
            </div>
          </CardContent>

          <CardFooter className="pt-2 pb-6">
            <Link href="/demo-store" className="w-full">
              <Button className="w-full gap-2">
                <ArrowLeft className="w-4 h-4" /> Return to Storefront & Retry
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
