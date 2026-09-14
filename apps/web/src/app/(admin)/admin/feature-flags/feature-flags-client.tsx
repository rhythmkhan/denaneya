'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { adminToggleFeatureFlagAction } from '@/lib/actions/admin-flags.actions';
import { Shield, AlertTriangle, Check } from 'lucide-react';

export interface FeatureFlagItem {
  key: string;
  name: string;
  description: string;
  value: boolean;
  isLocked: boolean;
  regulatory: boolean;
}

export function FeatureFlagsClient({ initialFlags }: { initialFlags: FeatureFlagItem[] }) {
  const [flags, setFlags] = React.useState<FeatureFlagItem[]>(initialFlags);
  const [loadingKey, setLoadingKey] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleToggle = async (flag: FeatureFlagItem) => {
    setMessage(null);
    setLoadingKey(flag.key);

    try {
      const nextValue = !flag.value;
      await adminToggleFeatureFlagAction(flag.key, nextValue);
      setFlags((prev) =>
        prev.map((f) => (f.key === flag.key ? { ...f, value: nextValue } : f))
      );
      setMessage({
        type: 'success',
        text: `Flag '${flag.key}' updated to ${nextValue}. Cryptographic audit log emitted.`,
      });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'Failed to update feature flag.',
      });
    } finally {
      setLoadingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Feature Flags & Invariant Controls</h1>
          <p className="text-xs text-slate-400">
            Platform kill-switches and regulatory constraints backed by immutable audit trails.
          </p>
        </div>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
              : 'bg-red-950/60 border border-red-800 text-red-300'
          }`}
        >
          {message.type === 'success' ? (
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <div className="space-y-4">
        {flags.map((flag) => (
          <Card
            key={flag.key}
            className="p-5 border-slate-800 bg-slate-900 text-slate-100 flex items-start justify-between gap-4 shadow-sm"
          >
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white text-sm">{flag.name}</span>
                <span className="font-mono text-[11px] text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  {flag.key}
                </span>
                {flag.regulatory && (
                  <Badge variant="warning" className="text-[10px] gap-1">
                    <Shield className="w-3 h-3" /> Regulatory Invariant
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{flag.description}</p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <Badge variant={flag.value ? 'success' : 'secondary'} className="font-mono text-xs">
                {flag.value ? 'ENABLED' : 'DISABLED'}
              </Badge>
              <Button
                size="sm"
                variant={flag.value ? 'outline' : 'default'}
                disabled={loadingKey === flag.key}
                onClick={() => handleToggle(flag)}
                className={`text-xs ${
                  flag.value
                    ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                {loadingKey === flag.key
                  ? 'Saving...'
                  : flag.value
                  ? 'Disable Flag'
                  : 'Enable Flag'}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
