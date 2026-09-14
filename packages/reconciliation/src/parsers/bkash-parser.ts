import { createHash } from 'node:crypto';
import { Paisa } from '@denaneya/payment-core';
import type { StatementBatch, StatementItem, StatementParser } from './statement-parser.interface.js';
import { parseCsvToObjects } from './csv-helper.js';
import { StatementParsingError } from '../errors.js';

export class BKashStatementParser implements StatementParser {
  readonly provider = 'BKASH';

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
        throw new StatementParsingError(`Failed to parse bKash JSON statement: ${(err as Error).message}`);
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
      const trxId = String(row.trxid ?? row.trxId ?? row.trx_id ?? row.providertrxid ?? '').trim();
      const invoiceNo = String(row.merchantinvoicenumber ?? row.merchantInvoiceNumber ?? row.merchant_invoice_number ?? row.merchanttxid ?? '').trim();
      const amountStr = String(row.amount ?? '0').trim();
      const feeStr = String(row.fee ?? '0.00').trim();
      const rawStatus = String(row.trxstatus ?? row.trxStatus ?? row.status ?? '').trim().toUpperCase();
      const timeStr = String(row.completedtime ?? row.completedTime ?? row.initiationtime ?? row.initiationTime ?? row.transactionTime ?? '').trim();

      if (!trxId && !invoiceNo) {
        continue;
      }

      let amountPaisa = 0n;
      let feePaisa = 0n;
      try {
        amountPaisa = Paisa.fromBDT(amountStr).toPaisa();
        feePaisa = feeStr ? Paisa.fromBDT(feeStr).toPaisa() : 0n;
      } catch (err) {
        throw new StatementParsingError(
          `Invalid amount in bKash statement at row ${index + 1}: ${(err as Error).message}`,
          { row, index }
        );
      }

      const netAmountPaisa = amountPaisa >= feePaisa ? amountPaisa - feePaisa : 0n;

      let providerStatus: 'COMPLETED' | 'FAILED' | 'CANCELLED' = 'FAILED';
      if (rawStatus === 'COMPLETED' || rawStatus === 'SUCCESS') {
        providerStatus = 'COMPLETED';
      } else if (rawStatus === 'CANCELLED') {
        providerStatus = 'CANCELLED';
      }

      const txDate = timeStr ? new Date(timeStr) : new Date();
      const validDate = isNaN(txDate.getTime()) ? new Date() : txDate;
      if (index === 0) {
        statementDate = validDate;
      }

      const item: StatementItem = {
        provider: this.provider,
        providerTrxId: trxId || invoiceNo,
        merchantTxId: invoiceNo || undefined,
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
    const ref = batchReference ?? `BKASH-${statementDate.toISOString().slice(0, 10)}-${fileHash.slice(0, 8)}`;

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
