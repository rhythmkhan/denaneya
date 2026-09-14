export interface TestSmsSample {
  provider: 'BKASH' | 'NAGAD' | 'ROCKET' | 'UPAY';
  sender: string;
  rawText: string;
  expectedTrxId?: string;
  expectedAmountPaisa?: bigint;
  expectedFeePaisa?: bigint;
  expectedNewBalancePaisa?: bigint;
  expectedStatus: 'SUCCESS' | 'PARSER_UNRECOGNIZED';
}

export const SMS_FIXTURES = {
  BKASH_VALID: {
    provider: 'BKASH' as const,
    sender: 'bKash',
    rawText:
      'You have received Tk 2,500.00 from 01712345678. Fee Tk 0.00. Balance Tk 15,200.00. TrxID 9K38AL90 at 13/09/2026 22:10',
    expectedTrxId: '9K38AL90',
    expectedAmountPaisa: 250000n,
    expectedFeePaisa: 0n,
    expectedNewBalancePaisa: 1520000n,
    expectedStatus: 'SUCCESS' as const,
  },
  BKASH_COMMA_FORMAT: {
    provider: 'BKASH' as const,
    sender: 'bKash',
    rawText:
      'You have received Tk 1,00,000.00 from 01712345678. Fee Tk 0.00. Balance Tk 2,15,200.00. TrxID BKASHCOMMA1 at 13/09/2026 22:10',
    expectedTrxId: 'BKASHCOMMA1',
    expectedAmountPaisa: 10000000n,
    expectedFeePaisa: 0n,
    expectedNewBalancePaisa: 21520000n,
    expectedStatus: 'SUCCESS' as const,
  },
  NAGAD_VALID: {
    provider: 'NAGAD' as const,
    sender: '16167',
    rawText:
      'Money Received. Amount: Tk 1,200.00 Sender: 01812345678 TxnID: NAG12345 Fee: Tk 0.00 Balance: Tk 8,400.00 Date: 13/09/2026 21:00',
    expectedTrxId: 'NAG12345',
    expectedAmountPaisa: 120000n,
    expectedFeePaisa: 0n,
    expectedNewBalancePaisa: 840000n,
    expectedStatus: 'SUCCESS' as const,
  },
  ROCKET_VALID: {
    provider: 'ROCKET' as const,
    sender: '16216',
    rawText:
      'Tk 500.00 received from A/C: 019123456789. Fee Tk 0.00. Balance: Tk 3,500.00. TxnId: RCK987654. Date:13-SEP-2026 20:15:00',
    expectedTrxId: 'RCK987654',
    expectedAmountPaisa: 50000n,
    expectedFeePaisa: 0n,
    expectedNewBalancePaisa: 350000n,
    expectedStatus: 'SUCCESS' as const,
  },
  UPAY_VALID: {
    provider: 'UPAY' as const,
    sender: 'upay',
    rawText:
      'Received Tk 750.00 from 01612345678. TrxID: UPY112233. Fee: Tk 0.00. Balance Tk 2,250.00. Time: 13/09/2026 19:30',
    expectedTrxId: 'UPY112233',
    expectedAmountPaisa: 75000n,
    expectedFeePaisa: 0n,
    expectedNewBalancePaisa: 225000n,
    expectedStatus: 'SUCCESS' as const,
  },
  UNRECOGNIZED_STATEMENT: {
    provider: 'BKASH' as const,
    sender: 'bKash',
    rawText: 'Your monthly statement is ready to download',
    expectedStatus: 'PARSER_UNRECOGNIZED' as const,
  },
  EMPTY_SMS: {
    provider: 'BKASH' as const,
    sender: 'bKash',
    rawText: '',
    expectedStatus: 'PARSER_UNRECOGNIZED' as const,
  },
  SPOOFED_SENDER: {
    provider: 'BKASH' as const,
    sender: '01712345678',
    rawText:
      'You have received Tk 2,500.00 from 01712345678. Balance Tk 15,200.00. TrxID 9K38AL90',
    expectedStatus: 'PARSER_UNRECOGNIZED' as const,
  },
};
