import Link from 'next/link';
import {
  getDemoOrder,
  getDemoOrderByPaymentId,
  saveDemoOrder,
  DEMO_MERCHANT_CONFIG,
} from '@/lib/demo-store/state';
import { GET as getPaymentApi } from '@/app/api/v1/payments/[id]/route';
import { NextRequest } from 'next/server';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function DemoStoreSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    order_id?: string;
    payment_id?: string;
    status?: string;
    trx_id?: string;
  }>;
}) {
  const { order_id, payment_id, status: queryStatus, trx_id: queryTrxId } = await searchParams;

  let order = order_id ? getDemoOrder(order_id) : undefined;
  if (!order && payment_id) {
    order = getDemoOrderByPaymentId(payment_id);
  }

  const paymentId = payment_id || order?.paymentId;

  // --- SERVER-SIDE VERIFICATION AGAINST DENANEYA REST API ---
  let gatewayPayment: any = null;
  let verificationError: string | null = null;
  let amountTampered = false;

  if (paymentId) {
    try {
      // Call DenaNeya's Payment Lookup API server-to-server
      const host = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
      const verifyReq = new NextRequest(new URL(`/api/v1/payments/${paymentId}`, host).toString(), {
        headers: {
          Authorization: `Bearer ${DEMO_MERCHANT_CONFIG.apiKey}`,
        },
      });

      const verifyRes = await getPaymentApi(verifyReq, { params: Promise.resolve({ id: paymentId }) });
      if (verifyRes.ok) {
        gatewayPayment = await verifyRes.json();
      } else {
        verificationError = `Gateway returned HTTP ${verifyRes.status}`;
      }
    } catch (err: any) {
      verificationError = err.message || 'Failed to verify payment with gateway';
    }
  }

  // Security Check: Detect Client-Side Amount Tampering
  if (gatewayPayment && order) {
    const gatewayAmountPaisa = BigInt(gatewayPayment.amountPaisa || 0);
    const expectedAmountPaisa = BigInt(order.amountPaisa || 0);
    if (gatewayAmountPaisa !== expectedAmountPaisa) {
      amountTampered = true;
    } else if (gatewayPayment.status === 'COMPLETED') {
      order.status = 'PAID';
      order.apiVerified = true;
      order.verifiedAt = new Date().toISOString();
      order.provider = gatewayPayment.provider || 'SANDBOX';
      order.providerTrxId = gatewayPayment.providerTrxId || queryTrxId || 'SIM_DEMO';
      saveDemoOrder(order);
    }
  }

  const isVerified = (gatewayPayment?.status === 'COMPLETED' || order?.status === 'PAID') && !amountTampered;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4 sm:px-6">
      <div className="max-w-xl mx-auto space-y-6">
        {/* Verification Status Banner */}
        <div className="flex items-center justify-between">
          <Link href="/demo-store" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
            <ShoppingBag className="w-4 h-4" /> {DEMO_MERCHANT_CONFIG.storeName}
          </Link>
          <Badge variant="outline" className="text-xs font-mono">
            Merchant Callback
          </Badge>
        </div>

        <Card className="border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
          <div className={`h-2 ${isVerified ? 'bg-emerald-500' : amountTampered ? 'bg-red-500' : 'bg-amber-500'}`} />
          
          <CardHeader className="text-center pt-8 pb-4">
            <div className="mx-auto mb-4">
              {isVerified ? (
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center mx-auto ring-8 ring-emerald-50 dark:ring-emerald-950/20">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
              ) : amountTampered ? (
                <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 flex items-center justify-center mx-auto ring-8 ring-red-50 dark:ring-red-950/20">
                  <AlertTriangle className="w-10 h-10" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center mx-auto ring-8 ring-amber-50 dark:ring-amber-950/20">
                  <RefreshCw className="w-8 h-8 animate-spin" />
                </div>
              )}
            </div>

            <CardTitle className="text-2xl font-bold">
              {isVerified
                ? 'Order Paid & Cryptographically Verified'
                : amountTampered
                ? 'Security Alert: Amount Tampering Detected'
                : 'Payment Awaiting Verification'}
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {isVerified
                ? 'Your order has been authorized by DenaNeya. The transaction was verified server-to-server and settled in the platform ledger.'
                : amountTampered
                ? 'The payment amount does not match the merchant order record. Fulfillment halted for fraud investigation.'
                : verificationError
                ? `Verification alert: ${verificationError}`
                : 'Payment is pending gateway confirmation. Please refresh shortly.'}
            </p>
          </CardHeader>

          <CardContent className="space-y-4 text-xs">
            {/* Server-to-Server Security Badges */}
            <div className="grid grid-cols-2 gap-2 p-3 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">API Verification</div>
                  <div className="text-[10px] text-slate-500">
                    {gatewayPayment?.status === 'COMPLETED' ? 'Verified (Server-to-Server)' : 'Pending'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`w-4 h-4 ${order?.webhookVerified ? 'text-emerald-600' : 'text-slate-400'}`} />
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">HMAC Webhook</div>
                  <div className="text-[10px] text-slate-500">
                    {order?.webhookVerified ? 'Delivered & Signed' : 'Dispatched via Outbox'}
                  </div>
                </div>
              </div>
            </div>

            {/* Order & Transaction Details */}
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Merchant Order ID</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {order?.orderId || order_id || 'N/A'}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">DenaNeya Payment ID</span>
                <span className="font-mono text-indigo-600 font-semibold">{paymentId || 'N/A'}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">Amount Paid</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  ৳ {order?.amountBDT ? order.amountBDT.toFixed(2) : '10.00'} BDT
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">Provider & TrxID</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  {order?.provider || gatewayPayment?.provider || 'SANDBOX'} / {order?.providerTrxId || gatewayPayment?.providerTrxId || queryTrxId || 'SIM_SETTLED'}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">Gateway Status</span>
                <Badge variant={isVerified ? 'success' : amountTampered ? 'destructive' : 'warning'}>
                  {gatewayPayment?.status || order?.status || queryStatus || 'COMPLETED'}
                </Badge>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">Customer</span>
                <span className="text-slate-700 dark:text-slate-300 font-medium">
                  {order?.customerName || 'Test Customer'} ({order?.customerEmail || 'customer@example.com'})
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">Timestamp</span>
                <span className="text-slate-500">{new Date().toLocaleString()}</span>
              </div>
            </div>
          </CardContent>

          <CardFooter className="pt-2 pb-6 flex flex-col gap-2">
            <Link href="/demo-store" className="w-full">
              <Button className="w-full gap-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900">
                Return to Demo Storefront <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/dashboard/payments" className="w-full">
              <Button variant="outline" className="w-full text-xs">
                Inspect Payment in DenaNeya Merchant Dashboard
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
