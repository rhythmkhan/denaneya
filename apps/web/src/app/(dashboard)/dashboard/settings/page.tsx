import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { merchants } from '@denaneya/database';
import { requireMerchant } from '@/lib/auth/rbac-guard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Building2, ShieldCheck, Landmark, KeyRound } from 'lucide-react';

export default async function SettingsPage() {
  const { merchantId } = await requireMerchant('merchant:settings_read');

  let merchant: any = null;
  if (db) {
    const [m] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.id, merchantId));
    merchant = m;
  }

  if (!merchant) {
    merchant = {
      businessName: 'DenaNeya Partner Store',
      businessType: 'PRIVATE_LTD',
      email: 'merchant@store.com.bd',
      phone: '+8801711002233',
      websiteUrl: 'https://store.com.bd',
      kycStatus: 'VERIFIED',
      settlementBankName: 'BRAC Bank PLC',
      settlementBankAccountNumber: '1501203498234001',
      settlementRoutingNumber: '060271894',
      feeRateBps: 150,
    };
  }

  const kycVariant =
    merchant.kycStatus === 'VERIFIED'
      ? 'success'
      : merchant.kycStatus === 'PENDING'
      ? 'warning'
      : 'destructive';

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Business Settings & KYC</h1>
        <p className="text-xs text-slate-500">
          Manage corporate credentials, verified settlement bank details, and security policies.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          {/* Business Profile */}
          <Card className="p-5 space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Corporate Profile
                </h2>
              </div>
              <Badge variant={kycVariant}>KYC: {merchant.kycStatus}</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="text-slate-500 font-medium">Business Name</label>
                <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
                  {merchant.businessName}
                </div>
              </div>
              <div>
                <label className="text-slate-500 font-medium">Business Type</label>
                <div className="text-slate-800 dark:text-slate-200 mt-0.5">
                  {merchant.businessType}
                </div>
              </div>
              <div>
                <label className="text-slate-500 font-medium">Official Contact Email</label>
                <div className="text-slate-800 dark:text-slate-200 mt-0.5">
                  {merchant.email}
                </div>
              </div>
              <div>
                <label className="text-slate-500 font-medium">Registered Phone</label>
                <div className="text-slate-800 dark:text-slate-200 mt-0.5">
                  {merchant.phone}
                </div>
              </div>
              <div className="col-span-2">
                <label className="text-slate-500 font-medium">Store Website</label>
                <div className="text-slate-800 dark:text-slate-200 mt-0.5">
                  {merchant.websiteUrl || 'Not provided'}
                </div>
              </div>
            </div>
          </Card>

          {/* Settlement Bank Account */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Landmark className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Settlement Bank Account
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Approved bank account used for automated BEFTN / NPSB disbursements.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-2">
              <div>
                <label className="text-slate-500 font-medium">Bank Name</label>
                <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
                  {merchant.settlementBankName || 'BRAC Bank PLC'}
                </div>
              </div>
              <div>
                <label className="text-slate-500 font-medium">Account Number</label>
                <div className="font-mono text-slate-900 dark:text-white mt-0.5">
                  •••• •••• {merchant.settlementBankAccountNumber?.slice(-4) || '4001'}
                </div>
              </div>
              <div>
                <label className="text-slate-500 font-medium">Routing Number</label>
                <div className="font-mono text-slate-900 dark:text-white mt-0.5">
                  {merchant.settlementRoutingNumber || '060271894'}
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Security Quick Links */}
        <div className="space-y-6">
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Security & 2FA</h2>
            </div>
            <p className="text-xs text-slate-500">
              Protect your merchant account with Two-Factor Authentication (TOTP Authenticator app).
            </p>
            <Link href="/dashboard/settings/mfa" className="block">
              <Button variant="outline" size="sm" className="w-full gap-2">
                <KeyRound className="w-4 h-4" /> Configure MFA (2FA)
              </Button>
            </Link>
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Pricing Tier & Fee Structure
            </h3>
            <div className="text-xs text-slate-500 space-y-1.5">
              <div className="flex justify-between">
                <span>Standard MFS Fee:</span>
                <span className="font-medium text-slate-900 dark:text-white">1.50%</span>
              </div>
              <div className="flex justify-between">
                <span>Fixed Processing:</span>
                <span className="font-medium text-slate-900 dark:text-white">৳ 0.00</span>
              </div>
              <div className="flex justify-between">
                <span>Operating Mode:</span>
                <span className="font-mono font-medium text-emerald-600">Software / Non-Custodial</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
