'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Building2,
  Activity,
  UserCheck,
  FileCheck2,
  Sliders,
  ArrowLeft,
  Lock,
} from 'lucide-react';

const ADMIN_LINKS = [
  { title: 'Platform Overview', href: '/admin', icon: Activity },
  { title: 'Merchants & KYC', href: '/admin/merchants', icon: Building2 },
  { title: 'Gateway Health', href: '/admin/gateways', icon: Activity },
  { title: 'Fraud Review (Maker-Checker)', href: '/admin/fraud', icon: UserCheck },
  { title: 'Audit Logs (Hash-Chained)', href: '/admin/audit-logs', icon: FileCheck2 },
  { title: 'Feature Flags', href: '/admin/feature-flags', icon: Sliders },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 hidden md:flex flex-col justify-between border-r border-slate-800 bg-slate-950 p-4 min-h-screen text-slate-300">
      <div className="space-y-6">
        <Link href="/admin" className="flex items-center gap-2.5 px-2">
          <div className="h-8 w-8 rounded-lg bg-red-600 flex items-center justify-center text-white font-bold text-sm shadow">
            AD
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-white text-base leading-tight">DenaNeya</span>
            <span className="text-[10px] text-red-400 font-medium tracking-wide uppercase">Platform Control</span>
          </div>
        </Link>

        <nav className="space-y-1">
          {ADMIN_LINKS.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href || (link.href !== '/admin' && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg transition-colors',
                  isActive
                    ? 'bg-red-950/60 text-red-300 border border-red-800/60 font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                )}
              >
                <Icon className={cn('w-4 h-4', isActive ? 'text-red-400' : 'text-slate-500')} />
                {link.title}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="space-y-3">
        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400 space-y-1">
          <div className="flex items-center gap-1.5 text-red-400 font-semibold">
            <Lock className="w-3.5 h-3.5" />
            <span>Dual-Control Enforced</span>
          </div>
          <p className="text-[10px] text-slate-500">
            makerId !== checkerId strictly enforced by database check constraints.
          </p>
        </div>

        <Link
          href="/dashboard"
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Switch to Merchant View
        </Link>
      </div>
    </aside>
  );
}
