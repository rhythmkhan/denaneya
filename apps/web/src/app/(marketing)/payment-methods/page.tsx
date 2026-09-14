import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Check, Smartphone, CreditCard } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Payment Methods & Trust Tiers | DenaNeya',
  description: 'Comprehensive support for Bangladesh MFS (bKash, Nagad, Rocket, Upay) and Payment Gateways (SSLCOMMERZ, shurjoPay, aamarPay) with explicit trust tiers.',
};

export default function PaymentMethodsPage() {
  const methods = [
    {
      category: 'Mobile Financial Services (MFS)',
      icon: Smartphone,
      description: 'The dominant payment channels in Bangladesh, accounting for over 75% of domestic e-commerce volume.',
      providers: [
        { name: 'bKash', code: 'BKASH', brandColor: '#e2136e', tier: 'Tier A / Tier C', features: ['URL-based Checkout', 'App Intent', 'SMS Push Verification'] },
        { name: 'Nagad', code: 'NAGAD', brandColor: '#f7941d', tier: 'Tier A / Tier C', features: ['RSA-2048 Signed PGW', 'SMS Verification', 'Balance Check'] },
        { name: 'Rocket (DBBL)', code: 'ROCKET', brandColor: '#8c3494', tier: 'Tier C', features: ['USSD Automation', 'Collector Device', 'TrxID Match'] },
        { name: 'Upay (UCB)', code: 'UPAY', brandColor: '#007bc4', tier: 'Tier C', features: ['Regex Parser v1', 'Balance Continuity', 'Real-time Webhook'] },
      ],
    },
    {
      category: 'Cards & Online Banking Gateways',
      icon: CreditCard,
      description: 'Direct integration with Bangladesh’s premier licensed payment aggregators.',
      providers: [
        { name: 'SSLCOMMERZ', code: 'SSLCOMMERZ', brandColor: '#005a9c', tier: 'Tier A', features: ['Visa / Mastercard / AMEX', 'EMI Facilities', '3D Secure 2.0'] },
        { name: 'shurjoPay', code: 'SHURJOPAY', brandColor: '#e31e24', tier: 'Tier A', features: ['Direct Debit', 'UnionPay Support', 'Auto-Refund'] },
        { name: 'aamarPay', code: 'AAMARPAY', brandColor: '#f15a24', tier: 'Tier A', features: ['Instant Verification', 'Sandbox Simulator', 'Multi-Currency'] },
      ],
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-16">
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <Badge variant="success">Ecosystem Coverage</Badge>
        <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Supported Bangladesh Payment Methods
        </h1>
        <p className="text-slate-600 dark:text-slate-300 text-base">
          Accept payments across all major Mobile Financial Services and credit cards through a single unified API and hosted checkout interface.
        </p>
      </div>

      {/* Methods Grid */}
      <div className="space-y-12">
        {methods.map((group) => {
          const GroupIcon = group.icon;
          return (
            <div key={group.category} className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                  <GroupIcon className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{group.category}</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{group.description}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {group.providers.map((p) => (
                  <Card key={p.code} className="hover:border-slate-400 transition">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-lg">{p.name}</CardTitle>
                        <Badge variant="outline">{p.tier}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                        {p.features.map((feat) => (
                          <li key={feat} className="flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            {feat}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Trust Tiers Deep Dive Matrix */}
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-xl">Verification Trust Tier Taxonomy</CardTitle>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            DenaNeya assigns every settled payment an immutable trust tier for accounting and dispute defense.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="pb-3 font-semibold">Tier</th>
                  <th className="pb-3 font-semibold">Source</th>
                  <th className="pb-3 font-semibold">Verification Proof</th>
                  <th className="pb-3 font-semibold">Dispute Risk</th>
                  <th className="pb-3 font-semibold">Settlement Speed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300 text-xs">
                <tr>
                  <td className="py-3 font-bold text-emerald-600">Tier A</td>
                  <td className="py-3">Gateway Direct API</td>
                  <td className="py-3">Server-to-Server TLS Query Token</td>
                  <td className="py-3"><Badge variant="success">Minimal (&lt; 0.01%)</Badge></td>
                  <td className="py-3">Real-time (&lt; 500ms)</td>
                </tr>
                <tr>
                  <td className="py-3 font-bold text-blue-600">Tier B</td>
                  <td className="py-3">Signed Webhook</td>
                  <td className="py-3">HMAC-SHA256 / RSA Signature + Query Check</td>
                  <td className="py-3"><Badge variant="info">Low (&lt; 0.1%)</Badge></td>
                  <td className="py-3">Near Instant (&lt; 2s)</td>
                </tr>
                <tr>
                  <td className="py-3 font-bold text-amber-600">Tier C</td>
                  <td className="py-3">Android SMS Collector</td>
                  <td className="py-3">EC P-256 Signature + Balance Chain Match</td>
                  <td className="py-3"><Badge variant="warning">Medium (&lt; 1%)</Badge></td>
                  <td className="py-3">3 – 8 Seconds</td>
                </tr>
                <tr>
                  <td className="py-3 font-bold text-slate-600">Tier D</td>
                  <td className="py-3">Manual Entry</td>
                  <td className="py-3">Maker-Checker Dual Approval + Bank Reconciliation</td>
                  <td className="py-3"><Badge variant="destructive">High (Requires Review)</Badge></td>
                  <td className="py-3">Manual / Batch</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
