import { describe, it, expect } from 'vitest';
import { NagadParser } from '../../src/parsers/nagad.js';

describe('NagadParser', () => {
  const parser = new NagadParser();

  it('parses English Merchant Pay with Reference', () => {
    const raw =
      'Merchant Pay. Amount: Tk 1,500.00. From: 01712345678. Ref: Invoice101. TxnID: 72N4A99X. Fee: Tk 0.00. Balance: Tk 24,500.00. Date: 13/09/2026 21:15';
    const result = parser.parse('NAGAD', raw);

    expect(result.status).toBe('SUCCESS');
    expect(result.provider).toBe('NAGAD');
    expect(result.type).toBe('PAYMENT_RECEIVED');
    expect(result.trxId).toBe('72N4A99X');
    expect(result.amountPaisa.amountPaisa).toBe(150000n);
    expect(result.feePaisa.amountPaisa).toBe(0n);
    expect(result.balancePaisa?.amountPaisa).toBe(2450000n);
    expect(result.reference).toBe('Invoice101');
    expect(result.counterparty).toBe('01712345678');
    expect(result.isSenderVerified).toBe(true);
  });

  it('parses English Money Received', () => {
    const raw =
      'Money Received. Amount: Tk 800.00. Sender: 01912345678. TxnID: 71K8P42Z. Fee: Tk 0.00. Balance: Tk 12,800.00. Date: 12/09/2026 16:40';
    const result = parser.parse('16167', raw);

    expect(result.status).toBe('SUCCESS');
    expect(result.type).toBe('PAYMENT_RECEIVED');
    expect(result.trxId).toBe('71K8P42Z');
    expect(result.amountPaisa.toBDT()).toBe('800.00');
    expect(result.balancePaisa?.toBDT()).toBe('12800.00');
    expect(result.counterparty).toBe('01912345678');
  });

  it('parses English Cash In', () => {
    const raw =
      'Cash In. Amount: Tk 5,000.00. Initiator: 01612345678. TxnID: 70J3X91W. Fee: Tk 0.00. Balance: Tk 17,800.00. Date: 10/09/2026 10:20';
    const result = parser.parse('Nagad', raw);

    expect(result.status).toBe('SUCCESS');
    expect(result.type).toBe('CASH_IN');
    expect(result.trxId).toBe('70J3X91W');
    expect(result.amountPaisa.toBDT()).toBe('5000.00');
  });

  it('parses Bengali format with Bengali numerals', () => {
    const raw =
      'টাকা পেয়েছেন। পরিমাণ: Tk ১,৫০০.০০। প্রেরক: 01712345678। TxnID: 72N4A99X। ফি: Tk ০.০০। ব্যালেন্স: Tk ২৪,৫০০.০০। তারিখ: 13/09/2026 21:15';
    const result = parser.parse('NAGAD', raw);

    expect(result.status).toBe('SUCCESS');
    expect(result.type).toBe('PAYMENT_RECEIVED');
    expect(result.trxId).toBe('72N4A99X');
    expect(result.amountPaisa.amountPaisa).toBe(150000n);
    expect(result.balancePaisa?.amountPaisa).toBe(2450000n);
  });

  it('parses Cash Out debit with fee', () => {
    const raw =
      'Cash Out. Amount: Tk 3,000.00. To: 01711122233. TxnID: 73Q2W10A. Fee: Tk 44.82. Balance: Tk 14,755.18. Date: 13/09/2026 22:00';
    const result = parser.parse('NAGAD', raw);

    expect(result.status).toBe('SUCCESS');
    expect(result.type).toBe('CASH_OUT');
    expect(result.amountPaisa.toBDT()).toBe('3000.00');
    expect(result.feePaisa.toBDT()).toBe('44.82');
    expect(result.balancePaisa?.toBDT()).toBe('14755.18');
  });
});