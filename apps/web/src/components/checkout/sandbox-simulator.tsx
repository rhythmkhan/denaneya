'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Zap, CheckCircle2, XCircle } from 'lucide-react';

export interface SandboxSimulatorProps {
  paymentId: string;
  onSimulateSuccess?: () => Promise<void>;
  onSimulateFailure?: () => Promise<void>;
  disabled?: boolean;
}

export function SandboxSimulator({
  paymentId: _paymentId,
  onSimulateSuccess,
  onSimulateFailure,
  disabled = false,
}: SandboxSimulatorProps) {
  const [loading, setLoading] = React.useState<'success' | 'failure' | null>(null);

  const handleSuccess = async () => {
    setLoading('success');
    try {
      if (onSimulateSuccess) await onSimulateSuccess();
    } finally {
      setLoading(null);
    }
  };

  const handleFailure = async () => {
    setLoading('failure');
    try {
      if (onSimulateFailure) await onSimulateFailure();
    } finally {
      setLoading(null);
    }
  };

  return (
    <Card className="border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400">
            <Zap className="w-5 h-5 fill-amber-500 text-amber-500" />
            <CardTitle className="text-base font-bold">Sandbox Test Mode Simulator</CardTitle>
          </div>
          <Badge variant="warning">Test Mode Only</Badge>
        </div>
        <p className="text-xs text-amber-700 dark:text-amber-400">
          This payment is running in test mode. You can simulate instant payment outcomes without real money.
        </p>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button
            type="button"
            disabled={disabled || Boolean(loading)}
            onClick={handleSuccess}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 text-xs font-semibold"
          >
            <CheckCircle2 className="w-4 h-4" />
            {loading === 'success' ? 'Settling Payment...' : 'Simulate Instant Success'}
          </Button>

          <Button
            type="button"
            variant="destructive"
            disabled={disabled || Boolean(loading)}
            onClick={handleFailure}
            className="gap-2 text-xs font-semibold"
          >
            <XCircle className="w-4 h-4" />
            {loading === 'failure' ? 'Cancelling...' : 'Simulate Payment Failure'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
