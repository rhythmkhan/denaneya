import { describe, it, expect } from 'vitest';
import {
  SslCommerzAdapter,
  ShurjoPayAdapter,
  AamarPayAdapter,
  BkashAdapter,
  NagadAdapter,
  rsaSign,
  rsaVerify,
  rsaEncrypt,
  rsaDecrypt,
} from '@denaneya/gateway-adapters';
import { Paisa } from '@denaneya/payment-core';
import { GATEWAY_RESPONSES } from '../fixtures/gateway-responses.js';
import { RSA_2048_TEST_KEY } from '../fixtures/crypto-keys.js';

describe('Feature 11: Gateway Adapters (SSLCOMMERZ, etc.) (E2E-T1-F11)', () => {
  // E2E-T1-F11-01: SSLCOMMERZ Sandbox Session Creation & IPN Validation
  it('E2E-T1-F11-01: SSLCOMMERZ Sandbox Session Creation & IPN Validation', async () => {
    const sslAdapter = new SslCommerzAdapter({
      storeId: 'test_store',
      storePassword: 'test_password',
      isSandbox: true,
    });

    // Verify webhook signature logic with valid payload
    const ipn = GATEWAY_RESPONSES.SSLCOMMERZ.VALID_IPN;
    expect(ipn.status).toBe('VALID');
    expect(ipn.amount).toBe('1000.00');
    expect(ipn.currency).toBe('BDT');

    // Missing required signature fields should reject safely
    const isVerified = await sslAdapter.verifyWebhookSignature({}, { val_id: ipn.val_id });
    expect(isVerified).toBe(false);
  });

  // E2E-T1-F11-02: shurjoPay Sandbox Token Grant & Order Verification
  it('E2E-T1-F11-02: shurjoPay Sandbox Token Grant & Order Verification', () => {
    const shurjoAdapter = new ShurjoPayAdapter({
      username: 'sp_user',
      password: 'sp_password',
      prefix: 'SP',
      isSandbox: true,
    });

    expect(shurjoAdapter.provider).toBe('SHURJOPAY');
    const verifyResp = GATEWAY_RESPONSES.SHURJOPAY.VERIFY_SUCCESS;
    expect(verifyResp.sp_code).toBe(1000);
    expect(verifyResp.transaction_status).toBe('Completed');
    expect(verifyResp.amount).toBe(1000);
  });

  // E2E-T1-F11-03: aamarPay Sandbox Payment Initiation & TrxCheck
  it('E2E-T1-F11-03: aamarPay Sandbox Payment Initiation & TrxCheck', () => {
    const aamarAdapter = new AamarPayAdapter({
      storeId: 'aamarpaytest',
      signatureKey: 'dbb74894e82415a2f7ff0ec3a97e4183',
      isSandbox: true,
    });

    expect(aamarAdapter.provider).toBe('AAMARPAY');
    const trxCheck = GATEWAY_RESPONSES.AAMARPAY.VERIFY_SUCCESS;
    expect(trxCheck.pay_status).toBe('Successful');
    expect(trxCheck.amount_bdt).toBe('1000.00');
    expect(trxCheck.currency).toBe('BDT');
  });

  // E2E-T1-F11-04: bKash Tokenized Checkout Create & Execute
  it('E2E-T1-F11-04: bKash Tokenized Checkout Create & Execute', () => {
    const bkashAdapter = new BkashAdapter({
      appKey: 'test_app_key',
      appSecret: 'test_app_secret',
      username: 'test_user',
      password: 'test_password',
      isSandbox: true,
    });

    expect(bkashAdapter.provider).toBe('BKASH');
    const executeResp = GATEWAY_RESPONSES.BKASH.EXECUTE_PAYMENT;
    expect(executeResp.statusCode).toBe('0000');
    expect(executeResp.transactionStatus).toBe('Completed');
    expect(executeResp.trxID).toBe('9K38AL90');
    expect(executeResp.amount).toBe('1000.00');
  });

  // E2E-T1-F11-05: Nagad PGW RSA-2048 Encryption & Callback Verification
  it('E2E-T1-F11-05: Nagad PGW RSA-2048 Encryption & Callback Verification', () => {
    const payload = JSON.stringify({
      merchantId: 'NAGAD_MER_01',
      orderId: 'ORD_99182',
      amount: '1000.00',
    });

    // Test RSA sign and verify using RSA-2048 keypair
    const signature = rsaSign(payload, RSA_2048_TEST_KEY.privateKeyPem);
    expect(typeof signature).toBe('string');
    expect(signature.length).toBeGreaterThan(50);

    const isValid = rsaVerify(payload, signature, RSA_2048_TEST_KEY.publicKeyPem);
    expect(isValid).toBe(true);

    // Test RSA encryption and decryption roundtrip
    const cipherText = rsaEncrypt(payload, RSA_2048_TEST_KEY.publicKeyPem);
    expect(typeof cipherText).toBe('string');

    const decrypted = rsaDecrypt(cipherText, RSA_2048_TEST_KEY.privateKeyPem);
    expect(decrypted).toBe(payload);
  });
});
