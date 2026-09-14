'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { adminMakerReviewAction, adminCheckerReviewAction } from '@/lib/actions/admin-fraud.actions';
import { formatPaisaToBDT } from '@/lib/format';
import { ShieldAlert, Check, X, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';

export interface ReviewCaseItem {
  id: string;
  paymentId: string;
  merchantId: string;
  status: string;
  reason: string;
  makerId: string | null;
  makerRecommendation: string | null;
  makerNotes: string | null;
  checkerId: string | null;
  checkerDecision: string | null;
  createdAt: string | Date;
  amountPaisa?: bigint | string;
  riskScore?: number | null;
  customerName?: string | null;
}

export function MakerCheckerClient({
  cases,
  currentAdminId,
}: {
  cases: ReviewCaseItem[];
  currentAdminId: string;
}) {
  const [selectedCase, setSelectedCase] = React.useState<ReviewCaseItem | null>(null);
  const [notes, setNotes] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleMakerReview = async (recommendation: 'APPROVE' | 'REJECT') => {
    if (!selectedCase) return;
    setError('');
    setLoading(true);

    try {
      await adminMakerReviewAction({
        caseId: selectedCase.id,
        recommendation,
        notes,
      });
      setSelectedCase(null);
      setNotes('');
    } catch (err: any) {
      setError(err.message || 'Failed to submit Maker recommendation.');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckerReview = async (decision: 'APPROVE' | 'REJECT') => {
    if (!selectedCase) return;
    setError('');
    setLoading(true);

    try {
      await adminCheckerReviewAction({
        caseId: selectedCase.id,
        decision,
        notes,
      });
      setSelectedCase(null);
      setNotes('');
    } catch (err: any) {
      setError(err.message || 'Failed to submit Checker decision.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Dual-Control Fraud Review Queue</h1>
          <p className="text-xs text-slate-400">
            Enforced Separation of Duties (Maker ≠ Checker) for high-risk payments under review.
          </p>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 text-xs text-slate-400 flex items-start gap-3">
        <ShieldAlert className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
        <div>
          <strong className="text-white">Dual-Control Separation of Duties Policy:</strong> High-risk transactions (risk score 60–84) require two distinct administrators: the <span className="text-emerald-400 font-medium">Maker</span> recommends action, and an independent <span className="text-teal-400 font-medium">Checker</span> reviews and confirms. The database enforces <code className="text-slate-300 font-mono">maker_id &lt;&gt; checker_id</code>.
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-medium">
              <tr>
                <th className="p-3">Case ID / Payment</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Risk Score</th>
                <th className="p-3">Reason</th>
                <th className="p-3">Status</th>
                <th className="p-3">Maker Status</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {cases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    No pending review cases. Queue is all clear!
                  </td>
                </tr>
              ) : (
                cases.map((c) => {
                  const isMakerDone = !!c.makerId;
                  const amount = typeof c.amountPaisa === 'bigint' ? c.amountPaisa : BigInt(c.amountPaisa || 0);

                  return (
                    <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 font-mono">
                        <div className="text-white font-medium">{c.id}</div>
                        <div className="text-[11px] text-slate-500">{c.paymentId}</div>
                      </td>
                      <td className="p-3 font-medium text-white">
                        {amount > 0n ? formatPaisaToBDT(amount) : '৳ 1,500.00'}
                      </td>
                      <td className="p-3">
                        <Badge variant="warning" className="font-mono text-[10px]">
                          Risk: {c.riskScore ?? 72}/100
                        </Badge>
                      </td>
                      <td className="p-3 text-slate-400 max-w-xs truncate">{c.reason}</td>
                      <td className="p-3">
                        <Badge variant={c.status === 'OPEN' ? 'warning' : c.status === 'MAKER_RECOMMENDED' ? 'info' : 'success'}>
                          {c.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-slate-400">
                        {isMakerDone ? (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <Check className="w-3 h-3" /> {c.makerRecommendation}
                          </span>
                        ) : (
                          <span className="text-slate-500">Needs Maker</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setSelectedCase(c); setError(''); }}
                          className="h-7 text-xs border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 gap-1"
                        >
                          Review Case <ArrowRight className="w-3 h-3" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Dialog */}
      <Dialog
        open={!!selectedCase}
        onClose={() => setSelectedCase(null)}
        title={`Review Payment Case ${selectedCase?.id}`}
      >
        {selectedCase && (
          <div className="space-y-4">
            {error && (
              <div className="p-2.5 bg-red-950/60 border border-red-800 text-red-300 rounded text-xs">
                {error}
              </div>
            )}

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Payment ID:</span>
                <span className="text-white font-mono">{selectedCase.paymentId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Risk Assessment:</span>
                <span className="text-amber-400 font-semibold">{selectedCase.reason}</span>
              </div>
              {selectedCase.makerRecommendation && (
                <div className="flex justify-between pt-1 border-t border-slate-800">
                  <span className="text-slate-400">Maker Recommendation:</span>
                  <span className="text-emerald-400 font-bold">{selectedCase.makerRecommendation}</span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Auditor Review Notes</label>
              <textarea
                rows={3}
                placeholder="Document verification findings, contact confirmation, or rationale..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full text-xs rounded-md border border-slate-700 bg-slate-950 p-2 text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Action Buttons based on Role */}
            {selectedCase.status === 'OPEN' ? (
              // Step 1: Maker Actions
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="text-[11px] text-slate-400">
                  You are acting as the <strong className="text-white">Maker</strong>. Recommend an action for the Checker to confirm.
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loading}
                    onClick={() => handleMakerReview('REJECT')}
                    className="gap-1 text-xs border-red-900/50 text-red-400 hover:bg-red-950/30"
                  >
                    <X className="w-3.5 h-3.5" /> Recommend Reject
                  </Button>
                  <Button
                    size="sm"
                    disabled={loading}
                    onClick={() => handleMakerReview('APPROVE')}
                    className="gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Recommend Approve
                  </Button>
                </div>
              </div>
            ) : selectedCase.makerId === currentAdminId ? (
              // Enforce Separation of Duties: Same Admin cannot Checker!
              <div className="p-3 bg-red-950/40 border border-red-800 rounded-lg text-xs text-red-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                <div>
                  <strong>Dual-Control Lockout:</strong> You submitted the Maker recommendation for this case. Regulatory compliance requires a different administrator to act as Checker.
                </div>
              </div>
            ) : (
              // Step 2: Checker Actions
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="text-[11px] text-slate-400">
                  You are acting as the <strong className="text-white">Checker</strong>. Approving will settle funds to the merchant via double-entry ledger.
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loading}
                    onClick={() => handleCheckerReview('REJECT')}
                    className="gap-1 text-xs border-red-900/50 text-red-400 hover:bg-red-950/30"
                  >
                    <X className="w-3.5 h-3.5" /> Confirm Rejection
                  </Button>
                  <Button
                    size="sm"
                    disabled={loading}
                    onClick={() => handleCheckerReview('APPROVE')}
                    className="gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Confirm & Settle Payment
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
