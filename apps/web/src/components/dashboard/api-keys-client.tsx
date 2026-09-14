'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import {
  createApiKeyAction,
  rotateApiKeyAction,
  revokeApiKeyAction,
} from '@/lib/actions/api-key.actions';
import { Plus, Key, RefreshCw, Trash2, Copy, Check, AlertTriangle } from 'lucide-react';

export interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  type: string;
  environment: string;
  scopes: string[];
  lastUsedAt: string | Date | null;
  expiresAt: string | Date | null;
  revokedAt: string | Date | null;
  createdAt: string | Date;
}

export function ApiKeysClient({ keys }: { keys: ApiKeyItem[] }) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [revealKey, setRevealKey] = React.useState<string | null>(null);
  const [copiedKey, setCopiedKey] = React.useState(false);
  const [keyName, setKeyName] = React.useState('');
  const [environment, setEnvironment] = React.useState<'SANDBOX' | 'PRODUCTION'>('SANDBOX');
  const [type, setType] = React.useState<'SECRET' | 'PUBLISHABLE'>('SECRET');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await createApiKeyAction({
        name: keyName,
        type,
        environment,
      });

      if (res?.plaintextKey) {
        setCreateOpen(false);
        setRevealKey(res.plaintextKey);
        setKeyName('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate API key.');
    } finally {
      setLoading(false);
    }
  };

  const handleRotate = async (id: string) => {
    if (!confirm('Rotate this API key? A new key will be generated and the existing key will expire after a 24-hour grace period.')) {
      return;
    }
    try {
      const res = await rotateApiKeyAction(id);
      if (res?.plaintextKey) {
        setRevealKey(res.plaintextKey);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to rotate key');
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this key immediately? All applications using this key will immediately be rejected.')) {
      return;
    }
    try {
      await revokeApiKeyAction(id, 'Revoked from merchant dashboard');
    } catch (err: any) {
      alert(err.message || 'Failed to revoke key');
    }
  };

  const copySecret = () => {
    if (!revealKey) return;
    navigator.clipboard.writeText(revealKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">API Keys & Authentication</h1>
          <p className="text-xs text-slate-500">
            Manage cryptographically secure keys for programmatic REST API integration.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Create API Key
        </Button>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
              <tr>
                <th className="p-3">Key Name</th>
                <th className="p-3">Key Prefix</th>
                <th className="p-3">Environment</th>
                <th className="p-3">Type</th>
                <th className="p-3">Last Used</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {keys.map((k) => {
                const isRevoked = !!k.revokedAt;
                const isExpired = k.expiresAt && new Date(k.expiresAt) < new Date();
                const status = isRevoked ? 'REVOKED' : isExpired ? 'EXPIRED' : 'ACTIVE';
                const badgeVariant = status === 'ACTIVE' ? 'success' : 'destructive';

                return (
                  <tr key={k.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="p-3 font-medium text-slate-900 dark:text-white flex items-center gap-2">
                      <Key className="w-3.5 h-3.5 text-slate-400" />
                      {k.name}
                    </td>
                    <td className="p-3 font-mono text-slate-600 dark:text-slate-300">
                      {k.keyPrefix}••••••••
                    </td>
                    <td className="p-3">
                      <Badge variant={k.environment === 'PRODUCTION' ? 'default' : 'secondary'}>
                        {k.environment}
                      </Badge>
                    </td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">{k.type}</td>
                    <td className="p-3 text-slate-500">
                      {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="p-3">
                      <Badge variant={badgeVariant}>{status}</Badge>
                    </td>
                    <td className="p-3 text-right space-x-1">
                      {status === 'ACTIVE' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRotate(k.id)}
                            className="h-7 text-xs text-slate-600 hover:text-slate-900"
                            title="Zero-downtime rotation (24h grace period)"
                          >
                            <RefreshCw className="w-3 h-3 mr-1" /> Rotate
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRevoke(k.id)}
                            className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="w-3 h-3 mr-1" /> Revoke
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Creation Modal */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Generate New API Key">
        <form onSubmit={handleCreate} className="space-y-4">
          {error && (
            <div className="p-2.5 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded text-xs">
              {error}
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Key Name</label>
            <Input
              required
              placeholder="e.g. Backend Production Server"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Environment</label>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as any)}
                className="w-full h-9 text-xs rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white"
              >
                <option value="SANDBOX">Sandbox (Testing)</option>
                <option value="PRODUCTION">Production (Live)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Key Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full h-9 text-xs rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white"
              >
                <option value="SECRET">Secret Key (Server-side)</option>
                <option value="PUBLISHABLE">Publishable Key (Client)</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? 'Generating...' : 'Create Key'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* One-Time Reveal Modal */}
      <Dialog
        open={!!revealKey}
        onClose={() => setRevealKey(null)}
        title="Copy Your API Secret Key"
      >
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <strong>Store this secret securely!</strong> This secret is shown only once and cannot be retrieved later. DenaNeya stores only a one-way cryptographic SHA-256 hash.
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">API Secret Key</label>
            <div className="flex items-center gap-2">
              <div className="font-mono text-xs p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 flex-1 break-all text-slate-900 dark:text-white select-all border border-slate-200 dark:border-slate-700">
                {revealKey}
              </div>
              <Button size="sm" onClick={copySecret} className="gap-1.5 shrink-0">
                {copiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button size="sm" onClick={() => setRevealKey(null)}>
              I Have Saved This Key
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
