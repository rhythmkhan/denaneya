import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { reconciliationRuns, reconciliationDiscrepancies } from '@denaneya/database';
import { authenticateApiKey } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { jsonResponse } from '@/lib/api/response';
import { ApiError, handleRouteError } from '@/lib/api/errors';
import {
  generateReconciliationCsv,
  formatReconciliationResponse,
  type ReconciliationRunResult,
} from '@denaneya/reconciliation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  let requestId = 'req_' + Date.now();
  try {
    const authCtx = await authenticateApiKey(request, 'reconciliation:read');
    requestId = authCtx.requestId;
    const rateHeaders = await checkRateLimit(request, authCtx.merchant.id);

    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date');
    const runId = searchParams.get('runId') || searchParams.get('jobId');
    const batchId = searchParams.get('batchId');
    const status = searchParams.get('status');
    const discrepancyType = searchParams.get('discrepancyType');
    const format = searchParams.get('format')?.toLowerCase();
    const acceptHeader = request.headers.get('accept') ?? '';
    const wantsCsv = format === 'csv' || acceptHeader.includes('text/csv');

    if (!db) {
      throw new ApiError('INTERNAL_ERROR', 'Database client unavailable', 500, requestId);
    }

    let targetRun: any = null;

    if (runId) {
      const runs = await db
        .select()
        .from(reconciliationRuns)
        .where(
          and(
            eq(reconciliationRuns.id, runId),
            eq(reconciliationRuns.merchantId, authCtx.merchant.id)
          )
        );
      targetRun = runs[0];
    } else {
      const conditions = [eq(reconciliationRuns.merchantId, authCtx.merchant.id)];
      if (batchId) {
        conditions.push(eq(reconciliationRuns.batchId, batchId));
      }
      if (status) {
        conditions.push(eq(reconciliationRuns.status, status));
      }
      if (dateStr) {
        const start = new Date(`${dateStr}T00:00:00.000Z`);
        const end = new Date(`${dateStr}T23:59:59.999Z`);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          conditions.push(gte(reconciliationRuns.createdAt, start));
          conditions.push(lte(reconciliationRuns.createdAt, end));
        }
      }

      const runs = await db
        .select()
        .from(reconciliationRuns)
        .where(and(...conditions))
        .orderBy(desc(reconciliationRuns.createdAt))
        .limit(1);

      targetRun = runs[0];
    }

    if (!targetRun) {
      if (wantsCsv) {
        return new NextResponse('Discrepancy Type,Payment ID,Provider Trx ID,Provider,Merchant ID,Internal Amount (BDT),Provider Amount (BDT),Ledger Amount (BDT),Discrepancy (BDT),Internal Status,Provider Status,Resolution Status,Notes\r\n', {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="reconciliation-empty.csv"`,
            ...rateHeaders,
          },
        });
      }

      return jsonResponse(
        {
          success: true,
          data: {
            reportDate: dateStr ?? new Date().toISOString().slice(0, 10),
            summary: {
              grossVolumeBDT: '0.00',
              feesWithheldBDT: '0.00',
              netPayoutBDT: '0.00',
              totalTransactions: 0,
              matchedCount: 0,
              autoHealedCount: 0,
              discrepancyCount: 0,
            },
            discrepancies: [],
          },
        },
        { status: 200, headers: rateHeaders }
      );
    }

    // Load discrepancies for the target run
    const discConditions = [eq(reconciliationDiscrepancies.runId, targetRun.id)];
    if (discrepancyType) {
      discConditions.push(eq(reconciliationDiscrepancies.discrepancyType, discrepancyType));
    }

    const discrepancies = await db
      .select()
      .from(reconciliationDiscrepancies)
      .where(and(...discConditions));

    const runResult: ReconciliationRunResult = {
      runId: targetRun.id,
      batchId: targetRun.batchId ?? undefined,
      status: targetRun.status,
      startDate: new Date(targetRun.startDate),
      endDate: new Date(targetRun.endDate),
      completedAt: targetRun.completedAt ? new Date(targetRun.completedAt) : new Date(),
      summary: {
        totalRecordsEvaluated: targetRun.totalRecordsEvaluated,
        matchedCount: targetRun.matchedCount,
        discrepancyCount: targetRun.discrepancyCount,
        autoHealedCount: targetRun.autoHealedCount,
        totalInternalAmountPaisa: BigInt(targetRun.totalInternalAmountPaisa ?? 0),
        totalProviderAmountPaisa: BigInt(targetRun.totalProviderAmountPaisa ?? 0),
        totalLedgerAmountPaisa: BigInt(targetRun.totalLedgerAmountPaisa ?? 0),
        netDiscrepancyAmountPaisa: BigInt(targetRun.netDiscrepancyAmountPaisa ?? 0),
        breakdownByType: (targetRun.summary as any) ?? {
          MATCHED: targetRun.matchedCount,
          AMOUNT_MISMATCH: 0,
          STATUS_MISMATCH: 0,
          MISSING_IN_LEDGER: 0,
          MISSING_IN_GATEWAY: 0,
          UNEXPECTED_GATEWAY_TX: 0,
          FEE_DISCREPANCY: 0,
        },
      },
      discrepancies: discrepancies.map((d) => ({
        id: d.id,
        runId: d.runId,
        batchId: d.batchId ?? undefined,
        discrepancyType: d.discrepancyType as any,
        paymentId: d.paymentId ?? undefined,
        providerTrxId: d.providerTrxId ?? undefined,
        provider: d.provider,
        merchantId: d.merchantId ?? undefined,
        internalAmountPaisa: d.internalAmountPaisa ? BigInt(d.internalAmountPaisa) : undefined,
        providerAmountPaisa: d.providerAmountPaisa ? BigInt(d.providerAmountPaisa) : undefined,
        ledgerAmountPaisa: d.ledgerAmountPaisa ? BigInt(d.ledgerAmountPaisa) : undefined,
        discrepancyAmountPaisa: BigInt(d.discrepancyAmountPaisa ?? 0),
        internalStatus: d.internalStatus ?? undefined,
        providerStatus: d.providerStatus ?? undefined,
        expectedFeePaisa: d.expectedFeePaisa ? BigInt(d.expectedFeePaisa) : undefined,
        actualFeePaisa: d.actualFeePaisa ? BigInt(d.actualFeePaisa) : undefined,
        resolutionStatus: d.resolutionStatus as any,
        resolutionNotes: d.resolutionNotes ?? undefined,
        resolvedAt: d.resolvedAt ? new Date(d.resolvedAt) : undefined,
        resolvedBy: d.resolvedBy ?? undefined,
        createdAt: d.createdAt ? new Date(d.createdAt) : undefined,
      })),
    };

    if (wantsCsv) {
      const csvContent = generateReconciliationCsv(runResult);
      const filenameDate = dateStr ?? targetRun.createdAt.toISOString().slice(0, 10);
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="reconciliation-${filenameDate}.csv"`,
          ...rateHeaders,
        },
      });
    }

    const formatted = formatReconciliationResponse(runResult);

    return jsonResponse(
      {
        success: true,
        data: formatted,
      },
      {
        status: 200,
        headers: rateHeaders,
      }
    );
  } catch (err) {
    return handleRouteError(err, requestId);
  }
}
