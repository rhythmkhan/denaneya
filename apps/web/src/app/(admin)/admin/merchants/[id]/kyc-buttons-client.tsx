'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { adminApproveKycAction, adminRejectKycAction } from '@/lib/actions/admin-merchant.actions';
import { Check, X, Loader2 } from 'lucide-react';

export function KycButtonsClient({
  merchantId,
  kycStatus,
}: {
  merchantId: string;
  kycStatus: string;
}) {
  const [loading, setLoading] = React.useState(false);

  const handleApprove = async () => {
    if (!confirm('Approve KYC verification for this merchant? This will provision settlement ledger accounts.')) return;
    setLoading(true);
    try {
      await adminApproveKycAction(merchantId);
    } catch (err: any) {
      alert(err.message || 'Approval failed');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    const reason = prompt('Enter rejection reason for this merchant:');
    if (!reason) return;
    setLoading(true);
    try {
      await adminRejectKycAction(merchantId, reason);
    } catch (err: any) {
      alert(err.message || 'Rejection failed');
    } finally {
      setLoading(false);
    }
  };

  if (kycStatus === 'VERIFIED') {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleReject} disabled={loading} className="text-xs text-red-400 border-red-900/50 hover:bg-red-950/30">
          Revoke / Reject KYC
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleReject}
        disabled={loading}
        className="gap-1 text-xs border-red-900/50 text-red-400 hover:bg-red-950/30"
      >
        <X className="w-3.5 h-3.5" /> Reject KYC
      </Button>
      <Button
        size="sm"
        onClick={handleApprove}
        disabled={loading}
        className="gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        Approve KYC
      </Button>
    </div>
  );
}
