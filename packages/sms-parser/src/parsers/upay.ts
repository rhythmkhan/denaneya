import { Paisa } from '@denaneya/payment-core';
import type { ParsedSmsResult } from '../types.js';
import { sanitizeSmsText } from '../utils/bengali.js';
import { parseBstDate } from '../utils/date.js';
import { BaseProviderParser } from './base.js';

export class UpayParser extends BaseProviderParser {
  readonly provider = 'UPAY' as const;
  readonly verifiedSenders = ['16268', 'upay', 'Upay'] as const;
  readonly version = 'upay_v1';

  // 1. Payment / Money Received
  private static readonly PATTERN_RECEIVED =
    /(?:Payment\s+Tk\s*([0-9,]+(?:\.[0-9]{2})?)\s+received|Received\s+Tk\s*([0-9,]+(?:\.[0-9]{2})?))\s+from\s+([0-9+]+)\.?(?:\s+Ref:\s*([^.]+?)\.?)?\s+TrxID:\s*([A-Za-z0-9_-]+)\.?\s+Fee:\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+Balance:?\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+Time:\s*([0-9/:\-\s]+)/i;

  // 2. Cash In
  private static readonly PATTERN_CASH_IN =
    /Cash In Tk\s*([0-9,]+(?:\.[0-9]{2})?)\s+from\s+([0-9+]+)\.?\s+TrxID:\s*([A-Za-z0-9_-]+)\.?\s+Fee:\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+Balance:?\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+Time:\s*([0-9/:\-\s]+)/i;

  // 3. Cash Out / Debit
  private static readonly PATTERN_DEBIT =
    /Cash Out Tk\s*([0-9,]+(?:\.[0-9]{2})?)\s+to\s+([0-9+]+)\.?\s+TrxID:\s*([A-Za-z0-9_-]+)\.?\s+Fee:\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+Balance:?\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+Time:\s*([0-9/:\-\s]+)/i;

  // 4. Bengali Payment Received
  private static readonly PATTERN_BENGALI =
    /(?:([0-9+]+)\s+থেকে\s+Tk\s*([0-9,]+(?:\.[0-9]{2})?)\s+(?:পেমেন্ট\s+|টাকা\s+)?পেয়েছেন|Tk\s*([0-9,]+(?:\.[0-9]{2})?)\s+পেমেন্ট পেয়েছেন\s+([0-9+]+)\s+থেকে)\.?(?:\s+(?:রেফারেন্স|Ref):\s*([^.]+?)\.?)?\s+TrxID:\s*([A-Za-z0-9_-]+)\.?\s+ফি:\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+ব্যালেন্স:\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+সময়:\s*([0-9/:\-\s]+)/i;

  // 5. Bengali Cash In
  private static readonly PATTERN_BENGALI_CASH_IN =
    /(?:([0-9+]+)\s+থেকে\s+ক্যাশ ইন\s+Tk\s*([0-9,]+(?:\.[0-9]{2})?)|ক্যাশ ইন\s+Tk\s*([0-9,]+(?:\.[0-9]{2})?)\s+from\s+([0-9+]+))\.?\s+TrxID:\s*([A-Za-z0-9_-]+)\.?\s+(?:ফি|Fee):\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+(?:ব্যালেন্স|Balance):?\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+(?:সময়|Time):\s*([0-9/:\-\s]+)/i;

  // 6. Bengali Cash Out
  private static readonly PATTERN_BENGALI_DEBIT =
    /(?:([0-9+]+)\s+এ\s+ক্যাশ আউট\s+Tk\s*([0-9,]+(?:\.[0-9]{2})?)|ক্যাশ আউট\s+Tk\s*([0-9,]+(?:\.[0-9]{2})?)\s+to\s+([0-9+]+))\.?\s+TrxID:\s*([A-Za-z0-9_-]+)\.?\s+(?:ফি|Fee):\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+(?:ব্যালেন্স|Balance):?\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+(?:সময়|Time):\s*([0-9/:\-\s]+)/i;

  canParse(sender: string, text: string): boolean {
    if (this.isSenderVerified(sender)) return true;
    const sanitized = sanitizeSmsText(text);
    return (
      sanitized.includes('TrxID') &&
      (sanitized.includes('Upay') ||
        sanitized.includes('upay') ||
        sanitized.includes('Received Tk') ||
        sanitized.includes('পেয়েছেন') ||
        sanitized.includes('ক্যাশ ইন') ||
        sanitized.includes('ক্যাশ আউট') ||
        sanitized.includes('Time:') ||
        sanitized.includes('সময়:'))
    );
  }

  parse(sender: string, text: string): ParsedSmsResult {
    const sanitized = sanitizeSmsText(text);

    // 1. Received / Payment Received
    const matchRecv = sanitized.match(UpayParser.PATTERN_RECEIVED);
    if (matchRecv) {
      const [, amt1, amt2, counterparty, ref, trx, fee, bal, dt] = matchRecv;
      const amt = amt1 ?? amt2;
      return this.createResult({
        type: 'PAYMENT_RECEIVED',
        trxId: trx!,
        amountPaisa: this.parsePaisa(amt!),
        feePaisa: this.parsePaisa(fee ?? '0.00'),
        counterparty: counterparty!,
        balancePaisa: this.parsePaisa(bal!),
        reference: ref?.trim() || null,
        timestamp: parseBstDate(dt!),
        rawSms: text,
        sender,
      });
    }

    // 2. Cash In
    const matchCashIn = sanitized.match(UpayParser.PATTERN_CASH_IN);
    if (matchCashIn) {
      const [, amt, counterparty, trx, fee, bal, dt] = matchCashIn;
      return this.createResult({
        type: 'CASH_IN',
        trxId: trx!,
        amountPaisa: this.parsePaisa(amt!),
        feePaisa: this.parsePaisa(fee ?? '0.00'),
        counterparty: counterparty!,
        balancePaisa: this.parsePaisa(bal!),
        timestamp: parseBstDate(dt!),
        rawSms: text,
        sender,
      });
    }

    // 3. Bengali Payment Received
    const matchBn = sanitized.match(UpayParser.PATTERN_BENGALI);
    if (matchBn) {
      const [, cp1, amt1, amt2, cp2, ref, trx, fee, bal, dt] = matchBn;
      const amt = amt1 ?? amt2;
      const counterparty = cp1 ?? cp2 ?? '';
      return this.createResult({
        type: 'PAYMENT_RECEIVED',
        trxId: trx!,
        amountPaisa: this.parsePaisa(amt!),
        feePaisa: this.parsePaisa(fee ?? '0.00'),
        counterparty: counterparty || null,
        balancePaisa: this.parsePaisa(bal!),
        reference: ref?.trim() || null,
        timestamp: parseBstDate(dt!),
        rawSms: text,
        sender,
      });
    }

    // 4. Bengali Cash In
    const matchBnCashIn = sanitized.match(UpayParser.PATTERN_BENGALI_CASH_IN);
    if (matchBnCashIn) {
      const [, cp1, amt1, amt2, cp2, trx, fee, bal, dt] = matchBnCashIn;
      const amt = amt1 ?? amt2;
      const counterparty = cp1 ?? cp2 ?? '';
      return this.createResult({
        type: 'CASH_IN',
        trxId: trx!,
        amountPaisa: this.parsePaisa(amt!),
        feePaisa: this.parsePaisa(fee ?? '0.00'),
        counterparty: counterparty || null,
        balancePaisa: this.parsePaisa(bal!),
        timestamp: parseBstDate(dt!),
        rawSms: text,
        sender,
      });
    }

    // 5. Bengali Cash Out
    const matchBnDebit = sanitized.match(UpayParser.PATTERN_BENGALI_DEBIT);
    if (matchBnDebit) {
      const [, cp1, amt1, amt2, cp2, trx, fee, bal, dt] = matchBnDebit;
      const amt = amt1 ?? amt2;
      const counterparty = cp1 ?? cp2 ?? '';
      return this.createResult({
        type: 'CASH_OUT',
        trxId: trx!,
        amountPaisa: this.parsePaisa(amt!),
        feePaisa: this.parsePaisa(fee ?? '0.00'),
        counterparty: counterparty || null,
        balancePaisa: this.parsePaisa(bal!),
        timestamp: parseBstDate(dt!),
        rawSms: text,
        sender,
      });
    }

    // 6. Debit / Cash Out (English)
    const matchDebit = sanitized.match(UpayParser.PATTERN_DEBIT);
    if (matchDebit) {
      const [, amt, counterparty, trx, fee, bal, dt] = matchDebit;
      return this.createResult({
        type: 'CASH_OUT',
        trxId: trx!,
        amountPaisa: this.parsePaisa(amt!),
        feePaisa: this.parsePaisa(fee ?? '0.00'),
        counterparty: counterparty!,
        balancePaisa: this.parsePaisa(bal!),
        timestamp: parseBstDate(dt!),
        rawSms: text,
        sender,
      });
    }

    throw new Error(`Upay SMS format could not be matched: "${text}"`);
  }
}