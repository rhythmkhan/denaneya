import { createHash } from 'node:crypto';
import { Paisa } from '@denaneya/payment-core';
import type { StatementBatch, StatementItem, StatementParser } from './statement-parser.interface.js';
import { parseCsvToObjects } from './csv-helper.js';
import { StatementParsingError } from '../errors.js';

export class SSLCommerzStatementParser implements StatementParser {
  readonly provider = 'SSLCOMMERZ';

  async parse(content: string, batchReference?: string): Promise<StatementBatch> {
    if (!content || content.trim().length === 0) {
      throw new StatementParsingError('Statement content is empty');
    }

    const trimmed = content.trim();
    const isJson = trimmed.startsWith('[') || trimmed.startsWith('{');
    let rawRows: Record<string, any>[] = [];

    if (isJson) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          rawRows = parsed;
        } else if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.records)) {
            rawRows = parsed.records;
          } else if (Array.isArray(parsed.data)) {
            rawRows = parsed.data;
          } else if (Array.isArray(parsed.items)) {
            rawRows = parsed.items;
          } else {
            throw new StatementParsingError('JSON statement missing records/data array');
          }
        }
      } catch (err) {
        if (err instanceof StatementParsingError) throw err;
        throw new StatementParsingError(`Failed to parse SSLCOMMERZ JSON statement: ${(err as Error).message}`);
      }
    } else {
      rawRows = parseCsvToObjects(content);
    }

    const items: StatementItem[] = [];
    let totalGrossPaisa = 0n;
    let totalFeePaisa = 0n;
    let totalNetPaisa = 0n;
    let statementDate = new Date();

    for (let index = 0; index < rawRows.length; index++) {
      const row = rawRows[index]!;
      // Handle normalized key lookups
      const tranId = String(row.tran_id ?? row.tranId ?? row.merchantTxId ?? row.orderId ?? '').trim();
      const valId = String(row.val_id ?? row.valId ?? row.bank_tran_id ?? row.bankTranId ?? row.providerTrxId ?? '').trim();
      const amountStr = String(row.amount ?? '0').trim();
      const storeAmountStr = String(row.store_amount ?? row.storeAmount ?? row.net_amount ?? amountStr).trim();
      const rawStatus = String(row.status ?? '').trim().toUpperCase();
      const dateStr = String(row.tran_date ?? row.tranDate ?? row.date ?? row.transactionTime ?? '').trim();

      if (!valId && !tranId) {
        continue; // Skip invalid or empty rows
      }

      let amountPaisa = 0n;
      let netAmountPaisa = 0n;
      try {
        amountPaisa = Paisa.fromBDT(amountStr).toPaisa();
        netAmountPaisa = Paisa.fromBDT(storeAmountStr).toPaisa();
      } catch (err) {
        throw new StatementParsingError(
          `Invalid amount in SSLCOMMERZ statement at row ${index + 1}: ${(err as Error).message}`,
          { row, index }
        );
      }

      const feePaisa = amountPaisa >= netAmountPaisa ? amountPaisa - netAmountPaisa : 0n;

      let providerStatus: 'COMPLETED' | 'FAILED' | 'CANCELLED' = 'FAILED';
      if (rawStatus === 'VALID' || rawStatus === 'COMPLETED' || rawStatus === 'SUCCESS') {
        providerStatus = 'COMPLETED';
      } else if (rawStatus === 'CANCELLED') {
        providerStatus = 'CANCELLED';
      }

      const txDate = dateStr ? new Date(dateStr) : new Date();
      const validDate = isNaN(txDate.getTime()) ? new Date() : txDate;
      if (index === 0) {
        statementDate = validDate;
      }

      const item: StatementItem = {
        provider: this.provider,
        providerTrxId: valId || tranId,
        merchantTxId: tranId || undefined,
        amountPaisa,
        feePaisa,
        netAmountPaisa,
        currency: 'BDT',
        providerStatus,
        transactionTime: validDate,
        rawRecord: row,
      };

      items.push(item);
      totalGrossPaisa += amountPaisa;
      totalFeePaisa += feePaisa;
      totalNetPaisa += netAmountPaisa;
    }

    const fileHash = createHash('sha256').update(content).digest('hex');
    const ref = batchReference ?? `SSL-${statementDate.toISOString().slice(0, 10)}-${fileHash.slice(0, 8)}`;

    return {
      provider: this.provider,
      batchReference: ref,
      statementDate,
      items,
      totalGrossPaisa,
      totalFeePaisa,
      totalNetPaisa,
      fileHash,
    };
  }
}
