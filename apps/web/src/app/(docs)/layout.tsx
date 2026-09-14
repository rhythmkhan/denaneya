import Link from 'next/link';
import { DocsSidebar, DocsMobileNav } from '@/components/docs/docs-sidebar';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col">
      {/* Docs Header */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-sm shadow">
                DN
              </div>
              <span className="font-bold text-slate-900 dark:text-white text-base">
                DenaNeya <span className="text-emerald-600 font-normal text-sm">Docs</span>
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button size="sm" variant="outline">
                Dashboard
              </Button>
            </Link>
            <Link href="/">
              <Button size="sm" variant="ghost" className="gap-1.5 text-xs">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile Navigation */}
      <DocsMobileNav />

      {/* Main Container */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 flex">
        <DocsSidebar />
        <main className="flex-1 min-w-0 py-8 md:pl-10 pb-20">{children}</main>
      </div>
    </div>
  );
}
