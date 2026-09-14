import { Paisa } from '@denaneya/payment-core';
import type { ParsedSmsResult } from '../types.js';
import { sanitizeSmsText } from '../utils/bengali.js';
import { parseBstDate } from '../utils/date.js';
import { BaseProviderParser } from './base.js';

export class BkashParser extends BaseProviderParser {
  readonly provider = 'BKASH' as const;
  readonly verifiedSenders = ['bKash', '16247', 'BKASH'] as const;
  readonly version = 'bkash_v1';

  // 1. English Merchant Payment Received
  private static readonly PATTERN_MERCHANT_PAYMENT =
    /Payment Tk\s*([0-9,]+(?:\.[0-9]{2})?)\s+(?:received from|from)\s+([0-9+]+)(?:\s+received)?\.?(?:\s+(?:Ref|Reference)\s+([^.]+?)\.?)?(?:\s+Counter\s+([^.]+?)\.?)?\s+Fee Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+Balance Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+TrxID\s+([A-Za-z0-9_-]+)\s+at\s+([0-9/:\-\s]+)/i;

  // 2. English Money Received / Payment Received (You have received...)
  private static readonly PATTERN_MONEY_RECEIVED =
    /You have received(?:\s+payment)?\s+Tk\s*([0-9,]+(?:\.[0-9]{2})?)\s+from\s+([0-9+]+)\.?(?:\s+(?:Ref|Reference)\s+([^.]+?)\.?)?\s+Fee Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+Balance Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+TrxID\s+([A-Za-z0-9_-]+)\s+at\s+([0-9/:\-\s]+)/i;

  // 3. English Cash In
  private static readonly PATTERN_CASH_IN =
    /Cash In Tk\s*([0-9,]+(?:\.[0-9]{2})?)\s+from\s+([0-9+]+)(?:\s+successful)?\.?\s+Fee Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+Balance Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+TrxID\s+([A-Za-z0-9_-]+)\s+at\s+([0-9/:\-\s]+)/i;

  // 4. English Cash Out / Send Money (Debit)
  private static readonly PATTERN_DEBIT =
    /(Cash Out|Send Money)\s+Tk\s*([0-9,]+(?:\.[0-9]{2})?)\s+to\s+([0-9+]+)\.?\s+Fee Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+Balance Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+TrxID\s+([A-Za-z0-9_-]+)\s+at\s+([0-9/:\-\s]+)/i;

  // 5. Bengali Payment Received / Money Received
  private static readonly PATTERN_BENGALI_PAYMENT =
    /(?:আপনি\s+)?([0-9+]+)\s+থেকে\s+Tk\s*([0-9,]+(?:\.[0-9]{2})?)\s+(?:পেমেন্ট\s+|টাকা\s+)?পেয়েছেন\.?(?:\s+(?:রেফারেন্স|Ref)\s+([^.]+?)\.?)?(?:\s+(?:কাউন্টার|Counter)\s+([^.]+?)\.?)?\s+ফি\s+Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+ব্যালেন্স\s+Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+TrxID\s+([A-Za-z0-9_-]+)(?:\s+(?:সময়|at)\s+([0-9/:\-\s]+))?/i;

  // 6. Bengali Cash In
  private static readonly PATTERN_BENGALI_CASH_IN =
    /(?:ক্যাশ ইন|Cash In)\s+Tk\s*([0-9,]+(?:\.[0-9]{2})?)\s+(?:থেকে|from)\s+([0-9+]+)(?:\s+সফল|\s+successful)?\.?\s+ফি\s+Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+ব্যালেন্স\s+Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+TrxID\s+([A-Za-z0-9_-]+)(?:\s+(?:সময়|at)\s+([0-9/:\-\s]+))?/i;

  // 7. Bengali Cash Out / Send Money
  private static readonly PATTERN_BENGALI_DEBIT =
    /(ক্যাশ আউট|Cash Out|সেন্ড মানি|Send Money)\s+Tk\s*([0-9,]+(?:\.[0-9]{2})?)\s+(?:টু|to)\s+([0-9+]+)\.?\s+(?:ফি|Fee)\s+Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+(?:ব্যালেন্স|Balance)\s+Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+TrxID\s+([A-Za-z0-9_-]+)(?:\s+(?:সময়|at)\s+([0-9/:\-\s]+))?/i;

  canParse(sender: string, text: string): boolean {
    if (this.isSenderVerified(sender)) return true;
    const sanitized = sanitizeSmsText(text);
    return (
      sanitized.includes('TrxID') &&
      (sanitized.includes('bKash') ||
        sanitized.includes('Payment Tk') ||
        sanitized.includes('You have received Tk') ||
        sanitized.includes('পেমেন্ট পেয়েছেন') ||
        sanitized.includes('টাকা পেয়েছেন') ||
        sanitized.includes('ক্যাশ আউট') ||
        sanitized.includes('ক্যাশ ইন') ||
        sanitized.includes('সেন্ড মানি'))
    );
  }

  parse(sender: string, text: string): ParsedSmsResult {
    const sanitized = sanitizeSmsText(text);

    // 1. Try Merchant Payment
    const matchPay = sanitized.match(BkashParser.PATTERN_MERCHANT_PAYMENT);
    if (matchPay) {
      const [, amt, counterparty, ref, counter, fee, bal, trx, dt] = matchPay;
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
        metadata: counter ? { counter: counter.trim() } : undefined,
      });
    }

    // 2. Try Money Received
    const matchRecv = sanitized.match(BkashParser.PATTERN_MONEY_RECEIVED);
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

    // 3. Try Cash In
    const matchCashIn = sanitized.match(BkashParser.PATTERN_CASH_IN);
    if (matchCashIn) {
      const [, amt, counterparty, fee, bal, trx, dt] = matchCashIn;
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

    // 4. Try Bengali Payment / Money Received
    const matchBn = sanitized.match(BkashParser.PATTERN_BENGALI_PAYMENT);
    if (matchBn) {
      const [, counterparty, amt, ref, counter, fee, bal, trx, dt] = matchBn;
      return this.createResult({
        type: 'PAYMENT_RECEIVED',
        trxId: trx!,
        amountPaisa: this.parsePaisa(amt!),
        feePaisa: this.parsePaisa(fee ?? '0.00'),
        counterparty: counterparty!,
        balancePaisa: this.parsePaisa(bal!),
        reference: ref?.trim() || null,
        timestamp: parseBstDate(dt ?? ''),
        rawSms: text,
        sender,
        metadata: counter ? { counter: counter.trim() } : undefined,
      });
    }

    // 5. Try Bengali Cash In
    const matchBnCashIn = sanitized.match(BkashParser.PATTERN_BENGALI_CASH_IN);
    if (matchBnCashIn) {
      const [, amt, counterparty, fee, bal, trx, dt] = matchBnCashIn;
      return this.createResult({
        type: 'CASH_IN',
        trxId: trx!,
        amountPaisa: this.parsePaisa(amt!),
        feePaisa: this.parsePaisa(fee ?? '0.00'),
        counterparty: counterparty!,
        balancePaisa: this.parsePaisa(bal!),
        timestamp: parseBstDate(dt ?? ''),
        rawSms: text,
        sender,
      });
    }

    // 6. Try Bengali Cash Out / Send Money
    const matchBnDebit = sanitized.match(BkashParser.PATTERN_BENGALI_DEBIT);
    if (matchBnDebit) {
      const [, debitType, amt, counterparty, fee, bal, trx, dt] = matchBnDebit;
      const type =
        debitType!.toLowerCase().includes('cash out') || debitType!.includes('ক্যাশ আউট')
          ? 'CASH_OUT'
          : 'SEND_MONEY';
      return this.createResult({
        type,
        trxId: trx!,
        amountPaisa: this.parsePaisa(amt!),
        feePaisa: this.parsePaisa(fee ?? '0.00'),
        counterparty: counterparty!,
        balancePaisa: this.parsePaisa(bal!),
        timestamp: parseBstDate(dt ?? ''),
        rawSms: text,
        sender,
      });
    }

    // 7. Try English Cash Out / Send Money
    const matchDebit = sanitized.match(BkashParser.PATTERN_DEBIT);
    if (matchDebit) {
      const [, debitType, amt, counterparty, fee, bal, trx, dt] = matchDebit;
      const type = debitType!.toLowerCase().includes('cash out') ? 'CASH_OUT' : 'SEND_MONEY';
      return this.createResult({
        type,
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

    throw new Error(`bKash SMS format could not be matched: "${text}"`);
  }
}