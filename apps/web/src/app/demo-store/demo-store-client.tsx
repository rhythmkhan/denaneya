'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ShoppingBag,
  ShieldCheck,
  Zap,
  ArrowRight,
  RefreshCw,
  Lock,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Trash2,
  Send,
} from 'lucide-react';
import type { DemoOrder, DemoWebhookAuditLog } from '@/lib/demo-store/state';

interface DemoStoreClientProps {
  initialOrders: DemoOrder[];
  initialWebhookLogs: DemoWebhookAuditLog[];
}

export function DemoStoreClient({ initialOrders, initialWebhookLogs }: DemoStoreClientProps) {
  const router = useRouter();

  // Store & Checkout State
  const [amountBDT, setAmountBDT] = React.useState<number>(10.00);
  const [customerName, setCustomerName] = React.useState('Tanvir Rahman');
  const [customerEmail, setCustomerEmail] = React.useState('customer@example.com');
  const [customerPhone, setCustomerPhone] = React.useState('01712345678');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [checkoutError, setCheckoutError] = React.useState<string | null>(null);

  // Orders & Logs State
  const [orders, setOrders] = React.useState<DemoOrder[]>(initialOrders);
  const [webhookLogs, setWebhookLogs] = React.useState<DemoWebhookAuditLog[]>(initialWebhookLogs);
  const [refreshing, setRefreshing] = React.useState(false);

  // Security Simulation State
  const [attackLoading, setAttackLoading] = React.useState(false);
  const [attackResult, setAttackResult] = React.useState<any | null>(null);

  const fetchLatestData = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/demo-store/orders');
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
        setWebhookLogs(data.webhookLogs || []);
      }
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  };

  // Poll for updates every 4 seconds when there are pending orders
  React.useEffect(() => {
    const hasPending = orders.some((o) => o.status === 'PENDING');
    if (!hasPending) return;

    const interval = setInterval(fetchLatestData, 4000);
    return () => clearInterval(interval);
  }, [orders]);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setCheckoutError(null);

    try {
      const res = await fetch('/api/demo-store/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountBDT,
          customerName,
          customerEmail,
          customerPhone,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Failed to initiate checkout');
      }

      // Automatically redirect to DenaNeya Hosted Checkout
      if (data.checkoutUrl) {
        router.push(data.checkoutUrl);
      }
    } catch (err: any) {
      setCheckoutError(err.message || 'Payment initiation failed');
      setIsSubmitting(false);
    }
  };

  const handleRunAttack = async (attackType: string) => {
    setAttackLoading(true);
    setAttackResult(null);
    try {
      const res = await fetch('/api/demo-store/test-attack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attackType }),
      });
      const data = await res.json();
      setAttackResult(data);
      await fetchLatestData();
    } catch (err: any) {
      setAttackResult({ error: err.message });
    } finally {
      setAttackLoading(false);
    }
  };

  const handleFlushOutbox = async () => {
    try {
      await fetch('/api/demo-store/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'flush_outbox' }),
      });
      await fetchLatestData();
    } catch {
      // ignore
    }
  };

  const handleClearState = async () => {
    if (!confirm('Clear all demo orders and webhook logs?')) return;
    try {
      await fetch('/api/demo-store/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_state' }),
      });
      setOrders([]);
      setWebhookLogs([]);
      setAttackResult(null);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Banner & Quick Metrics */}
      <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-slate-950 text-white p-6 sm:p-8 rounded-2xl border border-indigo-800/40 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
                Live Demo Merchant Store
              </Badge>
              <Badge variant="outline" className="text-slate-300 border-slate-700">
                DenaNeya Gateway Integration
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              DenaNeya Demo Gadget Store
            </h1>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl">
              Simulates a live e-commerce merchant integrating DenaNeya. Demonstrates order creation, server-to-server API calls, hosted payment page redirect, webhook HMAC-SHA256 signature verification, and ledger settlement.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchLatestData}
              disabled={refreshing}
              className="border-slate-700 bg-slate-800/60 text-slate-200 hover:bg-slate-700 text-xs gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh State
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearState}
              className="border-red-900/60 bg-red-950/40 text-red-300 hover:bg-red-900/50 text-xs gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear History
            </Button>
          </div>
        </div>
      </div>

      {/* Main Grid: Storefront Product Checkout vs Live Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Product Showcase & Checkout Form (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="border-slate-200 dark:border-slate-800 shadow-md">
            <CardHeader className="pb-4">
              <div className="flex justify-between items-start">
                <div>
                  <Badge variant="secondary" className="mb-2 text-[10px]">
                    Featured Test Item
                  </Badge>
                  <CardTitle className="text-xl font-bold">
                    DenaNeya FIDO2 Hardware Key
                  </CardTitle>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                    ৳ {amountBDT.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-slate-500">BDT (Bangladesh Taka)</div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 text-xs">
              {/* Configurable Price Selector */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Preset Amounts or Custom (BDT):
                </label>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {[10, 50, 500, 1500].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAmountBDT(preset)}
                      className={`py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                        amountBDT === preset
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      ৳ {preset}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 font-bold">৳</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amountBDT}
                    onChange={(e) => setAmountBDT(Math.max(0.01, Number.parseFloat(e.target.value) || 0.01))}
                    className="pl-8 text-xs font-semibold"
                    placeholder="Enter custom BDT amount"
                  />
                </div>
              </div>

              {/* Customer Info Form */}
              <form onSubmit={handleCheckout} className="space-y-3 pt-2">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Customer Full Name
                  </label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                    className="text-xs"
                    placeholder="e.g. Tanvir Rahman"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Email Address
                    </label>
                    <Input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      required
                      className="text-xs"
                      placeholder="email@example.com"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      BD Mobile Phone
                    </label>
                    <Input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      required
                      className="text-xs font-mono"
                      placeholder="01712345678"
                    />
                  </div>
                </div>

                {/* Order Cost Breakdown */}
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Item Subtotal</span>
                    <span className="font-medium">৳ {amountBDT.toFixed(2)} BDT</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Estimated Gateway MDR (1.5%)</span>
                    <span className="font-medium">৳ {(amountBDT * 0.015).toFixed(2)} BDT</span>
                  </div>
                  <div className="border-t border-slate-200 dark:border-slate-800 pt-1.5 flex justify-between font-bold text-slate-900 dark:text-white">
                    <span>Total Charged</span>
                    <span className="text-indigo-600 dark:text-indigo-400">৳ {amountBDT.toFixed(2)} BDT</span>
                  </div>
                </div>

                {checkoutError && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-xs">
                    {checkoutError}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 shadow-md shadow-indigo-500/20"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Calling DenaNeya Gateway...
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" /> Pay ৳ {amountBDT.toFixed(2)} with DenaNeya <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Interactive Security & Negative Testing Panel */}
          <Card className="border-indigo-100 dark:border-indigo-950/60 bg-indigo-50/30 dark:bg-indigo-950/20 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">
                  Security Attack & Negative Test Controls
                </CardTitle>
              </div>
              <p className="text-[11px] text-slate-500">
                Exercise real adversarial scenarios directly against DenaNeya&apos;s production security boundaries.
              </p>
            </CardHeader>

            <CardContent className="space-y-3 pt-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={attackLoading}
                  onClick={() => handleRunAttack('forged_webhook')}
                  className="text-[11px] border-red-300 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-700 dark:text-red-300 gap-1"
                >
                  <AlertTriangle className="w-3.5 h-3.5" /> Forged Webhook Attack
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={attackLoading}
                  onClick={() => handleRunAttack('duplicate_submission')}
                  className="text-[11px] border-indigo-300 dark:border-indigo-900/60 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 gap-1"
                >
                  <Zap className="w-3.5 h-3.5" /> Replay / Idempotency Test
                </Button>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleFlushOutbox}
                  className="w-full text-[11px] gap-1"
                >
                  <Send className="w-3.5 h-3.5" /> Trigger Outbox Webhook Dispatch
                </Button>
              </div>

              {attackResult && (
                <div className={`p-3 rounded-lg border text-[11px] space-y-1 ${
                  attackResult.passedSecurityCheck || attackResult.responseStatus === 401
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                }`}>
                  <div className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {attackResult.attackType === 'forged_webhook' ? 'Attack Blocked (HTTP 401 Unauthorized)' : 'Test Vector Executed'}
                  </div>
                  <div className="text-[10px] opacity-90">{attackResult.message}</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Live Order History & Webhook Audit Logs (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Order History Table */}
          <Card className="border-slate-200 dark:border-slate-800 shadow-md">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-indigo-600" /> Demo Store Order Book
                  </CardTitle>
                  <p className="text-[11px] text-slate-500">
                    Live orders created by this merchant, showing Gateway Payment ID, server verification, and webhook status.
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {orders.length} Orders
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {orders.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No orders created yet. Submit the form on the left to initiate your first end-to-end payment test!
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold text-[11px]">
                      <tr>
                        <th className="py-2.5 px-4">Order / Payment ID</th>
                        <th className="py-2.5 px-3">Customer</th>
                        <th className="py-2.5 px-3">Amount</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Verification</th>
                        <th className="py-2.5 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {orders.map((o) => (
                        <tr key={o.orderId} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                          <td className="py-3 px-4">
                            <div className="font-mono font-semibold text-slate-900 dark:text-white">
                              {o.orderId}
                            </div>
                            <div className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400">
                              {o.paymentId}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-medium text-slate-800 dark:text-slate-200">{o.customerName}</div>
                            <div className="text-[10px] text-slate-500">{o.customerEmail}</div>
                          </td>
                          <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                            ৳ {o.amountBDT.toFixed(2)}
                          </td>
                          <td className="py-3 px-3">
                            <Badge
                              variant={
                                o.status === 'PAID'
                                  ? 'success'
                                  : o.status === 'FAILED'
                                  ? 'destructive'
                                  : o.status === 'CANCELLED'
                                  ? 'outline'
                                  : 'warning'
                              }
                              className="text-[10px] uppercase font-bold"
                            >
                              {o.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-col gap-1">
                              <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${
                                o.apiVerified ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                              }`}>
                                <ShieldCheck className="w-3 h-3" /> {o.apiVerified ? 'API Verified' : 'Unverified'}
                              </span>
                              <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${
                                o.webhookVerified ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                              }`}>
                                <CheckCircle2 className="w-3 h-3" /> {o.webhookVerified ? 'Webhook Signed' : 'Webhook Awaiting'}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex justify-end gap-1.5">
                              {o.status === 'PENDING' ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => router.push(`/checkout/${o.paymentId}`)}
                                  className="h-7 text-[11px] gap-1 border-indigo-200 dark:border-indigo-900 text-indigo-600"
                                >
                                  Checkout <ExternalLink className="w-3 h-3" />
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => router.push(`/demo-store/success?order_id=${o.orderId}&payment_id=${o.paymentId}`)}
                                  className="h-7 text-[11px] gap-1"
                                >
                                  Receipt <ExternalLink className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Webhook Audit Log Table */}
          <Card className="border-slate-200 dark:border-slate-800 shadow-md">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" /> Merchant Webhook Inbound Logs
                  </CardTitle>
                  <p className="text-[11px] text-slate-500">
                    Real inbound HTTP deliveries received at <code>/api/demo-store/webhook</code>, verified with HMAC-SHA256.
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {webhookLogs.length} Events
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {webhookLogs.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No inbound webhooks received yet. When a payment completes, the outbox worker delivers the event here.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold text-[11px]">
                      <tr>
                        <th className="py-2 px-4">Event / Timestamp</th>
                        <th className="py-2 px-3">Payment ID</th>
                        <th className="py-2 px-3">HMAC Signature</th>
                        <th className="py-2 px-3">Verdict</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-[11px]">
                      {webhookLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                          <td className="py-2.5 px-4 font-sans">
                            <div className="font-semibold text-slate-900 dark:text-white">{log.eventType}</div>
                            <div className="text-[10px] text-slate-400">{new Date(log.receivedAt).toLocaleTimeString()}</div>
                          </td>
                          <td className="py-2.5 px-3 text-indigo-600 dark:text-indigo-400">
                            {log.paymentId}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 truncate max-w-[140px]" title={log.signatureHeader}>
                            {log.signatureHeader ? log.signatureHeader.slice(0, 24) + '...' : 'Missing'}
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge
                              variant={log.signatureValid ? 'success' : 'destructive'}
                              className="text-[10px] font-bold"
                            >
                              {log.signatureValid ? 'VALID HMAC' : 'FORGED / REJECTED'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
