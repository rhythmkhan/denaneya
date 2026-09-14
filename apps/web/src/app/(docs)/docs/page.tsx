import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';
import { Zap, Key, CreditCard, ExternalLink, Bell, Smartphone, AlertTriangle, Code2, ArrowRight } from 'lucide-react';

export default function DocsPage() {
  const sections = [
    {
      title: '5-Minute Quickstart',
      desc: 'Create your first payment in sandbox, handle redirect, and verify settlement.',
      href: '/docs/quickstart',
      icon: Zap,
    },
    {
      title: 'Authentication & API Keys',
      desc: 'Learn about test and live secret keys, scoped permissions, and zero-downtime rotation.',
      href: '/docs/authentication',
      icon: Key,
    },
    {
      title: 'Payments REST API (v1)',
      desc: 'Complete endpoint reference for creating, listing, querying, and refunding payments in Paisa.',
      href: '/docs/payments-api',
      icon: CreditCard,
    },
    {
      title: 'Hosted Checkout Integration',
      desc: 'Redirect your customers to DenaNeya’s responsive, branded checkout portal with MFS tabs.',
      href: '/docs/hosted-checkout',
      icon: ExternalLink,
    },
    {
      title: 'Transactional Webhooks',
      desc: 'Receive HMAC-SHA256 signed event notifications with automatic 5x retry and DLQ protection.',
      href: '/docs/webhooks',
      icon: Bell,
    },
    {
      title: 'Android MFS SMS Collector',
      desc: 'Pair physical Android devices with hardware EC P-256 keys to automate wallet matching.',
      href: '/docs/mfs-sms-automation',
      icon: Smartphone,
    },
    {
      title: 'Error Code Catalog',
      desc: 'Exhaustive reference of HTTP status codes, error identifiers, and remediation steps.',
      href: '/docs/error-catalog',
      icon: AlertTriangle,
    },
    {
      title: 'Official Client SDKs',
      desc: 'Ready-to-use libraries for Node.js, TypeScript, Python, and PHP.',
      href: '/docs/sdks',
      icon: Code2,
    },
  ];

  return (
    <div className="space-y-10 max-w-4xl">
      <div className="space-y-3">
        <Badge variant="success">Developer Documentation</Badge>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          DenaNeya Integration Documentation
        </h1>
        <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
          Welcome to the developer documentation for DenaNeya. Integrate Bangladesh’s premier multi-tenant payment management and orchestration engine into your applications with zero floating point errors, guaranteed idempotency, and automated MFS matching.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sections.map((sec) => {
          const Icon = sec.icon;
          return (
            <Link key={sec.title} href={sec.href} className="group">
              <Card className="h-full hover:border-emerald-500 transition-colors p-5 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="p-2 w-fit rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
                    <Icon className="w-5 h-5" />
                  </div>
                  <CardTitle className="text-base group-hover:text-emerald-600 transition-colors">
                    {sec.title}
                  </CardTitle>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {sec.desc}
                  </p>
                </div>
                <div className="pt-4 flex items-center text-xs text-emerald-600 font-medium gap-1">
                  Read guide <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
