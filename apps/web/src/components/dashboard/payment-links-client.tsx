'use client';

import * as React from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { QrCode } from '@/components/ui/qr-code';
import { createPaymentLinkAction, revokePaymentLinkAction } from '@/lib/actions/payment-link.actions';
import { generateBanglaQrPayload } from '@/lib/qr/emvco-bangla-qr';
import { formatPaisaToBDT } from '@/lib/format';
import { Paisa } from '@denaneya/payment-core';
import { Plus, Copy, QrCode as QrIcon, Check, Trash2 } from 'lucide-react';

export interface PaymentLinkItem {
  id: string;
  title: string;
  slug: string;
  amountPaisa: bigint | string | null;
  type: string;
  status: string;
  usedCount: number;
  maxUses: number | null;
  createdAt: string | Date;
}

export function PaymentLinksClient({
  links,
  merchantId,
  merchantName,
}: {
  links: PaymentLinkItem[];
  merchantId: string;
  merchantName: string;
}) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [qrModalLink, setQrModalLink] = React.useState<PaymentLinkItem | null>(null);
  const [copiedSlug, setCopiedSlug] = React.useState<string | null>(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    try {
      const res = await createPaymentLinkAction(null, formData);
      if (res?.error) {
        setError(res.error);
      } else {
        setCreateOpen(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create link');
    } finally {
      setLoading(false);
    }
  };

  const copyUrl = (slug: string) => {
    const url = `https://checkout.denaneya.com/l/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Payment Links & Bangla QR</h1>
          <p className="text-xs text-slate-500">Create shareable checkout URLs and point-of-sale EMVCo QR codes.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Create Payment Link
        </Button>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
              <tr>
                <th className="p-3">Title</th>
                <th className="p-3">URL Slug</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Type</th>
                <th className="p-3">Uses</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {links.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    No active payment links found. Create one to get started.
                  </td>
                </tr>
              ) : (
                links.map((link) => (
                  <tr key={link.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-semibold text-slate-900 dark:text-white">{link.title}</td>
                    <td className="p-3 font-mono text-emerald-600">/l/{link.slug}</td>
                    <td className="p-3 font-bold text-slate-900 dark:text-white">
                      {link.amountPaisa ? formatPaisaToBDT(link.amountPaisa) : <span className="text-slate-400 font-normal">Customer Specified</span>}
                    </td>
                    <td className="p-3"><Badge variant="outline">{link.type}</Badge></td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">
                      {link.usedCount} {link.maxUses ? `/ ${link.maxUses}` : ''}
                    </td>
                    <td className="p-3">
                      <Badge variant={link.status === 'ACTIVE' ? 'success' : 'secondary'}>{link.status}</Badge>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyUrl(link.slug)}
                          className="h-7 px-2 text-xs"
                          title="Copy Link URL"
                        >
                          {copiedSlug === link.slug ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setQrModalLink(link)}
                          className="h-7 px-2 text-xs gap-1"
                        >
                          <QrIcon className="w-3.5 h-3.5 text-emerald-600" /> Bangla QR
                        </Button>
                        {link.status === 'ACTIVE' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => revokePaymentLinkAction(link.id)}
                            className="h-7 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
                            title="Deactivate Link"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create Shareable Payment Link"
        description="Generate a custom URL and dynamic QR code for social selling or invoicing."
      >
        <form onSubmit={handleCreate} className="space-y-4 pt-2">
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Input label="Link Title" name="title" placeholder="e.g. Eid Sale 2026 Collection" required />
          <Input label="Description (Optional)" name="description" placeholder="Short note to buyer" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Amount in BDT (Leave blank for open amount)" name="amountBDT" type="number" step="0.01" placeholder="1500.00" />
            <Input label="Custom URL Slug (Optional)" name="slug" placeholder="eid-sale-26" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Link Type</label>
              <select name="type" className="w-full h-10 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs">
                <option value="SINGLE_USE">Single Use (Closes after 1 payment)</option>
                <option value="MULTI_USE">Multi-Use (Reusable)</option>
              </select>
            </div>
            <Input label="Max Uses (For Multi-Use)" name="maxUses" type="number" placeholder="e.g. 100" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Link'}</Button>
          </div>
        </form>
      </Dialog>

      {/* Bangla QR Dialog */}
      {qrModalLink && (
        <Dialog
          open={Boolean(qrModalLink)}
          onOpenChange={(open) => !open && setQrModalLink(null)}
          title="Bangladesh Bank Standard Bangla QR"
          description={`EMVCo standard merchant QR for ${qrModalLink.title}`}
        >
          <div className="space-y-4 text-center py-4">
            <div className="flex justify-center p-4 bg-white rounded-xl shadow-inner border border-slate-200 w-fit mx-auto">
              <QrCode
                value={generateBanglaQrPayload({
                  merchantId,
                  merchantName,
                  amountBDT: qrModalLink.amountPaisa
                    ? Paisa.fromPaisa(typeof qrModalLink.amountPaisa === 'bigint' ? qrModalLink.amountPaisa : BigInt(qrModalLink.amountPaisa)).toBDT()
                    : undefined,
                  billNumber: qrModalLink.slug,
                  isDynamic: Boolean(qrModalLink.amountPaisa),
                })}
                size={220}
              />
            </div>

            <div className="text-xs space-y-1 text-slate-600 dark:text-slate-400">
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                {merchantName} • {qrModalLink.amountPaisa ? formatPaisaToBDT(qrModalLink.amountPaisa) : 'Open Amount'}
              </p>
              <p className="text-[11px] text-emerald-600 font-medium">
                Compatible with bKash, Nagad, Upay, Citytouch & Bangla QR Banking Apps
              </p>
            </div>

            <div className="flex justify-center gap-2 pt-2">
              <Button size="sm" onClick={() => window.print()} variant="outline">
                Print Standee
              </Button>
              <Button size="sm" onClick={() => copyUrl(qrModalLink.slug)}>
                Copy Link URL
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
