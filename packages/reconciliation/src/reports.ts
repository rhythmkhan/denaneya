import { Paisa } from '@denaneya/payment-core';
import type { DiscrepancyReport, ReconciliationRunResult } from './types.js';

export function formatPaisaOrBlank(paisa?: bigint): string {
  if (paisa === undefined || paisa === null) return '';
  return Paisa.fromPaisa(paisa).toBDT();
}

/**
 * Generates an RFC-4180 compliant CSV export of a reconciliation run.
 */
export function generateReconciliationCsv(runResult: ReconciliationRunResult): string {
  const headers = [
    'Discrepancy Type',
    'Payment ID',
    'Provider Trx ID',
    'Provider',
    'Merchant ID',
    'Internal Amount (BDT)',
    'Provider Amount (BDT)',
    'Ledger Amount (BDT)',
    'Discrepancy (BDT)',
    'Internal Status',
    'Provider Status',
    'Resolution Status',
    'Notes',
  ];

  const lines = [headers.join(',')];

  for (const item of runResult.discrepancies) {
    const row = [
      `"${item.discrepancyType}"`,
      `"${item.paymentId ?? ''}"`,
      `"${item.providerTrxId ?? ''}"`,
      `"${item.provider}"`,
      `"${item.merchantId ?? ''}"`,
      `"${formatPaisaOrBlank(item.internalAmountPaisa)}"`,
      `"${formatPaisaOrBlank(item.providerAmountPaisa)}"`,
      `"${formatPaisaOrBlank(item.ledgerAmountPaisa)}"`,
      `"${formatPaisaOrBlank(item.discrepancyAmountPaisa)}"`,
      `"${item.internalStatus ?? ''}"`,
      `"${item.providerStatus ?? ''}"`,
      `"${item.resolutionStatus}"`,
      `"${(item.resolutionNotes ?? '').replace(/"/g, '""')}"`,
    ];
    lines.push(row.join(','));
  }

  return lines.join('\r\n');
}

/**
 * Formats reconciliation results into standard API presentation format.
 */
export function formatReconciliationResponse(runResult: ReconciliationRunResult): Record<string, unknown> {
  const { summary } = runResult;

  return {
    runId: runResult.runId,
    batchId: runResult.batchId,
    status: runResult.status,
    startDate: runResult.startDate.toISOString(),
    endDate: runResult.endDate.toISOString(),
    completedAt: runResult.completedAt.toISOString(),
    metrics: {
      totalRecordsEvaluated: summary.totalRecordsEvaluated,
      matchedCount: summary.matchedCount,
      discrepancyCount: summary.discrepancyCount,
      autoHealedCount: summary.autoHealedCount,
      totalInternalAmountBDT: Paisa.fromPaisa(summary.totalInternalAmountPaisa).toBDT(),
      totalProviderAmountBDT: Paisa.fromPaisa(summary.totalProviderAmountPaisa).toBDT(),
      totalLedgerAmountBDT: Paisa.fromPaisa(summary.totalLedgerAmountPaisa).toBDT(),
      netDiscrepancyAmountBDT: Paisa.fromPaisa(summary.netDiscrepancyAmountPaisa).toBDT(),
      breakdown: summary.breakdownByType,
    },
    discrepancies: runResult.discrepancies.map((d) => ({
      id: d.id,
      type: d.discrepancyType,
      paymentId: d.paymentId,
      providerTrxId: d.providerTrxId,
      provider: d.provider,
      merchantId: d.merchantId,
      internalAmountBDT: formatPaisaOrBlank(d.internalAmountPaisa),
      providerAmountBDT: formatPaisaOrBlank(d.providerAmountPaisa),
      ledgerAmountBDT: formatPaisaOrBlank(d.ledgerAmountPaisa),
      discrepancyAmountBDT: formatPaisaOrBlank(d.discrepancyAmountPaisa),
      internalStatus: d.internalStatus,
      providerStatus: d.providerStatus,
      resolutionStatus: d.resolutionStatus,
      notes: d.resolutionNotes,
    })),
  };
}
