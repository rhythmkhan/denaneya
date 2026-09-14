import { Paisa } from '@denaneya/payment-core';
import type { ParsedSmsResult } from '../types.js';
import { sanitizeSmsText } from '../utils/bengali.js';
import { parseBstDate } from '../utils/date.js';
import { BaseProviderParser } from './base.js';

export class NagadParser extends BaseProviderParser {
  readonly provider = 'NAGAD' as const;
  readonly verifiedSenders = ['NAGAD', '16167', 'Nagad'] as const;
  readonly version = 'nagad_v1';

  // 1. English Merchant Pay
  private static readonly PATTERN_MERCHANT_PAY =
    /Merchant Pay\.?\s+Amount:\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+From:\s*([0-9+]+)\.?(?:\s+Ref:\s*([^.]+?)\.?)?\s+TxnID:\s*([A-Za-z0-9_-]+)\.?(?:\s+Fee:\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?)?\s+Balance:\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+Date:\s*([0-9/:\-\s]+)/i;

  // 2. English Money Received
  private static readonly PATTERN_MONEY_RECEIVED =
    /Money Received\.?\s+Amount:\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+Sender:\s*([0-9+]+)\.?\s+TxnID:\s*([A-Za-z0-9_-]+)\.?(?:\s+Fee:\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?)?\s+Balance:\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+Date:\s*([0-9/:\-\s]+)/i;

  // 3. English Cash In
  private static readonly PATTERN_CASH_IN =
    /Cash In\.?\s+Amount:\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+Initiator:\s*([0-9+]+)\.?\s+TxnID:\s*([A-Za-z0-9_-]+)\.?(?:\s+Fee:\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?)?\s+Balance:\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+Date:\s*([0-9/:\-\s]+)/i;

  // 4. English Cash Out / Send Money
  private static readonly PATTERN_DEBIT =
    /(Cash Out|Send Money)\.?\s+Amount:\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+(?:To|Receiver):\s*([0-9+]+)\.?\s+TxnID:\s*([A-Za-z0-9_-]+)\.?(?:\s+Fee:\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?)?\s+Balance:\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+Date:\s*([0-9/:\-\s]+)/i;

  // 5. Bengali Formats (Payment, Money Received, Cash In, Cash Out, Send Money)
  private static readonly PATTERN_BENGALI =
    /(টাকা পেয়েছেন|মার্চেন্ট পে|পেমেন্ট|ক্যাশ ইন|ক্যাশ আউট|সেন্ড মানি)\.?\s+পরিমাণ:\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+(?:প্রেরক|কাস্টমার|উদ্যোক্তা|প্রাপক|From|To|Receiver):\s*([0-9+]+)\.?(?:\s+(?:রেফারেন্স|Ref):\s*([^.]+?)\.?)?\s+TxnID:\s*([A-Za-z0-9_-]+)\.?(?:\s+ফি:\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?)?\s+ব্যালেন্স:\s*Tk\s*([0-9,]+(?:\.[0-9]{2})?)\.?\s+তারিখ:\s*([0-9/:\-\s]+)/i;

  canParse(sender: string, text: string): boolean {
    if (this.isSenderVerified(sender)) return true;
    const sanitized = sanitizeSmsText(text);
    return (
      sanitized.includes('TxnID') &&
      (sanitized.includes('Nagad') ||
        sanitized.includes('Merchant Pay') ||
        sanitized.includes('Money Received') ||
        sanitized.includes('টাকা পেয়েছেন') ||
        sanitized.includes('মার্চেন্ট পে') ||
        sanitized.includes('ক্যাশ ইন') ||
        sanitized.includes('ক্যাশ আউট') ||
        sanitized.includes('সেন্ড মানি'))
    );
  }

  parse(sender: string, text: string): ParsedSmsResult {
    const sanitized = sanitizeSmsText(text);

    // 1. Merchant Pay
    const matchPay = sanitized.match(NagadParser.PATTERN_MERCHANT_PAY);
    if (matchPay) {
      const [, amt, counterparty, ref, trx, fee, bal, dt] = matchPay;
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

    // 2. Money Received
    const matchRecv = sanitized.match(NagadParser.PATTERN_MONEY_RECEIVED);
    if (matchRecv) {
      const [, amt, counterparty, trx, fee, bal, dt] = matchRecv;
      return this.createResult({
        type: 'PAYMENT_RECEIVED',
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

    // 3. Cash In
    const matchCashIn = sanitized.match(NagadParser.PATTERN_CASH_IN);
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

    // 4. Bengali Format
    const matchBn = sanitized.match(NagadParser.PATTERN_BENGALI);
    if (matchBn) {
      const [, actionType, amt, counterparty, ref, trx, fee, bal, dt] = matchBn;
      let type: 'PAYMENT_RECEIVED' | 'CASH_IN' | 'CASH_OUT' | 'SEND_MONEY' = 'PAYMENT_RECEIVED';
      const act = actionType ? actionType.trim() : '';
      if (act === 'ক্যাশ ইন') {
        type = 'CASH_IN';
      } else if (act === 'ক্যাশ আউট') {
        type = 'CASH_OUT';
      } else if (act === 'সেন্ড মানি') {
        type = 'SEND_MONEY';
      }
      return this.createResult({
        type,
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

    // 5. Debit
    const matchDebit = sanitized.match(NagadParser.PATTERN_DEBIT);
    if (matchDebit) {
      const [, debitType, amt, counterparty, trx, fee, bal, dt] = matchDebit;
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

    throw new Error(`Nagad SMS format could not be matched: "${text}"`);
  }
}