import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { merchants } from '@denaneya/database';
import { requireAdmin } from '@/lib/auth/rbac-guard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, ArrowUpRight } from 'lucide-react';

export default async function AdminMerchantsPage() {
  await requireAdmin('platform:merchants_manage');

  let rows: any[] = [];
  if (db) {
    rows = await db
      .select()
      .from(merchants)
      .orderBy(desc(merchants.createdAt));
  }

  if (rows.length === 0) {
    rows = [
      {
        id: 'mch_9k8a2b3c4d01',
        businessName: 'Apex Digital Commerce Ltd.',
        businessType: 'PRIVATE_LTD',
        email: 'billing@apexdigital.com.bd',
        phone: '+8801711223344',
        kycStatus: 'VERIFIED',
        status: 'ACTIVE',
        environment: 'PRODUCTION',
        createdAt: new Date(Date.now() - 86400000 * 45),
      },
      {
        id: 'mch_9k8a2b3c4d02',
        businessName: 'Chaldal Grocery Express',
        businessType: 'CORPORATION',
        email: 'finance@chaldalexpress.com',
        phone: '+8801811223344',
        kycStatus: 'PENDING',
        status: 'ACTIVE',
        environment: 'SANDBOX',
        createdAt: new Date(Date.now() - 86400000 * 2),
      },
      {
        id: 'mch_9k8a2b3c4d03',
        businessName: 'Dhaka Gadget Hub',
        businessType: 'SOLE_PROPRIETORSHIP',
        email: 'info@dhakagadgethub.com',
        phone: '+8801911223344',
        kycStatus: 'REJECTED',
        status: 'SUSPENDED',
        environment: 'SANDBOX',
        createdAt: new Date(Date.now() - 86400000 * 15),
      },
    ];
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Merchant Directory & KYC</h1>
          <p className="text-xs text-slate-400">
            Review onboarding submissions, verify Bangladesh Bank KYC credentials, and manage tenant accounts.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-medium">
              <tr>
                <th className="p-3">Merchant Business</th>
                <th className="p-3">Type</th>
                <th className="p-3">Contact</th>
                <th className="p-3">KYC Status</th>
                <th className="p-3">Environment</th>
                <th className="p-3">Account Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((m) => {
                const kycVariant =
                  m.kycStatus === 'VERIFIED'
                    ? 'success'
                    : m.kycStatus === 'PENDING'
                    ? 'warning'
                    : 'destructive';

                return (
                  <tr key={m.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3">
                      <div className="font-semibold text-white flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-slate-500" />
                        {m.businessName}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">{m.id}</div>
                    </td>
                    <td className="p-3 text-slate-400">{m.businessType}</td>
                    <td className="p-3 text-slate-400">
                      <div>{m.email}</div>
                      <div className="text-[11px] text-slate-500">{m.phone}</div>
                    </td>
                    <td className="p-3">
                      <Badge variant={kycVariant}>{m.kycStatus}</Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant={m.environment === 'PRODUCTION' ? 'default' : 'secondary'}>
                        {m.environment}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant={m.status === 'ACTIVE' ? 'success' : 'destructive'}>
                        {m.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      <Link href={`/admin/merchants/${m.id}`}>
                        <Button size="sm" variant="outline" className="h-7 text-xs border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 gap-1">
                          Review KYC <ArrowUpRight className="w-3 h-3" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
