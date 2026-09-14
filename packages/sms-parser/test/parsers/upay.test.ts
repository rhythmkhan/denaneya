import { describe, it, expect } from 'vitest';
import { UpayParser } from '../../src/parsers/upay.js';

describe('UpayParser', () => {
  const parser = new UpayParser();

  it('parses Upay Received Money notification', () => {
    const raw =
      'Received Tk 1,000.00 from 01712345678. TrxID: UP729401. Fee: Tk 0.00. Balance: Tk 14,200.00. Time: 13/09/2026 20:05';
    const result = parser.parse('16268', raw);

    expect(result.status).toBe('SUCCESS');
    expect(result.provider).toBe('UPAY');
    expect(result.type).toBe('PAYMENT_RECEIVED');
    expect(result.trxId).toBe('UP729401');
    expect(result.amountPaisa.toBDT()).toBe('1000.00');
    expect(result.balancePaisa?.toBDT()).toBe('14200.00');
    expect(result.isSenderVerified).toBe(true);
  });

  it('parses Upay Payment Received with Reference', () => {
    const raw =
      'Payment Tk 1,500.00 received from 01812345678. Ref: BILL-12. TrxID: UP839102. Fee: Tk 0.00. Balance: Tk 15,700.00. Time: 13/09/2026 21:00';
    const result = parser.parse('upay', raw);

    expect(result.status).toBe('SUCCESS');
    expect(result.type).toBe('PAYMENT_RECEIVED');
    expect(result.amountPaisa.toBDT()).toBe('1500.00');
    expect(result.reference).toBe('BILL-12');
  });

  it('parses Upay Cash In', () => {
    const raw =
      'Cash In Tk 2,000.00 from 01912345678. TrxID: UP102938. Fee: Tk 0.00. Balance: Tk 8,500.00. Time: 12/09/2026 11:30';
    const result = parser.parse('Upay', raw);

    expect(result.status).toBe('SUCCESS');
    expect(result.type).toBe('CASH_IN');
    expect(result.amountPaisa.toBDT()).toBe('2000.00');
  });

  it('parses Upay Cash Out debit with fee', () => {
    const raw =
      'Cash Out Tk 500.00 to 01612345678. TrxID: UP992811. Fee: Tk 7.00. Balance: Tk 7,993.00. Time: 13/09/2026 22:30';
    const result = parser.parse('16268', raw);

    expect(result.status).toBe('SUCCESS');
    expect(result.type).toBe('CASH_OUT');
    expect(result.amountPaisa.toBDT()).toBe('500.00');
    expect(result.feePaisa.toBDT()).toBe('7.00');
    expect(result.balancePaisa?.toBDT()).toBe('7993.00');
  });
});