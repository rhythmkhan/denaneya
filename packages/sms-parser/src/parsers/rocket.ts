import { Paisa } from '@denaneya/payment-core';
import type { ParsedSmsResult } from '../types.js';
import { sanitizeSmsText } from '../utils/bengali.js';
import { parseBstDate } from '../utils/date.js';
import { BaseProviderParser } from './base.js';

export class RocketParser extends BaseProviderParser {
  readonly provider = 'ROCKET' as const;
  readonly verifiedSenders = ['16216', 'Rocket', 'DBBL'] as const;
  readonly version = 'rocket_v1';

  // 1. Payment / Money Received
  private static readonly PATTERN_RECEIVED =
    /(?:Payment\s+)?Tk\s*([0-9,]+(?:\.[0-9]{2})?)\s+received from A\/C:\s*([0-9+]+)\.?(?:\s+(?:Ref|Reference|Bill):\s*([^.]+?)\.?)?\s+Fee\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+Balance:\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+TxnId:\s*([A-Za-z0-9_-]+)\.?\s+Date:\s*([0-9A-Za-z/:\-\s\u0980-\u09FF]+)/i;

  // 2. Cash In
  private static readonly PATTERN_CASH_IN =
    /Cash In Tk\s*([0-9,]+(?:\.[0-9]{2})?)\s+from A\/C:\s*([0-9+]+)\.?\s+TxnId:\s*([A-Za-z0-9_-]+)\.?\s+Fee\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+Balance:\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+Date:\s*([0-9A-Za-z/:\-\s\u0980-\u09FF]+)/i;

  // 3. Cash Out / Debit
  private static readonly PATTERN_DEBIT =
    /Cash Out Tk\s*([0-9,]+(?:\.[0-9]{2})?)\s+to A\/C:\s*([0-9+]+)\.?\s+Fee\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+Balance:\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+TxnId:\s*([A-Za-z0-9_-]+)\.?\s+Date:\s*([0-9A-Za-z/:\-\s\u0980-\u09FF]+)/i;

  // 4. Bengali Payment Received
  private static readonly PATTERN_BENGALI =
    /(?:A\/C:\s*([0-9+]+)\s+থেকে\s+)?Tk\s*([0-9,]+(?:\.[0-9]{2})?)\s+(?:টাকা\s+)?পেয়েছেন(?:\s+A\/C:\s*([0-9+]+)\s+থেকে)?\.?(?:\s+(?:রেফারেন্স|Ref):\s*([^.]+?)\.?)?\s+ফি\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+ব্যালেন্স:\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+TxnId:\s*([A-Za-z0-9_-]+)\.?\s+তারিখ:\s*([0-9A-Za-z/:\-\s\u0980-\u09FF]+)/i;

  // 5. Bengali Cash In
  private static readonly PATTERN_BENGALI_CASH_IN =
    /(?:A\/C:\s*([0-9+]+)\s+থেকে\s+ক্যাশ ইন\s+Tk\s*([0-9,]+(?:\.[0-9]{2})?)|ক্যাশ ইন\s+Tk\s*([0-9,]+(?:\.[0-9]{2})?)\s+from A\/C:\s*([0-9+]+))\.?\s+TxnId:\s*([A-Za-z0-9_-]+)\.?\s+(?:ফি|Fee)\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+(?:ব্যালেন্স|Balance):\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+(?:তারিখ|Date):\s*([0-9A-Za-z/:\-\s\u0980-\u09FF]+)/i;

  // 6. Bengali Cash Out
  private static readonly PATTERN_BENGALI_DEBIT =
    /(?:A\/C:\s*([0-9+]+)\s+এ\s+ক্যাশ আউট\s+Tk\s*([0-9,]+(?:\.[0-9]{2})?)|ক্যাশ আউট\s+Tk\s*([0-9,]+(?:\.[0-9]{2})?)\s+to A\/C:\s*([0-9+]+))\.?\s+(?:ফি|Fee)\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+(?:ব্যালেন্স|Balance):\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+TxnId:\s*([A-Za-z0-9_-]+)\.?\s+(?:তারিখ|Date):\s*([0-9A-Za-z/:\-\s\u0980-\u09FF]+)/i;

  canParse(sender: string, text: string): boolean {
    if (this.isSenderVerified(sender)) return true;
    const sanitized = sanitizeSmsText(text);
    return (
      sanitized.includes('TxnId') &&
      (sanitized.includes('Rocket') ||
        sanitized.includes('DBBL') ||
        sanitized.includes('A/C') ||
        sanitized.includes('পেয়েছেন') ||
        sanitized.includes('ক্যাশ ইন') ||
        sanitized.includes('ক্যাশ আউট') ||
        (sanitized.includes('Tk') && sanitized.includes('received from A/C')))
    );
  }

  parse(sender: string, text: string): ParsedSmsResult {
    const sanitized = sanitizeSmsText(text);

    // 1. Money / Payment Received
    const matchRecv = sanitized.match(RocketParser.PATTERN_RECEIVED);
    if (matchRecv) {
      const [, amt, counterparty, ref, fee, bal, trx, dt] = matchRecv;
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
    const matchCashIn = sanitized.match(RocketParser.PATTERN_CASH_IN);
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
    const matchBn = sanitized.match(RocketParser.PATTERN_BENGALI);
    if (matchBn) {
      const [, cp1, amt, cp2, ref, fee, bal, trx, dt] = matchBn;
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
    const matchBnCashIn = sanitized.match(RocketParser.PATTERN_BENGALI_CASH_IN);
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
    const matchBnDebit = sanitized.match(RocketParser.PATTERN_BENGALI_DEBIT);
    if (matchBnDebit) {
      const [, cp1, amt1, amt2, cp2, fee, bal, trx, dt] = matchBnDebit;
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
    const matchDebit = sanitized.match(RocketParser.PATTERN_DEBIT);
    if (matchDebit) {
      const [, amt, counterparty, fee, bal, trx, dt] = matchDebit;
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

    throw new Error(`Rocket SMS format could not be matched: "${text}"`);
  }
}