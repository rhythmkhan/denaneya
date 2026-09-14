'use client';

import * as React from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createRefundAction } from '@/lib/actions/refund.actions';
import { formatPaisaToBDT } from '@/lib/format';
import { Paisa } from '@denaneya/payment-core';

export interface RefundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentId: string;
  totalCapturedPaisa: bigint | number | string;
  alreadyRefundedPaisa: bigint | number | string;
}

export function RefundDialog({
  open,
  onOpenChange,
  paymentId,
  totalCapturedPaisa,
  alreadyRefundedPaisa,
}: RefundDialogProps) {
  const [refundBDT, setRefundBDT] = React.useState('');
  const [reason, setReason] = React.useState('CUSTOMER_REQUEST');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const captured = BigInt(totalCapturedPaisa);
  const refunded = BigInt(alreadyRefundedPaisa);
  const maxRefundablePaisa = captured - refunded;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    let requestedPaisa: bigint;
    try {
      const paisaObj = Paisa.fromBDT(refundBDT.trim());
      if (!paisaObj.isPositive()) {
        setError('Please enter a valid positive refund amount.');
        return;
      }
      requestedPaisa = paisaObj.toPaisa();
    } catch {
      setError('Invalid refund amount format.');
      return;
    }

    if (requestedPaisa > maxRefundablePaisa) {
      setError(`Refund cannot exceed maximum refundable balance (${formatPaisaToBDT(maxRefundablePaisa)}).`);
      return;
    }

    setLoading(true);
    try {
      await createRefundAction(paymentId, requestedPaisa, reason, `idemp_ref_${Date.now()}`);
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || 'Refund failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Process Transaction Refund"
      description={`Refund payment ${paymentId} with balanced double-entry ledger posting.`}
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 text-xs text-red-600">
            {error}
          </div>
        )}

        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-500">Captured Amount</span>
            <span className="font-semibold">{formatPaisaToBDT(captured)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Already Refunded</span>
            <span className="font-semibold text-amber-600">{formatPaisaToBDT(refunded)}</span>
          </div>
          <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-700">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Max Refundable Balance</span>
            <span className="font-bold text-emerald-600">{formatPaisaToBDT(maxRefundablePaisa)}</span>
          </div>
        </div>

        <Input
          label="Refund Amount in BDT"
          type="number"
          step="0.01"
          placeholder="e.g. 500.00"
          value={refundBDT}
          onChange={(e) => setRefundBDT(e.target.value)}
          required
        />

        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Refund Reason
          </label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full h-10 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="CUSTOMER_REQUEST">Customer Request (গ্রাহকের অনুরোধ)</option>
            <option value="DUPLICATE_CHARGE">Duplicate Charge (ভুলবশত অতিরিক্ত পেমেন্ট)</option>
            <option value="ORDER_CANCELLED">Order Cancelled (অর্ডার বাতিল)</option>
            <option value="FRAUDULENT">Suspected Fraud (সন্দেহজনক লেনদেন)</option>
            <option value="OTHER">Other Reason</option>
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {loading ? 'Processing...' : 'Confirm Refund'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
