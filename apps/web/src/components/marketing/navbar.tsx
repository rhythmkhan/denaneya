'use client';

import * as React from 'react';
import Link from 'next/link';
import { Menu, X, ShieldCheck, ArrowRight, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="h-9 w-9 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold shadow-md group-hover:bg-emerald-700 transition">
              DN
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg text-slate-900 dark:text-white leading-tight">
                DenaNeya
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium font-bengali">
                দেনা-নেওয়া সহজ, হিসাব নিশ্চিত
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <Link href="/features" className="hover:text-emerald-600 transition">
              Features
            </Link>
            <Link href="/payment-methods" className="hover:text-emerald-600 transition">
              Methods
            </Link>
            <Link href="/pricing" className="hover:text-emerald-600 transition">
              Pricing
            </Link>
            <Link href="/developers" className="hover:text-emerald-600 transition">
              Developers
            </Link>
            <Link href="/docs" className="hover:text-emerald-600 transition">
              Docs
            </Link>
            <Link href="/demo-store" className="text-indigo-600 dark:text-indigo-400 font-semibold hover:text-indigo-700 transition flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Demo Store
            </Link>
            <Link href="/security" className="hover:text-emerald-600 transition flex items-center gap-1">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Security
            </Link>
            <a
              href="https://github.com/rhythmkhan/denaneya/releases/download/v1.0.1/denaneya-collector-v1.0.1.apk"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold px-2.5 py-1 rounded-full border border-emerald-600/30 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition flex items-center gap-1"
            >
              <Smartphone className="w-3.5 h-3.5" />
              Android APK
            </a>
          </nav>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Sign In
            </Button>
          </Link>
          <Link href="/register">
            <Button size="sm" className="gap-1.5">
              Get Started <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>

        <div className="md:hidden flex items-center">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-slate-600 dark:text-slate-300 hover:text-emerald-600"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 pt-2 pb-6 space-y-3">
          <nav className="flex flex-col space-y-2 text-base font-medium text-slate-700 dark:text-slate-200">
            <Link href="/features" onClick={() => setMobileMenuOpen(false)} className="px-2 py-1.5 hover:text-emerald-600">
              Features
            </Link>
            <Link href="/payment-methods" onClick={() => setMobileMenuOpen(false)} className="px-2 py-1.5 hover:text-emerald-600">
              Methods & Trust Tiers
            </Link>
            <Link href="/pricing" onClick={() => setMobileMenuOpen(false)} className="px-2 py-1.5 hover:text-emerald-600">
              Pricing & Calculator
            </Link>
            <Link href="/developers" onClick={() => setMobileMenuOpen(false)} className="px-2 py-1.5 hover:text-emerald-600">
              Developers
            </Link>
            <Link href="/docs" onClick={() => setMobileMenuOpen(false)} className="px-2 py-1.5 hover:text-emerald-600">
              Documentation
            </Link>
            <Link href="/security" onClick={() => setMobileMenuOpen(false)} className="px-2 py-1.5 hover:text-emerald-600">
              Security Architecture
            </Link>
            <a
              href="https://github.com/rhythmkhan/denaneya/releases/download/v1.0.1/denaneya-collector-v1.0.1.apk"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-1.5 font-semibold text-emerald-600 flex items-center gap-2"
            >
              <Smartphone className="w-4 h-4" /> Download Android APK (v1.0.1)
            </a>
          </nav>
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-2">
            <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="outline" className="w-full justify-center">
                Sign In
              </Button>
            </Link>
            <Link href="/register" onClick={() => setMobileMenuOpen(false)}>
              <Button className="w-full justify-center">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
