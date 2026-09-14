import { db } from '../src/client.js';
import { ledgerAccounts, merchants } from '../src/schema/index.js';
import { fileURLToPath } from 'node:url';

export async function seed() {
  if (!db) {
    throw new Error('Database client not initialized. Ensure DATABASE_URL is set.');
  }

  console.log('🌱 Seeding initial platform data...');

  // 1. Standard Platform Chart of Accounts
  const standardAccounts = [
    // 1000 Assets (Provider Receivables & SIM Wallets)
    { id: 'acc_1110', code: '1110', name: 'SSLCOMMERZ In-Transit Receivable', type: 'ASSET' as const, normalBalance: 'DEBIT' as const, description: 'Clearing account for SSLCOMMERZ card & netbanking transactions' },
    { id: 'acc_1120', code: '1120', name: 'shurjoPay In-Transit Receivable', type: 'ASSET' as const, normalBalance: 'DEBIT' as const, description: 'Clearing account for shurjoPay transactions' },
    { id: 'acc_1130', code: '1130', name: 'aamarPay In-Transit Receivable', type: 'ASSET' as const, normalBalance: 'DEBIT' as const, description: 'Clearing account for aamarPay transactions' },
    { id: 'acc_1140', code: '1140', name: 'bKash Direct Checkout Receivable', type: 'ASSET' as const, normalBalance: 'DEBIT' as const, description: 'bKash tokenized gateway checkout receivable' },
    { id: 'acc_1150', code: '1150', name: 'Nagad PGW Receivable', type: 'ASSET' as const, normalBalance: 'DEBIT' as const, description: 'Nagad PGW gateway receivable' },
    { id: 'acc_1210', code: '1210', name: 'bKash Merchant SIM Wallet', type: 'ASSET' as const, normalBalance: 'DEBIT' as const, description: 'Custodial balance in merchant bKash SIM' },
    { id: 'acc_1220', code: '1220', name: 'Nagad Merchant SIM Wallet', type: 'ASSET' as const, normalBalance: 'DEBIT' as const, description: 'Custodial balance in merchant Nagad SIM' },
    { id: 'acc_1230', code: '1230', name: 'Rocket Merchant SIM Wallet', type: 'ASSET' as const, normalBalance: 'DEBIT' as const, description: 'Custodial balance in merchant Rocket SIM' },
    { id: 'acc_1240', code: '1240', name: 'Upay Merchant SIM Wallet', type: 'ASSET' as const, normalBalance: 'DEBIT' as const, description: 'Custodial balance in merchant Upay SIM' },
    { id: 'acc_1310', code: '1310', name: 'Commercial Bank Settlement Treasury', type: 'ASSET' as const, normalBalance: 'DEBIT' as const, description: 'DenaNeya commercial bank clearing pool' },

    // 2000 Liabilities (Merchant Payables & Gateway Fees)
    { id: 'acc_2110', code: '2110', name: 'Merchant Available Balance', type: 'LIABILITY' as const, normalBalance: 'CREDIT' as const, description: 'Net settled funds owed to merchants' },
    { id: 'acc_2120', code: '2120', name: 'Merchant Escrow Hold / Reserve', type: 'LIABILITY' as const, normalBalance: 'CREDIT' as const, description: 'Held reserves for disputes or rolling risk' },
    { id: 'acc_2210', code: '2210', name: 'Pending Customer Refund Payable', type: 'LIABILITY' as const, normalBalance: 'CREDIT' as const, description: 'Funds earmarked for pending customer refunds' },
    { id: 'acc_2310', code: '2310', name: 'Gateway Network Fee Payable', type: 'LIABILITY' as const, normalBalance: 'CREDIT' as const, description: 'Interchange and network fees owed to gateways' },

    // 3000 Equity
    { id: 'acc_3100', code: '3100', name: 'Platform Retained Earnings', type: 'EQUITY' as const, normalBalance: 'CREDIT' as const, description: 'Accumulated operating profits' },

    // 4000 Revenue
    { id: 'acc_4100', code: '4100', name: 'Platform MDR Processing Fee Revenue', type: 'REVENUE' as const, normalBalance: 'CREDIT' as const, description: 'DenaNeya platform percentage markup fee' },
    { id: 'acc_4200', code: '4200', name: 'Platform Fixed Transaction Fee Revenue', type: 'REVENUE' as const, normalBalance: 'CREDIT' as const, description: 'Flat transaction fee revenue' },

    // 5000 Expense
    { id: 'acc_5100', code: '5100', name: 'Gateway Interchange Expense', type: 'EXPENSE' as const, normalBalance: 'DEBIT' as const, description: 'Fees charged by payment networks' },
  ];

  for (const acc of standardAccounts) {
    await db.insert(ledgerAccounts)
      .values(acc)
      .onConflictDoNothing();
  }
  console.log(`✓ Seeded ${standardAccounts.length} standard Chart of Accounts.`);

  // 2. Seed Default Sandbox Merchant
  await db.insert(merchants).values({
    id: 'mch_sandbox_demo',
    name: 'DenaNeya Sandbox Store',
    businessName: 'DenaNeya Technologies Ltd.',
    businessType: 'PRIVATE_LIMITED',
    email: 'sandbox@denaneya.com',
    phone: '+8801700000000',
    kycStatus: 'VERIFIED',
    status: 'ACTIVE',
    environment: 'SANDBOX',
    feeRateBps: 150,
    fixedFeePaisa: 0n,
  }).onConflictDoNothing();
  console.log('✓ Seeded demo sandbox merchant.');

  console.log('🎉 Database seeding complete!');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed().catch((err) => {
    console.error('Fatal error during seeding:', err);
    process.exit(1);
  });
}
