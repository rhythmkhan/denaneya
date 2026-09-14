import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Scale,
  Smartphone,
  ShieldCheck,
  Zap,
  Layers,
  Lock,
  FileText,
  Activity,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = {
  title: 'Features Overview | DenaNeya — দেনা-নেওয়া',
  description: 'Explore the full capabilities of DenaNeya: zero-float money math, double-entry ledger, Android SMS collector automation, and multi-gateway orchestration.',
};

export default function FeaturesPage() {
  const features = [
    {
      icon: Scale,
      title: 'Zero-Float Paisa Integer Math',
      desc: 'Never risk rounding discrepancies. All money values are calculated and stored in 64-bit integer Paisa (1 BDT = 100 Paisa). Floating-point math is strictly forbidden across our monorepo.',
      badge: 'Financial Precision',
    },
    {
      icon: Activity,
      title: '11-State Enforced Machine',
      desc: 'Explicit payment transitions (CREATED → REQUIRES_ACTION → PENDING → PROCESSING → UNDER_REVIEW → COMPLETED → REFUNDED). Invalid transitions are rejected at both database and domain levels.',
      badge: 'State Integrity',
    },
    {
      icon: Smartphone,
      title: 'Android Hardware Keystore SMS Ingestion',
      desc: 'Automate bKash, Nagad, Rocket, and Upay SMS settlement with EC P-256 digital signatures, rolling balance-chain continuity verification, and offline retry queue.',
      badge: 'Mobile Financial Services',
    },
    {
      icon: ShieldCheck,
      title: 'Dual-Control Maker-Checker Moderation',
      desc: 'High-risk payments route directly to human review where makerId !== checkerId is enforced by both PostgreSQL check constraints and domain guards.',
      badge: 'Risk Engine',
    },
    {
      icon: Layers,
      title: 'Dynamic EMVCo Bangla QR',
      desc: 'Generate merchant-presented QR codes compliant with Bangladesh Bank PSD circulars, including CRC-16-CCITT checksums and dynamic amount tags.',
      badge: 'Bangla QR',
    },
    {
      icon: FileText,
      title: 'Digital Invoicing & Tax Engine',
      desc: 'Create multi-line item B2B invoices with customizable VAT basis points (0%, 5%, 7.5%, 15%), printable PDF views, and automated payment status sync.',
      badge: 'Invoicing',
    },
    {
      icon: Lock,
      title: 'Envelope Encryption & SSRF Defense',
      desc: 'Merchant provider credentials encrypted via AES-256-GCM envelope encryption. Inbound webhook registrations strictly filter private IPs, loopbacks, and cloud metadata.',
      badge: 'Security',
    },
    {
      icon: Zap,
      title: 'Transactional Outbox Webhooks',
      desc: 'Never miss an event. Webhooks are staged in the database within the settlement transaction, signed with HMAC-SHA256, and delivered with exponential backoff.',
      badge: 'Reliability',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-16">
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <Badge variant="success">Platform Architecture</Badge>
        <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Institutional Payment Capabilities for Bangladesh
        </h1>
        <p className="text-slate-600 dark:text-slate-300 text-base">
          Built from first principles to overcome local infrastructure challenges while strictly complying with Bangladesh Bank Software/Orchestration guidelines.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {features.map((feat) => {
          const Icon = feat.icon;
          return (
            <div
              key={feat.title}
              className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4 hover:border-emerald-500/50 transition"
            >
              <div className="flex items-center justify-between">
                <div className="p-3 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                  <Icon className="w-6 h-6" />
                </div>
                <Badge variant="outline">{feat.badge}</Badge>
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {feat.title}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {feat.desc}
              </p>
            </div>
          );
        })}
      </div>

      <div className="p-8 rounded-2xl bg-slate-900 text-white flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-center md:text-left">
          <h3 className="text-2xl font-bold">Ready to test these features?</h3>
          <p className="text-slate-400 text-sm">
            Launch our interactive hosted checkout sandbox simulator in seconds.
          </p>
        </div>
        <Link href="/checkout/pay_demo">
          <Button size="lg" className="bg-emerald-500 hover:bg-emerald-600 text-white gap-2">
            Try Hosted Checkout <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
