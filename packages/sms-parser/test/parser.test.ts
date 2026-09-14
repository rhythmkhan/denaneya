import { describe, it, expect } from 'vitest';
import { parseMfsSms, defaultSmsParser } from '../src/parser.js';
import { sanitizeSmsText, normalizeBengaliNumerals } from '../src/utils/bengali.js';

describe('SmsParserFacade & Normalization Utilities', () => {
  it('normalizes Bengali numerals and punctuation accurately', () => {
    const rawBengali = 'টাকা: ১২৩৪৫৬৭৮৯০।';
    const normalizedDigits = normalizeBengaliNumerals(rawBengali);
    expect(normalizedDigits).toBe('টাকা: 1234567890।');

    const sanitized = sanitizeSmsText(rawBengali);
    expect(sanitized).toBe('টাকা: 1234567890.');
  });

  it('auto-detects provider based on sender mask or message content', () => {
    // By sender mask
    expect(defaultSmsParser.detectProvider('16247', 'Payment notification')).toBe('BKASH');
    expect(defaultSmsParser.detectProvider('16167', 'Payment notification')).toBe('NAGAD');
    expect(defaultSmsParser.detectProvider('16216', 'Payment notification')).toBe('ROCKET');
    expect(defaultSmsParser.detectProvider('16268', 'Payment notification')).toBe('UPAY');

    // By content when sender is generic
    expect(defaultSmsParser.detectProvider('SMS', 'Payment Tk 500 received...')).toBe('BKASH');
    expect(defaultSmsParser.detectProvider('SMS', 'Merchant Pay. Amount: Tk 500...')).toBe('NAGAD');
    expect(defaultSmsParser.detectProvider('SMS', 'Tk500 received from A/C: 017...')).toBe('ROCKET');
    expect(defaultSmsParser.detectProvider('SMS', 'Received Tk 500 from 017... TrxID: UP123 Time: 12/09/2026')).toBe('UPAY');
  });

  it('handles unrecognized SMS gracefully without throwing', () => {
    const junkSms = 'Dear customer, get 50% bonus on your next internet recharge!';
    const result = parseMfsSms('AIRTEL', junkSms);

    expect(result.status).toBe('PARSER_UNRECOGNIZED');
    expect(result.amountPaisa.isZero()).toBe(true);
    expect(result.trxId).toBe('');
    expect(result.confidence).toBe(0.0);
    expect(result.smsHash).toHaveLength(64);
    expect(result.isSenderVerified).toBe(false);
  });

  it('generates consistent SHA-256 deduplication hashes for duplicate prevention', () => {
    const text =
      'Payment Tk 1,000.00 received from 01712345678. Fee Tk 0.00. Balance Tk 10,000.00. TrxID TXN_DUP_01 at 13/09/2026 22:00';
    const result1 = parseMfsSms('bKash', text);
    const result2 = parseMfsSms('bKash', text);

    expect(result1.smsHash).toBe(result2.smsHash);
    expect(result1.smsHash).toHaveLength(64);
  });
});