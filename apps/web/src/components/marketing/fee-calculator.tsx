'use client';

import * as React from 'react';
import { formatPaisaToBDT } from '@/lib/format';
import { Paisa } from '@denaneya/payment-core';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export function FeeCalculator() {
  const [monthlyVolumeBDT, setMonthlyVolumeBDT] = React.useState<number>(500000); // 500,000 BDT default
  const feeRateBps = 150n; // 1.50%

  // Strict integer math in Paisa
  const volumePaisa = Paisa.fromBDT(String(Math.round(monthlyVolumeBDT))).toPaisa();
  const platformFeePaisa = (volumePaisa * feeRateBps) / 10000n;
  const netPayoutPaisa = volumePaisa - platformFeePaisa;

  return (
    <Card className="w-full max-w-2xl mx-auto border-emerald-200/60 dark:border-emerald-900/60 shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl text-emerald-800 dark:text-emerald-400">
          Interactive Processing Fee Calculator
        </CardTitle>
        <CardDescription>
          Estimate your monthly costs with zero hidden charges. Simple, transparent 1.5% platform orchestration rate.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Estimated Monthly Volume (BDT)
            </label>
            <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {formatPaisaToBDT(volumePaisa)}
            </span>
          </div>
          <input
            type="range"
            min="50000"
            max="10000000"
            step="50000"
            value={monthlyVolumeBDT}
            onChange={(e) => setMonthlyVolumeBDT(Number(e.target.value))}
            className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-600"
          />
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>৳ 50,000</span>
            <span>৳ 5,000,000</span>
            <span>৳ 10,000,000</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50">
            <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
              Platform Fee (1.50%)
            </span>
            <span className="text-xl font-bold text-slate-900 dark:text-white">
              {formatPaisaToBDT(platformFeePaisa)}
            </span>
            <span className="text-[11px] text-slate-400 block mt-1">
              Zero float, calculated in integer paisa
            </span>
          </div>

          <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/50 dark:border-emerald-800/50">
            <span className="text-xs text-emerald-700 dark:text-emerald-400 block mb-1 font-medium">
              Estimated Net Settlement
            </span>
            <span className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
              {formatPaisaToBDT(netPayoutPaisa)}
            </span>
            <span className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 block mt-1">
              Routed directly to your merchant account
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
