import type { Metadata } from 'next';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { FeeCalculator } from '@/components/marketing/fee-calculator';

export const metadata: Metadata = {
  title: 'Transparent Pricing & Fee Calculator | DenaNeya',
  description: 'Transparent 1.5% orchestration fee with zero hidden charges. Use our interactive processing fee calculator to estimate your costs.',
};

export default function PricingPage() {
  const plans = [
    {
      name: 'Developer Sandbox',
      price: '৳ 0',
      period: 'Forever free',
      description: 'Full sandbox environment with test payment simulator, mock MFS, and documentation access.',
      features: [
        'Unlimited Sandbox Payments',
        'Interactive Mock Simulator',
        'API Keys & Webhook Testing',
        'Android Collector Emulator',
        'Community Support',
      ],
      cta: 'Start Testing',
      href: '/register',
      highlighted: false,
    },
    {
      name: 'Growth Merchant',
      price: '1.5%',
      period: 'Per successful transaction',
      description: 'Everything needed to orchestrate live MFS and card payments across your online store.',
      features: [
        'All Bangladesh MFS (bKash, Nagad, etc.)',
        'SSLCOMMERZ & Gateway Adapters',
        'Android Hardware SMS Collector App',
        'Double-Entry Balanced Ledger',
        'Real-time Anti-Fraud Risk Scoring',
        'Transactional Outbox Webhooks',
        'Email & Phone Support',
      ],
      cta: 'Launch Live Payments',
      href: '/register',
      highlighted: true,
    },
    {
      name: 'Enterprise / High Volume',
      price: 'Custom',
      period: 'Volume-tiered rates',
      description: 'For merchants processing over ৳ 10,000,000 / month requiring dedicated infrastructure and SLAs.',
      features: [
        'Custom Fee Rate (< 1.5%)',
        'Dedicated IP & Single-Tenant DB option',
        'Dual-Control Maker-Checker Workflow',
        'Custom Gateway Adapters',
        '24/7 Priority SLA & Dedicated TAM',
        'Direct On-Premise Pairing Support',
      ],
      cta: 'Contact Enterprise',
      href: '/contact',
      highlighted: false,
    },
  ];

  const faqs = [
    {
      q: 'Does DenaNeya hold our merchant funds?',
      a: 'No. DenaNeya operates strictly in SOFTWARE/ORCHESTRATION mode (REGULATED_FEATURES_ENABLED=false). All funds flow directly from licensed gateways and MFS wallets into your own bank account.',
    },
    {
      q: 'Are there any setup fees or monthly maintenance charges?',
      a: 'Zero setup fees and zero monthly fixed platform fees for standard merchants. You only pay the 1.5% orchestration fee on successful transactions.',
    },
    {
      q: 'How are refunds handled?',
      a: 'Refunds can be initiated directly from your dashboard or via API. Our double-entry ledger verifies that refund amounts never exceed the captured amount, recording balanced ledger entries.',
    },
    {
      q: 'Can we use our existing bKash / Nagad merchant accounts?',
      a: 'Yes! DenaNeya allows you to bring your own provider API keys or use our Android SMS collector for direct wallet matching.',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-20">
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <Badge variant="success">Predictable Pricing</Badge>
        <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Transparent, Zero-Float Pricing
        </h1>
        <p className="text-slate-600 dark:text-slate-300 text-base">
          No hidden fees, no setup charges. Pay only for successful settlements with exact Paisa precision.
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {plans.map((plan) => (
          <Card
            key={plan.name}
            className={`flex flex-col justify-between ${
              plan.highlighted
                ? 'border-2 border-emerald-500 shadow-xl relative bg-emerald-50/10 dark:bg-emerald-950/10'
                : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            {plan.highlighted && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-emerald-600 text-white text-xs font-semibold">
                Most Popular
              </div>
            )}
            <CardHeader className="space-y-2">
              <CardTitle className="text-xl">{plan.name}</CardTitle>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-slate-900 dark:text-white">
                  {plan.price}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {plan.period}
                </span>
              </div>
              <CardDescription className="text-xs">{plan.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 flex-1">
              <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    {feat}
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter className="pt-4 border-t border-slate-100 dark:border-slate-800/60">
              <Link href={plan.href} className="w-full">
                <Button
                  className="w-full"
                  variant={plan.highlighted ? 'default' : 'outline'}
                >
                  {plan.cta}
                </Button>
              </Link>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Interactive Calculator */}
      <FeeCalculator />

      {/* FAQ Section */}
      <div className="max-w-3xl mx-auto space-y-8">
        <h2 className="text-2xl font-bold text-center text-slate-900 dark:text-white">
          Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          {faqs.map((faq) => (
            <Card key={faq.q} className="p-6">
              <h3 className="font-semibold text-base text-slate-900 dark:text-white mb-2">
                {faq.q}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {faq.a}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
