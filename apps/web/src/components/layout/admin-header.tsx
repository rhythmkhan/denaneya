'use client';

import { logoutAction } from '@/lib/actions/auth.actions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LogOut, ShieldAlert } from 'lucide-react';

export interface AdminHeaderProps {
  user: {
    name: string;
    email: string;
    isSuperAdmin?: boolean;
  };
}

export function AdminHeader({ user }: AdminHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-800 bg-slate-950/90 backdrop-blur px-6 text-white">
      <div className="flex items-center gap-3">
        <Badge variant="destructive" className="gap-1 font-mono text-[10px] tracking-wider uppercase">
          <ShieldAlert className="w-3.5 h-3.5" /> SUPER_ADMIN SECURE CONSOLE
        </Badge>
        <span className="text-xs text-slate-400 hidden sm:inline">
          REGULATED_FEATURES_ENABLED=false
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <div className="w-7 h-7 rounded-full bg-red-950 border border-red-800 text-red-300 flex items-center justify-center font-bold text-xs">
            A
          </div>
          <span className="font-medium">{user.name}</span>
        </div>

        <form action={logoutAction}>
          <Button size="sm" variant="ghost" type="submit" className="text-xs text-slate-400 hover:text-red-400">
            <LogOut className="w-4 h-4" />
            <span className="sr-only">Log Out</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
