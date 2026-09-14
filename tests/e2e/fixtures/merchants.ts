import { TEST_CONSTANTS } from '../config/test-constants.js';

export interface TestMerchant {
  id: string;
  name: string;
  businessName: string;
  email: string;
  status: 'ACTIVE' | 'PENDING_KYC' | 'SUSPENDED' | 'TERMINATED';
  environment: 'SANDBOX' | 'PRODUCTION';
  feeRateBps: number;
  fixedFeePaisa: bigint;
  defaultCurrency: 'BDT';
  webhookSecret: string;
  createdAt: Date;
}

export const MERCHANT_A: TestMerchant = {
  id: TEST_CONSTANTS.MERCHANT_A.ID,
  name: TEST_CONSTANTS.MERCHANT_A.NAME,
  businessName: TEST_CONSTANTS.MERCHANT_A.BUSINESS_NAME,
  email: TEST_CONSTANTS.MERCHANT_A.EMAIL,
  status: 'ACTIVE',
  environment: 'PRODUCTION',
  feeRateBps: TEST_CONSTANTS.MERCHANT_A.FEE_RATE_BPS,
  fixedFeePaisa: TEST_CONSTANTS.MERCHANT_A.FIXED_FEE_PAISA,
  defaultCurrency: 'BDT',
  webhookSecret: TEST_CONSTANTS.MERCHANT_A.WEBHOOK_SECRET,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

export const MERCHANT_B: TestMerchant = {
  id: TEST_CONSTANTS.MERCHANT_B.ID,
  name: TEST_CONSTANTS.MERCHANT_B.NAME,
  businessName: TEST_CONSTANTS.MERCHANT_B.BUSINESS_NAME,
  email: TEST_CONSTANTS.MERCHANT_B.EMAIL,
  status: 'ACTIVE',
  environment: 'SANDBOX',
  feeRateBps: TEST_CONSTANTS.MERCHANT_B.FEE_RATE_BPS,
  fixedFeePaisa: TEST_CONSTANTS.MERCHANT_B.FIXED_FEE_PAISA,
  defaultCurrency: 'BDT',
  webhookSecret: TEST_CONSTANTS.MERCHANT_B.WEBHOOK_SECRET,
  createdAt: new Date('2026-01-15T00:00:00Z'),
};

export const MERCHANT_PENDING_KYC: TestMerchant = {
  id: 'mch_01h8c9pending0123456789c',
  name: 'Pending Merchant Ltd',
  businessName: 'Pending Merchant Ltd',
  email: 'pending@example.com',
  status: 'PENDING_KYC',
  environment: 'SANDBOX',
  feeRateBps: 185,
  fixedFeePaisa: 0n,
  defaultCurrency: 'BDT',
  webhookSecret: 'whsec_pending_test_secret_1234567890abcdef',
  createdAt: new Date('2026-02-01T00:00:00Z'),
};
