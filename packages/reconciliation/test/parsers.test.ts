import { describe, it, expect } from 'vitest';
import {
  SSLCommerzStatementParser,
  BKashStatementParser,
  NagadStatementParser,
  getStatementParser,
  parseCsvRows,
  parseCsvToObjects,
} from '../src/parsers/index.js';
import { StatementParsingError } from '../src/errors.js';

describe('Zero-Float CSV Helper', () => {
  it('parses standard comma-separated values', () => {
    const csv = 'col1,col2,col3\nval1,val2,val3\nval4,val5,val6';
    const rows = parseCsvRows(csv);
    expect(rows).toEqual([
      ['col1', 'col2', 'col3'],
      ['val1', 'val2', 'val3'],
      ['val4', 'val5', 'val6'],
    ]);
  });

  it('handles quotes containing commas and spaces', () => {
    const csv = 'id,amount,description\n1,"1,500.50","Payment for goods, Dhaka"\n2,"500.00","Simple"';
    const rows = parseCsvRows(csv);
    expect(rows).toHaveLength(3);
    expect(rows[1]![1]).toBe('1,500.50');
    expect(rows[1]![2]).toBe('Payment for goods, Dhaka');
  });

  it('handles CRLF line breaks and trailing newlines', () => {
    const csv = 'h1,h2\r\nv1,v2\r\nv3,v4\r\n';
    const objects = parseCsvToObjects(csv);
    expect(objects).toHaveLength(2);
    expect(objects[0]).toEqual({ h1: 'v1', h2: 'v2' });
    expect(objects[1]).toEqual({ h1: 'v3', h2: 'v4' });
  });
});

describe('SSLCOMMERZ Settlement Parser', () => {
  const parser = new SSLCommerzStatementParser();

  it('parses standard daily CSV settlement export with exact paisa conversion', async () => {
    const csv = `tran_id,val_id,bank_tran_id,tran_date,amount,store_amount,bank_gw,card_type,currency,status
pay_ssl_01,VAL_9901,BANK_01,2026-09-13 10:00:00,1500.50,1470.50,BRAC,VISA,BDT,VALID
pay_ssl_02,VAL_9902,BANK_02,2026-09-13 10:05:00,500.00,490.00,CITY,MASTER,BDT,FAILED
pay_ssl_03,VAL_9903,BANK_03,2026-09-13 10:10:00,10000.75,9800.75,DBBL,NEXUS,BDT,VALID`;

    const batch = await parser.parse(csv, 'SSL-20260913-01');

    expect(batch.provider).toBe('SSLCOMMERZ');
    expect(batch.batchReference).toBe('SSL-20260913-01');
    expect(batch.items).toHaveLength(3);

    // Item 1: 1,500.50 BDT -> 150050 paisa, 30.00 fee -> 3000 paisa
    const item1 = batch.items[0]!;
    expect(item1.provider).toBe('SSLCOMMERZ');
    expect(item1.merchantTxId).toBe('pay_ssl_01');
    expect(item1.providerTrxId).toBe('VAL_9901');
    expect(item1.amountPaisa).toBe(150050n);
    expect(item1.netAmountPaisa).toBe(147050n);
    expect(item1.feePaisa).toBe(3000n);
    expect(item1.providerStatus).toBe('COMPLETED');
    expect(item1.currency).toBe('BDT');

    // Item 2: Failed
    const item2 = batch.items[1]!;
    expect(item2.amountPaisa).toBe(50000n);
    expect(item2.feePaisa).toBe(1000n);
    expect(item2.providerStatus).toBe('FAILED');

    // Item 3: 10,000.75 BDT
    const item3 = batch.items[2]!;
    expect(item3.amountPaisa).toBe(1000075n);
    expect(item3.netAmountPaisa).toBe(980075n);
    expect(item3.feePaisa).toBe(20000n);

    // Batch totals: 150050 + 50000 + 1000075 = 1200125 paisa
    expect(batch.totalGrossPaisa).toBe(1200125n);
    expect(batch.totalFeePaisa).toBe(24000n);
    expect(batch.totalNetPaisa).toBe(1176125n);
    expect(batch.totalGrossPaisa).toBe(batch.totalNetPaisa + batch.totalFeePaisa);
    expect(batch.fileHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('parses JSON settlement statement', async () => {
    const json = JSON.stringify([
      {
        tran_id: 'pay_json_01',
        val_id: 'VAL_JSON_01',
        amount: '2500.00',
        store_amount: '2450.00',
        status: 'VALID',
        tran_date: '2026-09-13T10:00:00Z',
      },
    ]);

    const batch = await parser.parse(json);
    expect(batch.items).toHaveLength(1);
    expect(batch.items[0]!.amountPaisa).toBe(250000n);
    expect(batch.items[0]!.feePaisa).toBe(5000n);
    expect(batch.items[0]!.providerStatus).toBe('COMPLETED');
  });

  it('rejects empty content', async () => {
    await expect(parser.parse('')).rejects.toThrow(StatementParsingError);
  });
});

describe('bKash Settlement Parser', () => {
  const parser = new BKashStatementParser();

  it('parses bKash merchant transaction logs with exact paisa fee subtraction', async () => {
    const csv = `trxID,initiationTime,completedTime,customerMsisdn,transactionType,amount,fee,merchantInvoiceNumber,trxStatus
BK_TRX_01,2026-09-13 12:00:00,2026-09-13 12:01:00,01700000000,MerchantPayment,2500.00,46.25,pay_bk_01,Completed
BK_TRX_02,2026-09-13 12:10:00,2026-09-13 12:11:00,01800000000,MerchantPayment,100.25,1.85,pay_bk_02,Failed
BK_TRX_03,2026-09-13 12:20:00,2026-09-13 12:21:00,01900000000,MerchantPayment,15000.00,277.50,pay_bk_03,Completed`;

    const batch = await parser.parse(csv, 'BKASH-20260913');

    expect(batch.provider).toBe('BKASH');
    expect(batch.items).toHaveLength(3);

    const item1 = batch.items[0]!;
    expect(item1.provider).toBe('BKASH');
    expect(item1.providerTrxId).toBe('BK_TRX_01');
    expect(item1.merchantTxId).toBe('pay_bk_01');
    expect(item1.amountPaisa).toBe(250000n);
    expect(item1.feePaisa).toBe(4625n);
    expect(item1.netAmountPaisa).toBe(245375n);
    expect(item1.providerStatus).toBe('COMPLETED');

    const item2 = batch.items[1]!;
    expect(item2.amountPaisa).toBe(10025n);
    expect(item2.feePaisa).toBe(185n);
    expect(item2.netAmountPaisa).toBe(9840n);
    expect(item2.providerStatus).toBe('FAILED');

    expect(batch.totalGrossPaisa).toBe(250000n + 10025n + 1500000n);
    expect(batch.totalFeePaisa).toBe(4625n + 185n + 27750n);
    expect(batch.totalNetPaisa).toBe(batch.totalGrossPaisa - batch.totalFeePaisa);
  });

  it('supports factory resolution', () => {
    const resolved = getStatementParser('BKASH');
    expect(resolved.provider).toBe('BKASH');
  });
});

describe('Nagad Settlement Parser', () => {
  const parser = new NagadStatementParser();

  it('parses Nagad PGW settlement reports with orderId and paymentRefId', async () => {
    const csv = `orderId,paymentRefId,amount,charge,customerMobile,dateTime,status
pay_ng_01,NG_REF_01,3000.00,45.00,01600000000,2026-09-13 14:00:00,SUCCESS
pay_ng_02,NG_REF_02,750.50,11.25,01500000000,2026-09-13 14:15:00,CANCELLED
pay_ng_03,NG_REF_03,50.00,0.75,01300000000,2026-09-13 14:30:00,SUCCESS`;

    const batch = await parser.parse(csv);

    expect(batch.provider).toBe('NAGAD');
    expect(batch.items).toHaveLength(3);

    const item1 = batch.items[0]!;
    expect(item1.provider).toBe('NAGAD');
    expect(item1.merchantTxId).toBe('pay_ng_01');
    expect(item1.providerTrxId).toBe('NG_REF_01');
    expect(item1.amountPaisa).toBe(300000n);
    expect(item1.feePaisa).toBe(4500n);
    expect(item1.netAmountPaisa).toBe(295500n);
    expect(item1.providerStatus).toBe('COMPLETED');

    const item2 = batch.items[1]!;
    expect(item2.providerStatus).toBe('CANCELLED');

    expect(batch.totalGrossPaisa).toBe(300000n + 75050n + 5000n);
    expect(batch.totalFeePaisa).toBe(4500n + 1125n + 75n);
    expect(batch.totalNetPaisa).toBe(batch.totalGrossPaisa - batch.totalFeePaisa);
  });
});
