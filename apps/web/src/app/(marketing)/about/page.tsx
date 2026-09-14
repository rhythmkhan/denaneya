import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { MapPin, Target, Sparkles } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About DenaNeya — Mission & Team',
  description: 'DenaNeya is Bangladesh’s unified payment management and orchestration platform — দেনা-নেওয়া সহজ, হিসাব নিশ্চিত।',
};

export default function AboutPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-16">
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <Badge variant="success">About DenaNeya</Badge>
        <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          দেনা-নেওয়া সহজ, হিসাব নিশ্চিত।
        </h1>
        <p className="text-slate-600 dark:text-slate-300 text-base">
          Our mission is to build the most dependable, mathematically rigorous payment orchestration infrastructure for Bangladesh’s growing digital economy.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card className="p-6 space-y-3">
          <div className="p-3 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 w-fit">
            <Target className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-lg text-slate-900 dark:text-white">Our Mission</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Bridge the gap between disparate Mobile Financial Services (MFS) and traditional commercial banking rails through zero-float, unified orchestration.
          </p>
        </Card>

        <Card className="p-6 space-y-3">
          <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 w-fit">
            <Sparkles className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-lg text-slate-900 dark:text-white">Financial Integrity First</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            We reject floating-point approximations and arbitrary state changes. Every transaction adheres to strict double-entry ledger invariants and cryptographically verifiable proofs.
          </p>
        </Card>

        <Card className="p-6 space-y-3">
          <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400 w-fit">
            <MapPin className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-lg text-slate-900 dark:text-white">Dhaka Headquarters</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Proudly engineered in Dhaka, Bangladesh. Designed specifically to navigate local telecommunication quirks, SMS formats, and Bangladesh Bank regulatory guidelines.
          </p>
        </Card>
      </div>
    </div>
  );
}
