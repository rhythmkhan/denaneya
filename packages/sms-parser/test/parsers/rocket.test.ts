import { describe, it, expect } from 'vitest';
import { RocketParser } from '../../src/parsers/rocket.js';

describe('RocketParser', () => {
  const parser = new RocketParser();

  it('parses DBBL Rocket 12-digit account number and 3-letter month format', () => {
    const raw =
      'Tk1,200.00 received from A/C: 017123456789. Fee Tk0.00. Balance: Tk15,400.00. TxnId: 2847192841. Date:13-SEP-26 21:30:15';
    const result = parser.parse('16216', raw);

    expect(result.status).toBe('SUCCESS');
    expect(result.provider).toBe('ROCKET');
    expect(result.type).toBe('PAYMENT_RECEIVED');
    expect(result.trxId).toBe('2847192841');
    expect(result.amountPaisa.toBDT()).toBe('1200.00');
    expect(result.counterparty).toBe('017123456789');
    expect(result.balancePaisa?.toBDT()).toBe('15400.00');
    expect(result.isSenderVerified).toBe(true);
  });

  it('parses Rocket Merchant Payment with Reference', () => {
    const raw =
      'Payment Tk2,500.00 received from A/C: 019123456781. Ref: INV-99. Fee Tk0.00. Balance: Tk22,100.00. TxnId: 4719284719. Date:13-SEP-26 18:45:10';
    const result = parser.parse('Rocket', raw);

    expect(result.status).toBe('SUCCESS');
    expect(result.type).toBe('PAYMENT_RECEIVED');
    expect(result.amountPaisa.toBDT()).toBe('2500.00');
    expect(result.reference).toBe('INV-99');
  });

  it('parses Cash In transaction', () => {
    const raw =
      'Cash In Tk3,000.00 from A/C: 016123456780. TxnId: 1827391827. Fee Tk0.00. Balance: Tk12,400.00. Date:11-SEP-26 14:20:00';
    const result = parser.parse('DBBL', raw);

    expect(result.status).toBe('SUCCESS');
    expect(result.type).toBe('CASH_IN');
    expect(result.trxId).toBe('1827391827');
    expect(result.amountPaisa.toBDT()).toBe('3000.00');
  });

  it('parses Cash Out debit with fee', () => {
    const raw =
      'Cash Out Tk1,000.00 to A/C: 017111222334. Fee Tk18.00. Balance: Tk11,382.00. TxnId: 3829102938. Date:13-SEP-26 19:10:00';
    const result = parser.parse('Rocket', raw);

    expect(result.status).toBe('SUCCESS');
    expect(result.type).toBe('CASH_OUT');
    expect(result.amountPaisa.toBDT()).toBe('1000.00');
    expect(result.feePaisa.toBDT()).toBe('18.00');
    expect(result.balancePaisa?.toBDT()).toBe('11382.00');
  });
});