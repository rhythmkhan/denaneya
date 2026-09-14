import Link from 'next/link';
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  Smartphone,
  BookOpen,
  Lock,
  Layers,
  Scale,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FeeCalculator } from '@/components/marketing/fee-calculator';

export default function HomePage() {
  return (
    <div className="space-y-24 pb-20">
      {/* HERO SECTION */}
      <section className="relative overflow-hidden pt-20 pb-16 md:pt-28 md:pb-24 border-b border-slate-100 dark:border-slate-800/80 bg-gradient-to-b from-emerald-50/50 via-white to-transparent dark:from-emerald-950/20 dark:via-slate-950 dark:to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-100/80 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-semibold">
            <span className="font-bengali text-sm font-bold">দেনা-নেওয়া সহজ, হিসাব নিশ্চিত</span>
            <span className="text-emerald-400">•</span>
            <span>Zero-Float Integer Financial Engine</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 dark:text-white tracking-tight max-w-4xl mx-auto leading-[1.15]">
            Payment Management & Orchestration for{' '}
            <span className="text-emerald-600 dark:text-emerald-400 underline decoration-emerald-300 decoration-wavy">
              Bangladesh
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-300 max-w-2xl mx-auto font-normal leading-relaxed">
            Consolidate <strong>bKash, Nagad, Rocket, Upay</strong> and card gateways into a single unified API. Featuring automated Android SMS collection, immutable double-entry ledger, and real-time anti-fraud risk scoring.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <Link href="/register">
              <Button size="lg" className="gap-2 shadow-md">
                Create Merchant Account <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/docs">
              <Button size="lg" variant="outline" className="gap-2">
                <BookOpen className="w-4 h-4 text-emerald-600" /> Read Documentation
              </Button>
            </Link>
          </div>

          {/* Quick Metrics / Guarantees */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-4xl mx-auto pt-10 text-left">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
              <span className="text-2xl font-bold text-slate-900 dark:text-white block">0.00%</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">Zero Floating Point (Integer Paisa)</span>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
              <span className="text-2xl font-bold text-slate-900 dark:text-white block">4 Tiers</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">Verification Trust Architecture</span>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
              <span className="text-2xl font-bold text-slate-900 dark:text-white block">&lt; 300ms</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">P-256 Signed SMS Ingestion</span>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
              <span className="text-2xl font-bold text-slate-900 dark:text-white block">100%</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">Balanced Ledger Debits = Credits</span>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST TIERS ARCHITECTURE */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12 space-y-3">
          <Badge variant="success">Confidence Architecture</Badge>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">
            Bangladesh 4-Tier Verification Framework
          </h2>
          <p className="text-slate-600 dark:text-slate-300 text-sm">
            Not all payment signals are equal. DenaNeya categorizes every transaction into explicit trust tiers, enforcing automated balance continuity checks.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="p-6 rounded-xl border-2 border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/20 space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="success">Tier A</Badge>
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Official Direct API</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Real-time server-to-server TLS query against official bKash, Nagad, or SSLCOMMERZ gateway endpoints. Instant authoritative settlement.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="info">Tier B</Badge>
              <Zap className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Signed Webhooks</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Inbound provider webhooks verified via HMAC-SHA256 or RSA-2048 with an immediate secondary server query verification step.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="warning">Tier C</Badge>
              <Smartphone className="w-5 h-5 text-amber-600" />
            </div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Hardware SMS Collector</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Android collector paired with Keystore EC P-256 keys, sequential nonces, and rolling balance chain validation.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="secondary">Tier D</Badge>
              <Scale className="w-5 h-5 text-slate-500" />
            </div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Manual Moderation</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Manual merchant entry subject to dual-control Maker-Checker review queue and bank statement reconciliation.
            </p>
          </div>
        </div>
      </section>

      {/* CORE FEATURES GRID */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12 space-y-3">
          <Badge variant="outline">Enterprise Ready</Badge>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">
            Engineered for Massive Scale & Integrity
          </h2>
          <p className="text-slate-600 dark:text-slate-300 text-sm">
            Everything your business needs to orchestrate payments across Bangladesh with institutional confidence.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Scale className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Double-Entry Immutable Ledger</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Debits always equal credits. Every payment capture, refund, gateway fee, and dispute reversal posts balanced journal entries to a 5-tier Chart of Accounts.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Anti-Fraud & Dual-Control</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              12 weighted risk rules evaluating duplicate SMS, velocity, IP country, and device integrity. High-value transactions route to Maker-Checker approval.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Native Android SMS Collector</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Automate MFS personal and merchant wallet verification via our native Kotlin collector app. Cryptographic QR handshake and offline WorkManager queue.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-950 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Digital Invoicing & Links</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Generate shareable payment links with Bangladesh Bank EMVCo Bangla QR codes, and issue multi-line B2B invoices with printable PDF views.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
            <div className="w-10 h-10 rounded-lg bg-rose-100 dark:bg-rose-950 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Defense-in-Depth Security</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Argon2id password hashing, AES-256-GCM envelope encryption, SSRF protection blocking private IPs, and strict tenant isolation on every SQL query.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Transactional Outbox Webhooks</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Guaranteed event delivery with transactional outbox, HMAC-SHA256 signatures, exponential retry backoff, and dead-letter queue (DLQ) support.
            </p>
          </div>
        </div>
      </section>

      {/* FEE CALCULATOR SECTION */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FeeCalculator />
      </section>

      {/* BOTTOM CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl bg-emerald-600 dark:bg-emerald-900/60 p-8 sm:p-12 text-center text-white space-y-6 shadow-xl">
          <h2 className="text-3xl sm:text-4xl font-extrabold max-w-2xl mx-auto leading-tight">
            Ready to Streamline Your Payment Operations in Bangladesh?
          </h2>
          <p className="text-emerald-100 max-w-xl mx-auto text-base">
            Join hundreds of Bangladeshi merchants processing transactions with zero float errors, automated MFS matching, and instant reconciliation.
          </p>
          <div className="flex flex-wrap justify-center gap-4 pt-2">
            <Link href="/register">
              <Button size="lg" className="bg-white text-emerald-800 hover:bg-emerald-50">
                Register Free Sandbox
              </Button>
            </Link>
            <Link href="/contact">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10">
                Talk to Sales
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
