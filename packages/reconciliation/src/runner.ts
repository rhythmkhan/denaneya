import crypto from 'node:crypto';
import { eq, and, gte, lte, inArray, sql } from 'drizzle-orm';
import {
  payments as paymentsTable,
  ledgerTransactions as ledgerTransactionsTable,
  ledgerEntries as ledgerEntriesTable,
  gatewaySettlementBatches as batchesTable,
  gatewaySettlementItems as itemsTable,
  reconciliationRuns as runsTable,
  reconciliationDiscrepancies as discrepanciesTable,
  type DbClient,
} from '@denaneya/database';
import { getStatementParser } from './parsers/index.js';
import { indexAndTriangulate, reconcileTriplets } from './reconciler.js';
import { autoHealDiscrepancies } from './auto-heal.js';
import type {
  LedgerRecord,
  PaymentRecord,
  ReconciliationRunResult,
  ReconciliationTriplet,
  RunOptions,
  StatementBatch,
  StatementItem,
} from './types.js';

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export interface InMemoryRunInputs {
  payments?: PaymentRecord[];
  statementBatch?: StatementBatch;
  providerItems?: StatementItem[];
  ledgerTxs?: LedgerRecord[];
}

/**
 * Runs 3-way financial reconciliation.
 * Supports both live database mode and in-memory execution mode.
 */
export async function runReconciliation(
  options: RunOptions,
  db?: any,
  inMemoryInputs?: InMemoryRunInputs
): Promise<ReconciliationRunResult> {
  const startDate = options.startDate ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  const endDate = options.endDate ?? new Date();
  const runId = generateId('rec');
  let batchId = options.batchId;

  let loadedPayments: PaymentRecord[] = inMemoryInputs?.payments ?? [];
  let loadedItems: StatementItem[] = inMemoryInputs?.providerItems ?? [];
  let loadedLedger: LedgerRecord[] = inMemoryInputs?.ledgerTxs ?? [];

  // 1. Process Provider Statement Batch
  if (inMemoryInputs?.statementBatch) {
    loadedItems = inMemoryInputs.statementBatch.items;
  } else if (options.content && options.provider) {
    const parser = getStatementParser(options.provider);
    const parsedBatch = await parser.parse(options.content, options.batchReference);
    loadedItems = parsedBatch.items;

    if (db) {
      batchId = batchId ?? generateId('stl');
      await db.insert(batchesTable).values({
        id: batchId,
        merchantId: options.merchantId ?? null,
        provider: options.provider,
        batchReference: parsedBatch.batchReference,
        statementDate: parsedBatch.statementDate,
        totalTransactions: parsedBatch.items.length,
        totalGrossPaisa: parsedBatch.totalGrossPaisa,
        totalFeePaisa: parsedBatch.totalFeePaisa,
        totalNetPaisa: parsedBatch.totalNetPaisa,
        currency: 'BDT',
        status: 'INGESTED',
        fileHash: parsedBatch.fileHash,
        uploadedBy: options.triggeredBy ?? 'SYSTEM',
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();

      if (parsedBatch.items.length > 0) {
        const itemRows = parsedBatch.items.map((item) => ({
          id: generateId('sit'),
          batchId: batchId!,
          provider: options.provider!,
          providerTrxId: item.providerTrxId,
          merchantTxId: item.merchantTxId ?? null,
          amountPaisa: item.amountPaisa,
          feePaisa: item.feePaisa,
          netAmountPaisa: item.netAmountPaisa,
          currency: item.currency,
          providerStatus: item.providerStatus,
          transactionTime: item.transactionTime,
          rawRecord: item.rawRecord ?? null,
          createdAt: new Date(),
        }));

        // Batch insert items
        const chunkSize = 100;
        for (let i = 0; i < itemRows.length; i += chunkSize) {
          await db.insert(itemsTable).values(itemRows.slice(i, i + chunkSize)).onConflictDoNothing();
        }
      }
    }
  } else if (batchId && db) {
    // Load settlement items from database batch
    const itemsFromDb = await db
      .select()
      .from(itemsTable)
      .where(eq(itemsTable.batchId, batchId));

    loadedItems = itemsFromDb.map((row: any) => ({
      providerTrxId: row.providerTrxId,
      merchantTxId: row.merchantTxId ?? undefined,
      amountPaisa: BigInt(row.amountPaisa),
      feePaisa: BigInt(row.feePaisa),
      netAmountPaisa: BigInt(row.netAmountPaisa),
      currency: 'BDT',
      providerStatus: row.providerStatus as 'COMPLETED' | 'FAILED' | 'CANCELLED',
      transactionTime: new Date(row.transactionTime),
      rawRecord: row.rawRecord,
    }));
  }

  // 2. Query Internal Payments from DB if not passed in-memory
  if (db && (!inMemoryInputs || !inMemoryInputs.payments)) {
    const conditions = [
      gte(paymentsTable.createdAt, startDate),
      lte(paymentsTable.createdAt, endDate),
    ];
    if (options.merchantId) {
      conditions.push(eq(paymentsTable.merchantId, options.merchantId));
    }
    if (options.provider) {
      conditions.push(eq(paymentsTable.provider, options.provider));
    }

    const dbPayments = await db
      .select()
      .from(paymentsTable)
      .where(and(...conditions));

    loadedPayments = dbPayments.map((p: any) => ({
      id: p.id,
      merchantId: p.merchantId,
      amountPaisa: BigInt(p.amountPaisa),
      feePaisa: BigInt(p.feePaisa),
      provider: p.provider,
      providerTrxId: p.providerTrxId,
      status: p.status,
      settledAt: p.settledAt ? new Date(p.settledAt) : null,
      createdAt: p.createdAt ? new Date(p.createdAt) : undefined,
    }));
  }

  // 3. Query Ledger Records from DB if not passed in-memory
  if (db && (!inMemoryInputs || !inMemoryInputs.ledgerTxs) && loadedPayments.length > 0) {
    const paymentIds = loadedPayments.map((p) => p.id);
    const chunkSize = 100;
    const ledgerMap = new Map<string, LedgerRecord>();

    for (let i = 0; i < paymentIds.length; i += chunkSize) {
      const chunk = paymentIds.slice(i, i + chunkSize);
      const txRows = await db
        .select()
        .from(ledgerTransactionsTable)
        .where(
          and(
            eq(ledgerTransactionsTable.referenceType, 'PAYMENT'),
            inArray(ledgerTransactionsTable.referenceId, chunk)
          )
        );

      const txIds = txRows.map((tx: any) => tx.id);
      if (txIds.length > 0) {
        const entries = await db
          .select()
          .from(ledgerEntriesTable)
          .where(inArray(ledgerEntriesTable.transactionId, txIds));

        // Group entries by transaction
        const entriesByTx = new Map<string, any[]>();
        for (const entry of entries) {
          const arr = entriesByTx.get(entry.transactionId) ?? [];
          arr.push(entry);
          entriesByTx.set(entry.transactionId, arr);
        }

        for (const tx of txRows) {
          const txEntries = entriesByTx.get(tx.id) ?? [];
          let totalDebit = 0n;
          let totalCredit = 0n;
          for (const entry of txEntries) {
            const amt = BigInt(entry.amountPaisa);
            if (entry.direction === 'DEBIT') {
              totalDebit += amt;
            } else {
              totalCredit += amt;
            }
          }

          const isBalanced = totalDebit === totalCredit && totalDebit > 0n;
          ledgerMap.set(tx.referenceId, {
            transactionId: tx.id,
            referenceId: tx.referenceId,
            referenceType: tx.referenceType,
            grossDebitPaisa: totalDebit,
            isBalanced,
            postedAt: tx.postedAt ? new Date(tx.postedAt) : undefined,
          });
        }
      }
    }

    loadedLedger = Array.from(ledgerMap.values());
  }

  // 4. Triangulate & Reconcile
  const triplets = indexAndTriangulate(loadedPayments, loadedItems, loadedLedger);
  const tripletsMap = new Map<string, ReconciliationTriplet>();
  for (const t of triplets) {
    if (t.payment) {
      tripletsMap.set(t.payment.id, t);
    }
  }

  const { summary, discrepancies } = reconcileTriplets(triplets, options);

  // 5. Auto-Heal Eligible Discrepancies if requested
  if (options.autoHeal && db && discrepancies.length > 0) {
    const healResult = await autoHealDiscrepancies(db, discrepancies, tripletsMap);
    summary.autoHealedCount = healResult.autoHealedCount;
    let healedDiscrepancies = 0;
    for (const d of discrepancies) {
      if (d.resolutionStatus === 'AUTO_RESOLVED') {
        healedDiscrepancies++;
        summary.netDiscrepancyAmountPaisa -= d.discrepancyAmountPaisa;
        if (summary.breakdownByType[d.discrepancyType] !== undefined) {
          summary.breakdownByType[d.discrepancyType] = Math.max(
            0,
            summary.breakdownByType[d.discrepancyType] - 1
          );
        }
      }
    }
    summary.discrepancyCount = Math.max(0, summary.discrepancyCount - healedDiscrepancies);
    summary.matchedCount += healedDiscrepancies;
    summary.breakdownByType['MATCHED'] = (summary.breakdownByType['MATCHED'] ?? 0) + healedDiscrepancies;
  }

  // 6. Determine Run Status
  const status =
    summary.discrepancyCount === 0
      ? 'MATCHED'
      : 'DISCREPANCIES_DETECTED';

  const completedAt = new Date();

  // 7. Persist Run & Discrepancies to Database
  if (db) {
    await db.insert(runsTable).values({
      id: runId,
      merchantId: options.merchantId ?? null,
      provider: options.provider ?? 'ALL',
      batchId: batchId ?? null,
      startDate,
      endDate,
      status,
      totalRecordsEvaluated: summary.totalRecordsEvaluated,
      matchedCount: summary.matchedCount,
      discrepancyCount: summary.discrepancyCount,
      autoHealedCount: summary.autoHealedCount,
      totalInternalAmountPaisa: summary.totalInternalAmountPaisa,
      totalProviderAmountPaisa: summary.totalProviderAmountPaisa,
      totalLedgerAmountPaisa: summary.totalLedgerAmountPaisa,
      netDiscrepancyAmountPaisa: summary.netDiscrepancyAmountPaisa,
      summary: summary.breakdownByType,
      triggeredBy: options.triggeredBy ?? 'MANUAL',
      completedAt,
      createdAt: new Date(),
    });

    if (discrepancies.length > 0) {
      const discRows = discrepancies.map((d) => ({
        id: generateId('rcd'),
        runId,
        batchId: batchId ?? null,
        discrepancyType: d.discrepancyType,
        paymentId: d.paymentId ?? null,
        providerTrxId: d.providerTrxId ?? null,
        provider: d.provider,
        merchantId: d.merchantId ?? null,
        internalAmountPaisa: d.internalAmountPaisa ?? null,
        providerAmountPaisa: d.providerAmountPaisa ?? null,
        ledgerAmountPaisa: d.ledgerAmountPaisa ?? null,
        discrepancyAmountPaisa: d.discrepancyAmountPaisa,
        internalStatus: d.internalStatus ?? null,
        providerStatus: d.providerStatus ?? null,
        expectedFeePaisa: d.expectedFeePaisa ?? null,
        actualFeePaisa: d.actualFeePaisa ?? null,
        resolutionStatus: d.resolutionStatus,
        resolutionNotes: d.resolutionNotes ?? null,
        resolvedAt: d.resolvedAt ?? null,
        resolvedBy: d.resolvedBy ?? null,
        createdAt: new Date(),
      }));

      const chunkSize = 100;
      for (let i = 0; i < discRows.length; i += chunkSize) {
        await db.insert(discrepanciesTable).values(discRows.slice(i, i + chunkSize));
      }
    }
  }

  return {
    runId,
    batchId,
    status,
    startDate,
    endDate,
    summary,
    discrepancies,
    completedAt,
  };
}
