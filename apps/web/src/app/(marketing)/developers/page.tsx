import type { Metadata } from 'next';
import Link from 'next/link';
import { Terminal, Code, Cpu, BookOpen, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Developer Documentation & REST API | DenaNeya',
  description: 'Complete developer resources: RESTful API reference, OpenAPI 3.1 specification, client SDKs, and webhook testing tools.',
};

export default function DevelopersPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-16">
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <Badge variant="success">Developer Hub</Badge>
        <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Built for Developers by Financial Engineers
        </h1>
        <p className="text-slate-600 dark:text-slate-300 text-base">
          Intuitive RESTful APIs, strict Zod validation, zero-float integer math, and complete SDK coverage across Node.js, Python, and PHP.
        </p>
      </div>

      {/* Quick API Snippet Showcase */}
      <Card className="max-w-4xl mx-auto overflow-hidden border-slate-800 bg-slate-950 text-slate-100 shadow-2xl">
        <CardHeader className="border-b border-slate-800 bg-slate-900/60 px-6 py-4 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-mono text-slate-300">Create Payment Request</span>
          </div>
          <Badge variant="outline" className="border-emerald-500/50 text-emerald-400 text-[10px]">
            POST /api/v1/payments
          </Badge>
        </CardHeader>
        <CardContent className="p-6 font-mono text-xs overflow-x-auto leading-relaxed text-slate-300">
          <pre>{`curl -X POST https://api.denaneya.com/v1/payments \\
  -H "Authorization: Bearer dn_live_sec_9f83a812..." \\
  -H "Idempotency-Key: idemp_order_84920" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amountPaisa": "150000",          # ৳ 1,500.00 BDT in Paisa integer
    "currency": "BDT",
    "provider": "BKASH",
    "customer": {
      "name": "Arif Chowdhury",
      "phone": "+8801711223344",
      "email": "arif@example.com"
    },
    "description": "Order #84920: Traditional Jamdani Saree"
  }'`}</pre>
        </CardContent>
      </Card>

      {/* 3 Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card>
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2">
              <Code className="w-5 h-5" />
            </div>
            <CardTitle className="text-lg">Strict Idempotency</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed space-y-2">
            <p>
              Pass an <code>Idempotency-Key</code> on all mutations. Replaying the identical request returns the cached result without duplicate debiting or double-processing.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-2">
              <Cpu className="w-5 h-5" />
            </div>
            <CardTitle className="text-lg">Zero-Float Invariant</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed space-y-2">
            <p>
              All monetary values are strictly represented in <strong>Paisa minor units</strong> (<code>1 BDT = 100 Paisa</code>) as BigInt strings in JSON to eliminate floating-point rounding errors.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-2">
              <Terminal className="w-5 h-5" />
            </div>
            <CardTitle className="text-lg">Multi-Language SDKs</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed space-y-2">
            <p>
              Official client libraries for TypeScript/Node.js, Python 3, and PHP 8 with automatic HMAC webhook verification and retry logic.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Docs Portal Banner */}
      <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-center md:text-left">
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
            Explore the Interactive Documentation Portal
          </h3>
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            Read our 5-minute quickstart guide, inspect the error catalog, and integrate webhooks.
          </p>
        </div>
        <Link href="/docs">
          <Button size="lg" className="gap-2">
            <BookOpen className="w-4 h-4" /> Open Docs Portal <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
