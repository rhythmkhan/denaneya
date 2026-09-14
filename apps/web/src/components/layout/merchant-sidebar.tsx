'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  CreditCard,
  QrCode,
  FileText,
  Key,
  Bell,
  Smartphone,
  Users,
  Settings,
  ShieldCheck,
} from 'lucide-react';

const MERCHANT_LINKS = [
  { title: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Payments', href: '/dashboard/payments', icon: CreditCard },
  { title: 'Payment Links & QR', href: '/dashboard/payment-links', icon: QrCode },
  { title: 'Invoices', href: '/dashboard/invoices', icon: FileText },
  { title: 'API Keys', href: '/dashboard/api-keys', icon: Key },
  { title: 'Webhooks', href: '/dashboard/webhooks', icon: Bell },
  { title: 'Connected Devices', href: '/dashboard/devices', icon: Smartphone },
  { title: 'Team', href: '/dashboard/team', icon: Users },
  { title: 'Settings & MFA', href: '/dashboard/settings', icon: Settings },
];

export function MerchantSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 hidden md:flex flex-col justify-between border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 min-h-screen">
      <div className="space-y-6">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-2">
          <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-sm shadow">
            DN
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-slate-900 dark:text-white text-base leading-tight">DenaNeya</span>
            <span className="text-[10px] text-emerald-600 font-medium">Merchant Console</span>
          </div>
        </Link>

        <nav className="space-y-1">
          {MERCHANT_LINKS.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg transition-colors',
                  isActive
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                )}
              >
                <Icon className={cn('w-4 h-4', isActive ? 'text-emerald-600' : 'text-slate-400')} />
                {link.title}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 text-xs text-slate-500 space-y-1">
        <div className="flex items-center gap-1.5 text-emerald-600 font-semibold">
          <ShieldCheck className="w-4 h-4" />
          <span>Zero-Float Minor Units</span>
        </div>
        <p className="text-[10px] text-slate-400">
          All financial calculations in Paisa. Debits strictly equal credits.
        </p>
      </div>
    </aside>
  );
}
