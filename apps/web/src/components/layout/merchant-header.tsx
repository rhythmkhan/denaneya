'use client';

import * as React from 'react';
import { logoutAction } from '@/lib/actions/auth.actions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LogOut, Store } from 'lucide-react';

export interface MerchantHeaderProps {
  user: {
    name: string;
    email: string;
    activeMerchantName?: string;
    environment?: 'SANDBOX' | 'PRODUCTION';
    isSuperAdmin?: boolean;
  };
}

export function MerchantHeader({ user }: MerchantHeaderProps) {
  const [env, setEnv] = React.useState<'SANDBOX' | 'PRODUCTION'>(user.environment || 'SANDBOX');

  const toggleEnv = () => {
    setEnv((prev) => (prev === 'SANDBOX' ? 'PRODUCTION' : 'SANDBOX'));
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur px-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 font-medium">
          <Store className="w-3.5 h-3.5 text-emerald-600" />
          <span>{user.activeMerchantName || 'My Merchant Store'}</span>
        </div>

        <button
          type="button"
          onClick={toggleEnv}
          className="flex items-center gap-1.5 cursor-pointer focus:outline-none"
          title="Click to toggle environment"
        >
          <Badge
            variant={env === 'SANDBOX' ? 'warning' : 'success'}
            className="font-mono text-[10px] tracking-wider uppercase"
          >
            {env} MODE
          </Badge>
        </button>
      </div>

      <div className="flex items-center gap-4">
        {user.isSuperAdmin && (
          <a href="/admin">
            <Button size="sm" variant="outline" className="text-xs">
              Platform Admin
            </Button>
          </a>
        )}

        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-xs">
            {user.name?.[0] || 'U'}
          </div>
          <span className="hidden sm:inline font-medium text-slate-800 dark:text-slate-200">{user.name}</span>
        </div>

        <form action={logoutAction}>
          <Button size="sm" variant="ghost" type="submit" className="text-xs text-slate-500 hover:text-red-600">
            <LogOut className="w-4 h-4" />
            <span className="sr-only">Log Out</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
