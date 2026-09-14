import { describe, it, expect } from 'vitest';
import { parseMfsSms } from '@denaneya/sms-parser';
import { SMS_FIXTURES } from '../fixtures/sms-messages.js';

describe('Feature 12: Versioned SMS Parser Engine (E2E-T1-F12)', () => {
  // E2E-T1-F12-01: bKash Cash In / Payment Received Regex Parsing
  it('E2E-T1-F12-01: bKash Cash In / Payment Received Regex Parsing', () => {
    const fixture = SMS_FIXTURES.BKASH_VALID;
    const result = parseMfsSms(fixture.sender, fixture.rawText);

    expect(result.status).toBe('SUCCESS');
    expect(result.provider).toBe('BKASH');
    expect(result.trxId).toBe('9K38AL90');
    expect(result.amountPaisa.amountPaisa).toBe(250000n);
    expect(result.feePaisa.amountPaisa).toBe(0n);
    expect(result.balancePaisa?.amountPaisa).toBe(1520000n);
  });

  // E2E-T1-F12-02: Nagad Money Received Regex Parsing
  it('E2E-T1-F12-02: Nagad Money Received Regex Parsing', () => {
    const fixture = SMS_FIXTURES.NAGAD_VALID;
    const result = parseMfsSms(fixture.sender, fixture.rawText);

    expect(result.status).toBe('SUCCESS');
    expect(result.provider).toBe('NAGAD');
    expect(result.trxId).toBe('NAG12345');
    expect(result.amountPaisa.amountPaisa).toBe(120000n);
    expect(result.balancePaisa?.amountPaisa).toBe(840000n);
  });

  // E2E-T1-F12-03: Rocket Money Received Regex Parsing
  it('E2E-T1-F12-03: Rocket Money Received Regex Parsing', () => {
    const fixture = SMS_FIXTURES.ROCKET_VALID;
    const result = parseMfsSms(fixture.sender, fixture.rawText);

    expect(result.status).toBe('SUCCESS');
    expect(result.provider).toBe('ROCKET');
    expect(result.trxId).toBe('RCK987654');
    expect(result.amountPaisa.amountPaisa).toBe(50000n);
  });

  // E2E-T1-F12-04: Upay Received Money Regex Parsing
  it('E2E-T1-F12-04: Upay Received Money Regex Parsing', () => {
    const fixture = SMS_FIXTURES.UPAY_VALID;
    const result = parseMfsSms(fixture.sender, fixture.rawText);

    expect(result.status).toBe('SUCCESS');
    expect(result.provider).toBe('UPAY');
    expect(result.trxId).toBe('UPY112233');
    expect(result.amountPaisa.amountPaisa).toBe(75000n);
  });

  // E2E-T1-F12-05: Graceful Handling of Unrecognized SMS (PARSER_UNRECOGNIZED)
  it('E2E-T1-F12-05: Graceful Handling of Unrecognized SMS (PARSER_UNRECOGNIZED)', () => {
    const fixture = SMS_FIXTURES.UNRECOGNIZED_STATEMENT;
    const result = parseMfsSms(fixture.sender, fixture.rawText);

    expect(result.status).toBe('PARSER_UNRECOGNIZED');
    expect(result.trxId).toBe('');
    expect(result.rawSms).toBe(fixture.rawText);
    expect(result.confidence).toBe(0.0);
  });
});
