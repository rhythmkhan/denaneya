import { describe, it, expect } from 'vitest';
import { BkashParser } from '../../src/parsers/bkash.js';

describe('BkashParser', () => {
  const parser = new BkashParser();

  it('parses English Merchant Payment with Reference and Counter', () => {
    const raw =
      'Payment Tk 1,250.00 received from 01712345678. Ref 1002. Counter 1. Fee Tk 0.00. Balance Tk 15,450.00. TrxID 9K38AL90 at 13/09/2026 22:10';
    const result = parser.parse('bKash', raw);

    expect(result.status).toBe('SUCCESS');
    expect(result.provider).toBe('BKASH');
    expect(result.type).toBe('PAYMENT_RECEIVED');
    expect(result.trxId).toBe('9K38AL90');
    expect(result.amountPaisa.amountPaisa).toBe(125000n);
    expect(result.feePaisa.amountPaisa).toBe(0n);
    expect(result.balancePaisa?.amountPaisa).toBe(1545000n);
    expect(result.counterparty).toBe('01712345678');
    expect(result.reference).toBe('1002');
    expect(result.isSenderVerified).toBe(true);
    expect(result.metadata?.counter).toBe('1');
    expect(result.smsHash).toHaveLength(64);
  });

  it('parses English Money Received (You have received Tk...)', () => {
    const raw =
      'You have received Tk 2,000.00 from 01711223344. Fee Tk 0.00. Balance Tk 8,200.00. TrxID 9A8B7C6D at 13/09/2026 19:45';
    const result = parser.parse('16247', raw);

    expect(result.status).toBe('SUCCESS');
    expect(result.type).toBe('PAYMENT_RECEIVED');
    expect(result.trxId).toBe('9A8B7C6D');
    expect(result.amountPaisa.toBDT()).toBe('2000.00');
    expect(result.balancePaisa?.toBDT()).toBe('8200.00');
    expect(result.counterparty).toBe('01711223344');
    expect(result.isSenderVerified).toBe(true);
  });

  it('parses English Cash In', () => {
    const raw =
      'Cash In Tk 3,000.00 from 01700112233 successful. Fee Tk 0.00. Balance Tk 11,200.00. TrxID 8B9C0D1E at 13/09/2026 15:30';
    const result = parser.parse('BKASH', raw);

    expect(result.status).toBe('SUCCESS');
    expect(result.type).toBe('CASH_IN');
    expect(result.trxId).toBe('8B9C0D1E');
    expect(result.amountPaisa.toBDT()).toBe('3000.00');
  });

  it('parses Bengali Payment Received format with Bengali digits', () => {
    const raw =
      'আপনি 01712345678 থেকে Tk ১,২৫০.০০ পেমেন্ট পেয়েছেন। রেফারেন্স 1002। ফি Tk ০.০০। ব্যালেন্স Tk ১৫,৪৫০.০০। TrxID 9K38AL90 সময় 13/09/2026 22:10';
    const result = parser.parse('bKash', raw);

    expect(result.status).toBe('SUCCESS');
    expect(result.type).toBe('PAYMENT_RECEIVED');
    expect(result.trxId).toBe('9K38AL90');
    expect(result.amountPaisa.amountPaisa).toBe(125000n);
    expect(result.balancePaisa?.amountPaisa).toBe(1545000n);
  });

  it('parses Cash Out debit with non-zero fee', () => {
    const raw =
      'Cash Out Tk 1,000.00 to 01799887766. Fee Tk 18.50. Balance Tk 7,181.50. TrxID 9B8C7D6E at 13/09/2026 20:00';
    const result = parser.parse('bKash', raw);

    expect(result.status).toBe('SUCCESS');
    expect(result.type).toBe('CASH_OUT');
    expect(result.amountPaisa.toBDT()).toBe('1000.00');
    expect(result.feePaisa.toBDT()).toBe('18.50');
    expect(result.balancePaisa?.toBDT()).toBe('7181.50');
  });

  it('flags unverified sender when SMS arrives from spoofed phone number', () => {
    const raw =
      'Payment Tk 500.00 received from 01712345678. Fee Tk 0.00. Balance Tk 5,500.00. TrxID BKA123456 at 12/09/2026 14:30';
    const result = parser.parse('+8801799999999', raw);

    expect(result.status).toBe('SUCCESS');
    expect(result.isSenderVerified).toBe(false);
    expect(result.confidence).toBeLessThan(1.0);
  });
});