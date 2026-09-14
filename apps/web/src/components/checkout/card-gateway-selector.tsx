'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { CreditCard, ExternalLink, ShieldCheck } from 'lucide-react';

export interface CardGatewaySelectorProps {
  paymentId: string;
  onSelectGateway?: (gateway: 'SSLCOMMERZ' | 'SHURJOPAY' | 'AAMARPAY') => Promise<void>;
  disabled?: boolean;
}

export function CardGatewaySelector({
  paymentId: _paymentId,
  onSelectGateway,
  disabled = false,
}: CardGatewaySelectorProps) {
  const [loadingGateway, setLoadingGateway] = React.useState<string | null>(null);

  const gateways = [
    {
      id: 'SSLCOMMERZ' as const,
      name: 'SSLCOMMERZ Hosted Gateway',
      desc: 'Pay with Visa, Mastercard, AMEX, or DBBL Nexus with 3D Secure 2.0 verification.',
      logoBg: 'bg-[#005a9c]',
    },
    {
      id: 'SHURJOPAY' as const,
      name: 'shurjoPay Aggregator',
      desc: 'Support for domestic debit cards, UnionPay, and direct internet banking.',
      logoBg: 'bg-[#e31e24]',
    },
    {
      id: 'AAMARPAY' as const,
      name: 'aamarPay Payment Gateway',
      desc: 'Fast card checkout with instant SMS token verification.',
      logoBg: 'bg-[#f15a24]',
    },
  ];

  const handlePay = async (id: 'SSLCOMMERZ' | 'SHURJOPAY' | 'AAMARPAY') => {
    setLoadingGateway(id);
    try {
      if (onSelectGateway) {
        await onSelectGateway(id);
      }
    } finally {
      setLoadingGateway(null);
    }
  };

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-emerald-600" />
          <CardTitle className="text-base font-bold">Debit / Credit Cards & NetBanking</CardTitle>
        </div>
        <p className="text-xs text-slate-500">
          You will be securely redirected to the licensed gateway’s 3D-Secure portal.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {gateways.map((gw) => (
          <div
            key={gw.id}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-slate-300 dark:hover:border-slate-700 transition"
          >
            <div className="space-y-1">
              <span className="font-bold text-sm text-slate-900 dark:text-white block">
                {gw.name}
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {gw.desc}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || Boolean(loadingGateway)}
              onClick={() => handlePay(gw.id)}
              className="gap-1.5 shrink-0 w-full sm:w-auto"
            >
              {loadingGateway === gw.id ? 'Redirecting...' : 'Pay via Gateway'}
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}

        <div className="flex items-center gap-2 pt-2 text-[11px] text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>PCI-DSS SAQ-A Compliant. Card numbers are never processed or retained by DenaNeya.</span>
        </div>
      </CardContent>
    </Card>
  );
}
