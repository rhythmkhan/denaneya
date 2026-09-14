import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Secure Checkout | DenaNeya',
  description: 'DenaNeya Hosted Payment Checkout',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-between py-10 px-4 sm:px-6">
      <div className="max-w-xl w-full mx-auto space-y-6">
        {/* Brand Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-sm">
              DN
            </div>
            <div>
              <span className="font-bold text-slate-900 dark:text-white text-base">DenaNeya</span>
              <span className="text-[10px] text-emerald-600 block font-medium font-bengali">
                দেনা-নেওয়া সহজ, হিসাব নিশ্চিত
              </span>
            </div>
          </div>
          <span className="text-xs text-slate-400 font-mono">Secure Gateway</span>
        </div>

        <main>{children}</main>
      </div>

      <footer className="text-center text-xs text-slate-400 pt-8">
        &copy; {new Date().getFullYear()} DenaNeya Ltd. Powered by Bangladesh Bank Compliant Orchestration.
      </footer>
    </div>
  );
}
