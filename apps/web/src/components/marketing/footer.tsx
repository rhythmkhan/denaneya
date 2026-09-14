import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-emerald-600 flex items-center justify-center text-white font-bold text-sm">
                DN
              </div>
              <span className="font-bold text-slate-900 dark:text-white text-base">
                DenaNeya
              </span>
            </div>
            <p className="font-bengali text-sm text-slate-500 dark:text-slate-400">
              দেনা-নেওয়া সহজ, হিসাব নিশ্চিত।
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Enterprise payment management and orchestration infrastructure built exclusively for Bangladesh.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3 text-xs uppercase tracking-wider">
              Product
            </h4>
            <ul className="space-y-2 text-xs">
              <li><Link href="/features" className="hover:text-emerald-600 transition">Features Overview</Link></li>
              <li><Link href="/payment-methods" className="hover:text-emerald-600 transition">Payment Methods & Trust Tiers</Link></li>
              <li><Link href="/pricing" className="hover:text-emerald-600 transition">Transparent Pricing</Link></li>
              <li><Link href="/checkout/pay_demo" className="hover:text-emerald-600 transition">Hosted Checkout Demo</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3 text-xs uppercase tracking-wider">
              Developers
            </h4>
            <ul className="space-y-2 text-xs">
              <li><Link href="/docs" className="hover:text-emerald-600 transition">Documentation</Link></li>
              <li><Link href="/docs/quickstart" className="hover:text-emerald-600 transition">Quickstart Guide</Link></li>
              <li><Link href="/docs/payments-api" className="hover:text-emerald-600 transition">Payments REST API (v1)</Link></li>
              <li><Link href="/docs/mfs-sms-automation" className="hover:text-emerald-600 transition">Android SMS Collector</Link></li>
              <li><Link href="/docs/error-catalog" className="hover:text-emerald-600 transition">Error Taxonomy</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3 text-xs uppercase tracking-wider">
              Company & Legal
            </h4>
            <ul className="space-y-2 text-xs">
              <li><Link href="/about" className="hover:text-emerald-600 transition">About Us</Link></li>
              <li><Link href="/security" className="hover:text-emerald-600 transition">Security & Compliance</Link></li>
              <li><Link href="/contact" className="hover:text-emerald-600 transition">Contact & Sales</Link></li>
              <li><span className="text-slate-400">Dhaka, Bangladesh</span></li>
            </ul>
          </div>
        </div>

        {/* Regulatory Safety Disclaimer */}
        <div className="pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-2 max-w-3xl">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
              <strong>Regulatory Safety Declaration:</strong> DenaNeya operates strictly in <strong>SOFTWARE/ORCHESTRATION mode</strong> (<code>REGULATED_FEATURES_ENABLED=false</code>). DenaNeya routes transactions and verifies settlements across licensed payment service providers (PSPs) and mobile financial services (MFS). It does not hold merchant funds, issue e-money, or engage in custodial banking per Bangladesh Bank regulations.
            </p>
          </div>
          <p className="text-xs text-slate-400 shrink-0">
            &copy; {new Date().getFullYear()} DenaNeya Ltd. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
