import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { MerchantSidebar } from '@/components/layout/merchant-sidebar';
import { MerchantHeader } from '@/components/layout/merchant-header';

export const dynamic = 'force-dynamic';

export const metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session || !session.user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex">
      <MerchantSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <MerchantHeader user={session.user} />
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
