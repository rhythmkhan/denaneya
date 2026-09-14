'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { CheckCircle2, ArrowRight } from 'lucide-react';

export interface MfsSelectorProps {
  paymentId: string;
  amountBDT: string;
  merchantWalletNumber?: string;
  onSubmitTrxId?: (provider: string, trxId: string) => Promise<void>;
  disabled?: boolean;
}

export function MfsSelector({
  paymentId,
  amountBDT,
  merchantWalletNumber = '01711-223344',
  onSubmitTrxId,
  disabled = false,
}: MfsSelectorProps) {
  const [selectedProvider, setSelectedProvider] = React.useState<'BKASH' | 'NAGAD' | 'ROCKET' | 'UPAY'>('BKASH');
  const [trxId, setTrxId] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState(false);

  const providers = [
    { id: 'BKASH' as const, name: 'bKash', color: 'bg-[#e2136e]', textColor: 'text-[#e2136e]' },
    { id: 'NAGAD' as const, name: 'Nagad', color: 'bg-[#f7941d]', textColor: 'text-[#f7941d]' },
    { id: 'ROCKET' as const, name: 'Rocket', color: 'bg-[#8c3494]', textColor: 'text-[#8c3494]' },
    { id: 'UPAY' as const, name: 'Upay', color: 'bg-[#007bc4]', textColor: 'text-[#007bc4]' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trxId.trim()) {
      setError('Please enter the 8-10 character TrxID from your SMS.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      if (onSubmitTrxId) {
        await onSubmitTrxId(selectedProvider, trxId.trim());
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify TrxID.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-bold">Mobile Financial Services (MFS)</CardTitle>
        <p className="text-xs text-slate-500">Select your preferred MFS wallet to complete payment.</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Provider Tabs */}
        <div className="grid grid-cols-4 gap-2">
          {providers.map((p) => {
            const isSelected = selectedProvider === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setSelectedProvider(p.id);
                  setError('');
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
                  isSelected
                    ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30 shadow-sm'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className={`w-8 h-8 rounded-full ${p.color} text-white flex items-center justify-center text-xs font-bold mb-1 shadow-sm`}>
                  {p.name[0]}
                </div>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{p.name}</span>
              </button>
            );
          })}
        </div>

        {/* Step-by-Step Payment Instructions */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-xs text-slate-600 dark:text-slate-400">
          <span className="font-semibold text-slate-800 dark:text-slate-200 block">
            How to Pay with {selectedProvider}:
          </span>
          <ol className="list-decimal pl-4 space-y-1">
            <li>Open your {selectedProvider} App or dial USSD (*247# for bKash, *167# for Nagad).</li>
            <li>Choose <strong>Make Payment</strong> or <strong>Send Money</strong> to Merchant Wallet: <strong className="font-mono text-emerald-600">{merchantWalletNumber}</strong></li>
            <li>Enter Exact Amount: <strong className="text-slate-900 dark:text-white font-mono">৳ {amountBDT}</strong></li>
            <li>Enter Reference: <strong className="font-mono text-slate-800 dark:text-slate-200">{paymentId.slice(0, 8)}</strong></li>
            <li>Confirm transaction with your PIN and note the <strong>TrxID</strong> received via SMS.</li>
          </ol>
        </div>

        {/* TrxID Submit Form */}
        {success ? (
          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">Transaction ID Submitted</h4>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Our automated Android SMS verification engine is matching your payment. You will be redirected shortly.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              label="Enter Transaction ID (TrxID)"
              placeholder="e.g. 9K76TRX01"
              value={trxId}
              onChange={(e) => setTrxId(e.target.value.toUpperCase())}
              error={error}
              disabled={disabled || submitting}
              required
            />
            <Button
              type="submit"
              disabled={disabled || submitting}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-semibold"
            >
              {submitting ? 'Verifying TrxID...' : 'Verify & Complete Payment'}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
