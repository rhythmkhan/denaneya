import { describe, it, expect } from 'vitest';
import { Paisa } from '@denaneya/payment-core';
import { parseMfsSms, BalanceChainEngine } from '../src/index.js';
import { parseBstDate } from '../src/utils/date.js';

describe('SMS Parser: Bengali & English Numeral Formats & Month-Boundary Balance Chains', () => {
  describe('1. Bengali and English Numeral Formats for All 4 MFS Providers', () => {
    // 1. bKash
    describe('bKash Provider Formats', () => {
      it('parses English SMS with Bengali numerals (mixed)', () => {
        const raw =
          'Payment Tk ১,২৫০.০০ received from ০১৭১২৩৪৫৬৭৮. Ref ১০২. Fee Tk ০.০০. Balance Tk ১৫,৪৫০.০০. TrxID 9K38AL90 at ১৩/০৯/২০২৬ ২২:১০';
        const parsed = parseMfsSms('bKash', raw);

        expect(parsed.provider).toBe('BKASH');
        expect(parsed.type).toBe('PAYMENT_RECEIVED');
        expect(parsed.trxId).toBe('9K38AL90');
        expect(parsed.amountPaisa.amountPaisa).toBe(125000n);
        expect(parsed.balancePaisa?.amountPaisa).toBe(1545000n);
        expect(parsed.counterparty).toBe('01712345678');
        expect(parsed.reference).toBe('102');
      });

      it('parses Bengali payment SMS with Bengali numerals', () => {
        const raw =
          'আপনি ০১৭১২৩৪৫৬৭৮ থেকে Tk ১,২৫০.০০ পেমেন্ট পেয়েছেন। রেফারেন্স ১০২। ফি Tk ০.০০। ব্যালেন্স Tk ১৫,৪৫০.০০। TrxID 9K38AL90 সময় ১৩/০৯/২০২৬ ২২:১০';
        const parsed = parseMfsSms('bKash', raw);

        expect(parsed.provider).toBe('BKASH');
        expect(parsed.type).toBe('PAYMENT_RECEIVED');
        expect(parsed.amountPaisa.toBDT()).toBe('1250.00');
        expect(parsed.balancePaisa?.toBDT()).toBe('15450.00');
        expect(parsed.counterparty).toBe('01712345678');
      });

      it('parses Bengali Cash In SMS with Bengali numerals', () => {
        const raw =
          'ক্যাশ ইন Tk ৩,০০০.০০ থেকে ০১৭১১২২৩৩৪ সফল। ফি Tk ০.০০। ব্যালেন্স Tk ১৮,৪৫০.০০। TrxID 8B9C0D1E সময় ১৩/০৯/২০২৬ ২৩:০০';
        const parsed = parseMfsSms('bKash', raw);

        expect(parsed.provider).toBe('BKASH');
        expect(parsed.type).toBe('CASH_IN');
        expect(parsed.trxId).toBe('8B9C0D1E');
        expect(parsed.amountPaisa.toBDT()).toBe('3000.00');
        expect(parsed.balancePaisa?.toBDT()).toBe('18450.00');
      });

      it('parses Bengali Cash Out SMS with non-zero fee and Bengali numerals', () => {
        const raw =
          'ক্যাশ আউট Tk ১,০০০.০০ টু ০১৭৯৯৮৮৭৭৬৬। ফি Tk ১৮.৫০। ব্যালেন্স Tk ১৭,৪৩১.৫০। TrxID 7A6B5C4D সময় ১৩/০৯/২০২৬ ২৩:৩০';
        const parsed = parseMfsSms('bKash', raw);

        expect(parsed.provider).toBe('BKASH');
        expect(parsed.type).toBe('CASH_OUT');
        expect(parsed.amountPaisa.toBDT()).toBe('1000.00');
        expect(parsed.feePaisa.toBDT()).toBe('18.50');
        expect(parsed.balancePaisa?.toBDT()).toBe('17431.50');
      });
    });

    // 2. Nagad
    describe('Nagad Provider Formats', () => {
      it('parses English SMS with Bengali numerals', () => {
        const raw =
          'Merchant Pay. Amount: Tk ১,৫০০.০০. From: ০১৭১২৩৪৫৬৭৮. Ref: Inv১০১. TxnID: 72N4A99X. Fee: Tk ০.০০. Balance: Tk ২৪,৫০০.০০. Date: ১৩/০৯/২০২৬ ২১:১৫';
        const parsed = parseMfsSms('NAGAD', raw);

        expect(parsed.provider).toBe('NAGAD');
        expect(parsed.type).toBe('PAYMENT_RECEIVED');
        expect(parsed.amountPaisa.toBDT()).toBe('1500.00');
        expect(parsed.balancePaisa?.toBDT()).toBe('24500.00');
        expect(parsed.counterparty).toBe('01712345678');
      });

      it('parses Bengali format with Bengali numerals', () => {
        const raw =
          'টাকা পেয়েছেন। পরিমাণ: Tk ২,৫০০.০০। প্রেরক: ০১৭১১২২৩৩৪৪। TxnID: 83M5B88Y। ফি: Tk ০.০০। ব্যালেন্স: Tk ২৭,০০০.০০। তারিখ: ১৩/০৯/২০২৬ ২১:৩০';
        const parsed = parseMfsSms('NAGAD', raw);

        expect(parsed.provider).toBe('NAGAD');
        expect(parsed.type).toBe('PAYMENT_RECEIVED');
        expect(parsed.trxId).toBe('83M5B88Y');
        expect(parsed.amountPaisa.toBDT()).toBe('2500.00');
        expect(parsed.balancePaisa?.toBDT()).toBe('27000.00');
      });

      it('parses Bengali Cash Out with fee and Bengali numerals', () => {
        const raw =
          'ক্যাশ আউট। পরিমাণ: Tk ৩,০০০.০০। প্রাপক: ০১৭৯৯০০১১২২। TxnID: 94K6C77Z। ফি: Tk ৪৪.৮২। ব্যালেন্স: Tk ২৩,৯৫৫.১৮। তারিখ: ১৩/০৯/২০২৬ ২২:০০';
        const parsed = parseMfsSms('NAGAD', raw);

        expect(parsed.provider).toBe('NAGAD');
        expect(parsed.type).toBe('CASH_OUT');
        expect(parsed.amountPaisa.toBDT()).toBe('3000.00');
        expect(parsed.feePaisa.toBDT()).toBe('44.82');
        expect(parsed.balancePaisa?.toBDT()).toBe('23955.18');
      });

      it('parses Bengali Cash In format', () => {
        const raw =
          'ক্যাশ ইন। পরিমাণ: Tk ৪,০০০.০০। উদ্যোক্তা: ০১৬১২৩৪৫৬৭৮। TxnID: 61H2W33Q। ফি: Tk ০.০০। ব্যালেন্স: Tk ২৭,৯৫৫.১৮। তারিখ: ১৩/০৯/২০২৬ ২২:১৫';
        const parsed = parseMfsSms('NAGAD', raw);

        expect(parsed.provider).toBe('NAGAD');
        expect(parsed.type).toBe('CASH_IN');
        expect(parsed.amountPaisa.toBDT()).toBe('4000.00');
        expect(parsed.balancePaisa?.toBDT()).toBe('27955.18');
      });
    });

    // 3. Rocket
    describe('Rocket Provider Formats', () => {
      it('parses English Rocket SMS with Bengali numerals and 12-digit account', () => {
        const raw =
          'Tk ১,২০০.০০ received from A/C: ০১৭১২৩৪৫৬৭৮৯. Fee Tk০.০০. Balance: Tk ১৫,৪০০.০০. TxnId: 2847192841. Date: 13-SEP-26 21:30:15';
        const parsed = parseMfsSms('16216', raw);

        expect(parsed.provider).toBe('ROCKET');
        expect(parsed.type).toBe('PAYMENT_RECEIVED');
        expect(parsed.trxId).toBe('2847192841');
        expect(parsed.amountPaisa.toBDT()).toBe('1200.00');
        expect(parsed.balancePaisa?.toBDT()).toBe('15400.00');
        expect(parsed.counterparty).toBe('017123456789');
      });

      it('parses Bengali Rocket SMS with Bengali month name and numerals', () => {
        const raw =
          'A/C: ০১৭১২৩৪৫৬৭৮৯ থেকে Tk ১,২০০.০০ পেয়েছেন। ফি Tk ০.০০। ব্যালেন্স: Tk ১৫,৪০০.০০। TxnId: 2847192841। তারিখ: ১৩-সেপ্টেম্বর-২৬ ২১:৩০:১৫';
        const parsed = parseMfsSms('Rocket', raw);

        expect(parsed.provider).toBe('ROCKET');
        expect(parsed.type).toBe('PAYMENT_RECEIVED');
        expect(parsed.trxId).toBe('2847192841');
        expect(parsed.amountPaisa.toBDT()).toBe('1200.00');
        expect(parsed.balancePaisa?.toBDT()).toBe('15400.00');
        expect(parsed.timestamp.getMonth()).toBe(8); // September (0-indexed = 8)
      });

      it('parses Bengali Rocket Cash Out SMS with fee', () => {
        const raw =
          'A/C: ০১৭১১১২২২৩৩৪ এ ক্যাশ আউট Tk ১,০০০.০০। ফি Tk ১৮.০০। ব্যালেন্স: Tk ১৪,৩৮২.০০। TxnId: 3829102938। তারিখ: ১৩-SEP-২৬ ১৯:১০:০০';
        const parsed = parseMfsSms('Rocket', raw);

        expect(parsed.provider).toBe('ROCKET');
        expect(parsed.type).toBe('CASH_OUT');
        expect(parsed.amountPaisa.toBDT()).toBe('1000.00');
        expect(parsed.feePaisa.toBDT()).toBe('18.00');
        expect(parsed.balancePaisa?.toBDT()).toBe('14382.00');
      });

      it('parses Bengali Rocket Cash In SMS', () => {
        const raw =
          'A/C: ০১৬১২৩৪৫৬৭৮০ থেকে ক্যাশ ইন Tk ২,০০০.০০। TxnId: 1827391827। ফি Tk ০.০০। ব্যালেন্স: Tk ১৬,৩৮২.০০। তারিখ: ১৩-SEP-২৬ ১৯:২০:০০';
        const parsed = parseMfsSms('DBBL', raw);

        expect(parsed.provider).toBe('ROCKET');
        expect(parsed.type).toBe('CASH_IN');
        expect(parsed.trxId).toBe('1827391827');
        expect(parsed.amountPaisa.toBDT()).toBe('2000.00');
        expect(parsed.balancePaisa?.toBDT()).toBe('16382.00');
      });
    });

    // 4. Upay
    describe('Upay Provider Formats', () => {
      it('parses English Upay SMS with Bengali numerals', () => {
        const raw =
          'Received Tk ১,০০০.০০ from ০১৭১২৩৪৫৬৭৮. TrxID: UP729401. Fee: Tk ০.০০. Balance: Tk ১৪,২০০.০০. Time: ১৩/০৯/২০২৬ ২০:০৫';
        const parsed = parseMfsSms('16268', raw);

        expect(parsed.provider).toBe('UPAY');
        expect(parsed.type).toBe('PAYMENT_RECEIVED');
        expect(parsed.trxId).toBe('UP729401');
        expect(parsed.amountPaisa.toBDT()).toBe('1000.00');
        expect(parsed.balancePaisa?.toBDT()).toBe('14200.00');
        expect(parsed.counterparty).toBe('01712345678');
      });

      it('parses Bengali Upay Payment SMS with Bengali numerals', () => {
        const raw =
          '০১৭১২৩৪৫৬৭৮ থেকে Tk ১,০০০.০০ পেয়েছেন। TrxID: UP729401। ফি: Tk ০.০০। ব্যালেন্স: Tk ১৪,২০০.০০। সময়: ১৩/০৯/২০২৬ ২০:০৫';
        const parsed = parseMfsSms('upay', raw);

        expect(parsed.provider).toBe('UPAY');
        expect(parsed.type).toBe('PAYMENT_RECEIVED');
        expect(parsed.trxId).toBe('UP729401');
        expect(parsed.amountPaisa.toBDT()).toBe('1000.00');
        expect(parsed.balancePaisa?.toBDT()).toBe('14200.00');
        expect(parsed.counterparty).toBe('01712345678');
      });

      it('parses Bengali Upay Cash In SMS', () => {
        const raw =
          '০১৯১২৩৪৫৬৭৮ থেকে ক্যাশ ইন Tk ২,০০০.০০। TrxID: UP102938। Fee: Tk ০.০০। Balance: Tk ১৬,২০০.০০। Time: ১৩/০৯/২০২৬ ২০:১০';
        const parsed = parseMfsSms('Upay', raw);

        expect(parsed.provider).toBe('UPAY');
        expect(parsed.type).toBe('CASH_IN');
        expect(parsed.amountPaisa.toBDT()).toBe('2000.00');
        expect(parsed.balancePaisa?.toBDT()).toBe('16200.00');
      });

      it('parses Bengali Upay Cash Out SMS with fee', () => {
        const raw =
          '০১৬১২৩৪৫৬৭৮ এ ক্যাশ আউট Tk ৫০০.০০। TrxID: UP992811। Fee: Tk ৭.০০। Balance: Tk ১৫,৬৯৩.০০। Time: ১৩/০৯/২০২৬ ২০:১৫';
        const parsed = parseMfsSms('16268', raw);

        expect(parsed.provider).toBe('UPAY');
        expect(parsed.type).toBe('CASH_OUT');
        expect(parsed.amountPaisa.toBDT()).toBe('500.00');
        expect(parsed.feePaisa.toBDT()).toBe('7.00');
        expect(parsed.balancePaisa?.toBDT()).toBe('15693.00');
      });
    });
  });

  describe('2. Month-Boundary Balance Chains Without Precision Loss', () => {
    const walletId = 'MFS:WALLET_001';

    it('verifies balance chain transitions across month end (31-Aug 23:59:50 -> 01-Sep 00:00:10)', () => {
      // 1. Transaction on August 31, 23:59:00
      const sms1 = parseMfsSms(
        'bKash',
        'Payment Tk 5,000.00 received from 01700111111. Fee Tk 0.00. Balance Tk 50,000.00. TrxID TXN_AUG_END at 31/08/2026 23:59'
      );
      const res1 = BalanceChainEngine.verify({
        walletId,
        incomingSms: sms1,
        previousBalancePaisa: Paisa.fromBDT('45000.00'),
      });
      expect(res1.status).toBe('VERIFIED');
      expect(res1.reportedBalancePaisa?.toBDT()).toBe('50000.00');

      // 2. Transaction across the boundary on September 1, 00:01:00
      const sms2 = parseMfsSms(
        'bKash',
        'Payment Tk 2,500.00 received from 01700222222. Fee Tk 0.00. Balance Tk 52,500.00. TrxID TXN_SEP_START at 01/09/2026 00:01'
      );
      const res2 = BalanceChainEngine.verify({
        walletId,
        incomingSms: sms2,
        previousBalancePaisa: res1.reportedBalancePaisa,
      });
      expect(res2.status).toBe('VERIFIED');
      expect(res2.isDiscontinuity).toBe(false);
      expect(res2.reportedBalancePaisa?.toBDT()).toBe('52500.00');

      // 3. Debit transaction on September 1, 00:05:00
      const sms3 = parseMfsSms(
        'bKash',
        'Cash Out Tk 2,000.00 to 01700333333. Fee Tk 37.00. Balance Tk 50,463.00. TrxID TXN_SEP_DEBIT at 01/09/2026 00:05'
      );
      const res3 = BalanceChainEngine.verify({
        walletId,
        incomingSms: sms3,
        previousBalancePaisa: res2.reportedBalancePaisa,
      });
      expect(res3.status).toBe('VERIFIED');
      expect(res3.reportedBalancePaisa?.toBDT()).toBe('50463.00');
    });

    it('verifies balance chain transitions across leap year boundary (28-Feb -> 29-Feb -> 01-Mar)', () => {
      // 28-Feb 2028 (leap year)
      const smsFeb28 = parseMfsSms(
        'bKash',
        'Payment Tk 1,000.00 received from 01700111111. Fee Tk 0.00. Balance Tk 21,000.00. TrxID LEAP_01 at 28/02/2028 23:55'
      );
      const resFeb28 = BalanceChainEngine.verify({
        walletId,
        incomingSms: smsFeb28,
        previousBalancePaisa: Paisa.fromBDT('20000.00'),
      });
      expect(resFeb28.status).toBe('VERIFIED');

      // 29-Feb 2028
      const smsFeb29 = parseMfsSms(
        'bKash',
        'Payment Tk 3,000.00 received from 01700222222. Fee Tk 0.00. Balance Tk 24,000.00. TrxID LEAP_02 at 29/02/2028 12:00'
      );
      const resFeb29 = BalanceChainEngine.verify({
        walletId,
        incomingSms: smsFeb29,
        previousBalancePaisa: resFeb28.reportedBalancePaisa,
      });
      expect(resFeb29.status).toBe('VERIFIED');

      // 01-Mar 2028
      const smsMar01 = parseMfsSms(
        'bKash',
        'Cash Out Tk 4,000.00 to 01700333333. Fee Tk 74.00. Balance Tk 19,926.00. TrxID LEAP_03 at 01/03/2028 00:05'
      );
      const resMar01 = BalanceChainEngine.verify({
        walletId,
        incomingSms: smsMar01,
        previousBalancePaisa: resFeb29.reportedBalancePaisa,
      });
      expect(resMar01.status).toBe('VERIFIED');
      expect(resMar01.reportedBalancePaisa?.toBDT()).toBe('19926.00');
    });

    it('verifies balance chain transitions across year end boundary (31-Dec 23:59 -> 01-Jan 00:01)', () => {
      const smsDec31 = parseMfsSms(
        'Rocket',
        'Tk 5,000.00 received from A/C: 017123456789. Fee Tk0.00. Balance: Tk 105,000.00. TxnId: YR_END_01. Date:31-DEC-26 23:59:00'
      );
      const resDec31 = BalanceChainEngine.verify({
        walletId,
        incomingSms: smsDec31,
        previousBalancePaisa: Paisa.fromBDT('100000.00'),
      });
      expect(resDec31.status).toBe('VERIFIED');

      const smsJan01 = parseMfsSms(
        'Rocket',
        'Tk 2,500.00 received from A/C: 017123456789. Fee Tk0.00. Balance: Tk 107,500.00. TxnId: YR_START_01. Date:01-JAN-27 00:02:00'
      );
      const resJan01 = BalanceChainEngine.verify({
        walletId,
        incomingSms: smsJan01,
        previousBalancePaisa: resDec31.reportedBalancePaisa,
      });
      expect(resJan01.status).toBe('VERIFIED');
      expect(resJan01.reportedBalancePaisa?.toBDT()).toBe('107500.00');
    });

    it('reconciles out-of-order SMS delivered across month boundaries using history window without precision loss', () => {
      // History:
      // TXN_1 on 31-Aug 23:50 (Balance: 20,000.00)
      // TXN_3 on 01-Sep 00:05 (Balance: 25,000.00)
      const tx1 = parseMfsSms(
        'bKash',
        'Payment Tk 2,000.00 received from 01700111111. Fee Tk 0.00. Balance Tk 20,000.00. TrxID TXN_AUG_1 at 31/08/2026 23:50'
      );
      const tx3 = parseMfsSms(
        'bKash',
        'Payment Tk 1,500.00 received from 01700333333. Fee Tk 0.00. Balance Tk 24,500.00. TrxID TXN_SEP_3 at 01/09/2026 00:05'
      );

      // Delayed TXN_2 on 31-Aug 23:59:30 (+3,000 BDT) arrives after TXN_3 was processed
      const tx2 = parseMfsSms(
        'bKash',
        'Payment Tk 3,000.00 received from 01700222222. Fee Tk 0.00. Balance Tk 23,000.00. TrxID TXN_AUG_2 at 31/08/2026 23:59'
      );

      const result = BalanceChainEngine.verify({
        walletId,
        incomingSms: tx2,
        previousBalancePaisa: tx3.balancePaisa,
        history: [tx1, tx3],
      });

      expect(result.status).toBe('VERIFIED');
      expect(result.resolvedOutOfOrder).toBe(true);
      expect(result.isDiscontinuity).toBe(false);
      expect(result.reportedBalancePaisa?.toBDT()).toBe('23000.00');
    });

    it('reconciles late-arriving month-end SMS that precedes the new month history window', () => {
      // History window only starts on 01-Sep:
      // TXN_SEP_1 on 01-Sep 00:05 (amount 1,000, balance 51,000)
      const txSep1 = parseMfsSms(
        'bKash',
        'Payment Tk 1,000.00 received from 01700111111. Fee Tk 0.00. Balance Tk 51,000.00. TrxID TXN_SEP_1 at 01/09/2026 00:05'
      );

      // Late-arriving SMS from 31-Aug 23:58 (balance 50,000)
      const txAugEnd = parseMfsSms(
        'bKash',
        'Payment Tk 5,000.00 received from 01700222222. Fee Tk 0.00. Balance Tk 50,000.00. TrxID TXN_AUG_LATE at 31/08/2026 23:58'
      );

      const result = BalanceChainEngine.verify({
        walletId,
        incomingSms: txAugEnd,
        previousBalancePaisa: null,
        history: [txSep1],
      });

      expect(result.status).toBe('VERIFIED');
      expect(result.resolvedOutOfOrder).toBe(true);
      expect(result.reportedBalancePaisa?.toBDT()).toBe('50000.00');
    });

    it('maintains absolute precision with zero float arithmetic across high volume and large Paisa balances', () => {
      // Large balance: 50,000,000.75 BDT = 5,000,000,075n paisa
      const initialBalance = Paisa.fromBDT('50000000.75');
      expect(initialBalance.amountPaisa).toBe(5000000075n);

      const creditSms = parseMfsSms(
        'bKash',
        'Payment Tk 12,345,678.25 received from 01700112233. Fee Tk 0.00. Balance Tk 62,345,679.00. TrxID TXN_BIG_01 at 31/08/2026 23:59'
      );

      const creditResult = BalanceChainEngine.verify({
        walletId,
        incomingSms: creditSms,
        previousBalancePaisa: initialBalance,
      });

      expect(creditResult.status).toBe('VERIFIED');
      expect(creditResult.reportedBalancePaisa?.amountPaisa).toBe(6234567900n);
      expect(creditResult.deltaPaisa?.amountPaisa).toBe(0n);

      // Debit: -10,000,000.00, Fee 185,000.00 -> New Balance 52,160,679.00
      const debitSms = parseMfsSms(
        'bKash',
        'Cash Out Tk 10,000,000.00 to 01799887766. Fee Tk 185,000.00. Balance Tk 52,160,679.00. TrxID TXN_BIG_02 at 01/09/2026 00:01'
      );

      const debitResult = BalanceChainEngine.verify({
        walletId,
        incomingSms: debitSms,
        previousBalancePaisa: creditResult.reportedBalancePaisa,
      });

      expect(debitResult.status).toBe('VERIFIED');
      expect(debitResult.reportedBalancePaisa?.amountPaisa).toBe(5216067900n);
      expect(debitResult.reportedBalancePaisa?.toBDT()).toBe('52160679.00');
    });

    it('correctly parses dates with 12-hour AM/PM and Bengali meridiem without swapping day/month', () => {
      // 05/09/2026 10:30 PM should be 5th September 22:30 BST (16:30 UTC)
      const d1 = parseBstDate('05/09/2026 10:30 PM');
      expect(d1.getUTCFullYear()).toBe(2026);
      expect(d1.getUTCMonth()).toBe(8); // September (0-indexed)
      expect(d1.getUTCDate()).toBe(5);
      expect(d1.getUTCHours()).toBe(16); // 22 - 6 = 16
      expect(d1.getUTCMinutes()).toBe(30);

      // Rocket alpha format with PM
      const d2 = parseBstDate('13-SEP-26 10:20:30 PM');
      expect(d2.getUTCFullYear()).toBe(2026);
      expect(d2.getUTCMonth()).toBe(8);
      expect(d2.getUTCDate()).toBe(13);
      expect(d2.getUTCHours()).toBe(16);
      expect(d2.getUTCMinutes()).toBe(20);
      expect(d2.getUTCSeconds()).toBe(30);

      // Bengali numerals with morning (সকাল)
      const d3 = parseBstDate('০৫/০৯/২০২৬ সকাল ১০:১৫');
      expect(d3.getUTCFullYear()).toBe(2026);
      expect(d3.getUTCMonth()).toBe(8);
      expect(d3.getUTCDate()).toBe(5);
      expect(d3.getUTCHours()).toBe(4); // 10 - 6 = 4 UTC
      expect(d3.getUTCMinutes()).toBe(15);
    });

    it('reconciles out-of-order SMS when timestamp is identical to existing transaction and precedes it', () => {
      // Both transactions have identical timestamp 12:00:00 on 31-Aug-2026
      // Tx1 occurred first: Cash In 2,000 -> balance becomes 12,000
      // Tx2 occurred second: Cash In 3,000 -> balance becomes 15,000
      // Tx3 occurred later at 12:05:00: Cash In 5,000 -> balance becomes 20,000
      const tx1 = parseMfsSms(
        'bKash',
        'Payment Tk 2,000.00 received from 01700111111. Fee Tk 0.00. Balance Tk 12,000.00. TrxID TXN_SAME_TIME_1 at 31/08/2026 12:00'
      );
      const tx2 = parseMfsSms(
        'bKash',
        'Payment Tk 3,000.00 received from 01700222222. Fee Tk 0.00. Balance Tk 15,000.00. TrxID TXN_SAME_TIME_2 at 31/08/2026 12:00'
      );
      const tx3 = parseMfsSms(
        'bKash',
        'Payment Tk 5,000.00 received from 01700333333. Fee Tk 0.00. Balance Tk 20,000.00. TrxID TXN_SAME_TIME_3 at 31/08/2026 12:05'
      );

      // Suppose tx2 and tx3 are already processed in history, and tx1 arrives out-of-order
      const result = BalanceChainEngine.verify({
        walletId: 'wallet_same_time',
        incomingSms: tx1,
        previousBalancePaisa: tx3.balancePaisa,
        history: [tx2, tx3],
      });

      expect(result.status).toBe('VERIFIED');
      expect(result.resolvedOutOfOrder).toBe(true);
      expect(result.isDiscontinuity).toBe(false);
      expect(result.reportedBalancePaisa?.toBDT()).toBe('12000.00');
    });

    it('detects discontinuity for UNKNOWN transaction type and does not assume credit', () => {
      const unknownSms = {
        ...parseMfsSms(
          'bKash',
          'Payment Tk 1,000.00 received from 01700111111. Fee Tk 0.00. Balance Tk 11,000.00. TrxID TXN_UNK_1 at 31/08/2026 12:00'
        ),
        type: 'UNKNOWN' as const,
      };

      const result = BalanceChainEngine.verify({
        walletId: 'wallet_unk',
        incomingSms: unknownSms,
        previousBalancePaisa: Paisa.fromBDT('10000.00'),
      });

      expect(result.status).toBe('DISCONTINUITY_DETECTED');
      expect(result.discontinuityType).toBe('TAMPERING');
      expect(result.isDiscontinuity).toBe(true);
    });
  });
});
