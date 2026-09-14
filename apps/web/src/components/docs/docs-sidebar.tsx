'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  BookOpen,
  Zap,
  Key,
  CreditCard,
  ExternalLink,
  Bell,
  Smartphone,
  AlertTriangle,
  Code2,
  Menu,
  X,
} from 'lucide-react';

export const DOCS_NAV = [
  {
    title: 'Getting Started',
    items: [
      { title: 'Overview', href: '/docs', icon: BookOpen },
      { title: '5-Minute Quickstart', href: '/docs/quickstart', icon: Zap },
      { title: 'Authentication & Keys', href: '/docs/authentication', icon: Key },
    ],
  },
  {
    title: 'Core Guides',
    items: [
      { title: 'Payments API (v1)', href: '/docs/payments-api', icon: CreditCard },
      { title: 'Hosted Checkout Flow', href: '/docs/hosted-checkout', icon: ExternalLink },
      { title: 'Webhooks & Outbox', href: '/docs/webhooks', icon: Bell },
      { title: 'Android MFS Automation', href: '/docs/mfs-sms-automation', icon: Smartphone },
    ],
  },
  {
    title: 'Reference',
    items: [
      { title: 'Error Code Catalog', href: '/docs/error-catalog', icon: AlertTriangle },
      { title: 'Official SDKs', href: '/docs/sdks', icon: Code2 },
    ],
  },
];

export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 hidden md:block sticky top-16 self-start max-h-[calc(100vh-4rem)] overflow-y-auto border-r border-slate-200 dark:border-slate-800 pr-6 py-6 space-y-8">
      {DOCS_NAV.map((section) => (
        <div key={section.title} className="space-y-2">
          <h4 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-3">
            {section.title}
          </h4>
          <nav className="space-y-1">
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors',
                    isActive
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  )}
                >
                  <Icon className={cn('w-4 h-4', isActive ? 'text-emerald-600' : 'text-slate-400')} />
                  <span>{item.title}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
    </aside>
  );
}

export function DocsMobileNav() {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="md:hidden border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-4 py-2.5">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-emerald-600"
        >
          {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          <span>Documentation Navigation</span>
        </button>
      </div>

      {open && (
        <div className="pt-3 pb-2 space-y-4 border-t border-slate-200 dark:border-slate-800 mt-2">
          {DOCS_NAV.map((section) => (
            <div key={section.title} className="space-y-1.5">
              <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                {section.title}
              </h5>
              <div className="space-y-1 pl-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-md',
                        isActive
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{item.title}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
