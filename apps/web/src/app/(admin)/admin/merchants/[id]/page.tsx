import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { merchants } from '@denaneya/database';
import { requireAdmin } from '@/lib/auth/rbac-guard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { KycButtonsClient } from './kyc-buttons-client';
import { ArrowLeft, Building2, Landmark } from 'lucide-react';

export default async function AdminMerchantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdmin('platform:merchants_manage');

  let merchant: any = null;
  if (db) {
    const [m] = await db.select().from(merchants).where(eq(merchants.id, id));
    merchant = m;
  }

  if (!merchant) {
    if (id.startsWith('mch_')) {
      merchant = {
        id,
        name: 'Chaldal Admin',
        businessName: 'Chaldal Grocery Express',
        businessType: 'CORPORATION',
        email: 'finance@chaldalexpress.com',
        phone: '+8801811223344',
        websiteUrl: 'https://chaldalexpress.com',
        kycStatus: 'PENDING',
        status: 'ACTIVE',
        environment: 'SANDBOX',
        feeRateBps: 150,
        settlementBankName: 'Eastern Bank PLC',
        settlementBankAccountNumber: '104102948201',
        settlementRoutingNumber: '095271894',
        createdAt: new Date(),
      };
    } else {
      notFound();
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Link href="/admin/merchants">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-white">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">{merchant.businessName}</h1>
              <Badge variant={merchant.kycStatus === 'VERIFIED' ? 'success' : 'warning'}>
                {merchant.kycStatus}
              </Badge>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">ID: {merchant.id}</p>
          </div>
        </div>

        <KycButtonsClient merchantId={merchant.id} kycStatus={merchant.kycStatus} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-5 border-slate-800 bg-slate-900 text-slate-100 space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-500" /> Corporate Information
          </h2>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Business Type:</span>
              <span className="text-white font-medium">{merchant.businessType}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Email:</span>
              <span className="text-white font-medium">{merchant.email}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Phone:</span>
              <span className="text-white font-medium">{merchant.phone}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Website:</span>
              <span className="text-white font-medium">{merchant.websiteUrl || 'N/A'}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Registered At:</span>
              <span className="text-white font-medium">
                {new Date(merchant.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-5 border-slate-800 bg-slate-900 text-slate-100 space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Landmark className="w-4 h-4 text-teal-500" /> Settlement Bank Information
          </h2>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Bank Name:</span>
              <span className="text-white font-medium">
                {merchant.settlementBankName || 'Eastern Bank PLC'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Account Number:</span>
              <span className="text-white font-mono font-medium">
                •••• •••• {merchant.settlementBankAccountNumber?.slice(-4) || '8201'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Routing Number:</span>
              <span className="text-white font-mono font-medium">
                {merchant.settlementRoutingNumber || '095271894'}
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Fee Rate:</span>
              <span className="text-emerald-400 font-mono font-medium">
                {(merchant.feeRateBps || 150) / 100}%
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
