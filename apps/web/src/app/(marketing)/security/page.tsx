import type { Metadata } from 'next';
import { ShieldCheck, Lock, Key, Server, Cpu, Database, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Security Architecture & Compliance | DenaNeya',
  description: 'Multi-layer security: Argon2id password hashing, AES-256-GCM envelope encryption, SSRF protection, and hardware-backed device attestation.',
};

export default function SecurityPage() {
  const securityControls = [
    {
      icon: Lock,
      title: 'Argon2id Password Hashing',
      desc: 'Industry standard memory-hard password hashing (m=65536, t=3, p=1). Immune to GPU and ASIC brute-force attacks.',
    },
    {
      icon: Key,
      title: 'AES-256-GCM Envelope Encryption',
      desc: 'All sensitive merchant provider credentials and webhook secrets are protected by envelope encryption using a hardware-isolated master key.',
    },
    {
      icon: Server,
      title: 'SSRF & DNS Rebinding Defense',
      desc: 'Merchant-supplied webhook URLs undergo recursive DNS resolution and strict CIDR filtering, blocking loopback (127.0.0.1), private subnets (10.x, 192.168.x), and cloud metadata (169.254.169.254).',
    },
    {
      icon: Cpu,
      title: 'Hardware-Backed Android Attestation',
      desc: 'Our native collector app uses the Android Keystore to generate non-exportable EC P-256 keypairs. Every SMS payload is digitally signed with replay-proof monotonic sequences.',
    },
    {
      icon: Database,
      title: 'Immutable Hash-Chained Audit Logs',
      desc: 'Every administrative mutation is recorded with SHA-256 hash chaining (previousHash + currentHash), ensuring tamper-evident chronological auditability.',
    },
    {
      icon: ShieldCheck,
      title: 'Zero Card Data (PCI SAQ-A)',
      desc: 'DenaNeya never captures, transmits, or stores raw credit card numbers, CVVs, or expiration dates. All card payments redirect to licensed gateway checkout sessions.',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-16">
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <Badge variant="success">Institutional Security</Badge>
        <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Enterprise Security & Compliance
        </h1>
        <p className="text-slate-600 dark:text-slate-300 text-base">
          Engineered to satisfy OWASP ASVS v4.0, PCI-DSS SAQ-A, and Bangladesh Bank cybersecurity directives.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {securityControls.map((ctrl) => {
          const Icon = ctrl.icon;
          return (
            <Card key={ctrl.title}>
              <CardHeader>
                <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2">
                  <Icon className="w-5 h-5" />
                </div>
                <CardTitle className="text-base">{ctrl.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {ctrl.desc}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-emerald-200 dark:border-emerald-900 bg-emerald-50/20 dark:bg-emerald-950/20 p-8">
        <div className="max-w-3xl space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Bangladesh Bank Regulatory Declarations
            </h3>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            DenaNeya is an orchestration and software middleware layer (<code>REGULATED_FEATURES_ENABLED=false</code>). It does not hold merchant deposits, pool customer money, or issue e-money. All funds settle directly through merchant accounts with licensed PSPs, MFS operators, and scheduled commercial banks in Bangladesh.
          </p>
        </div>
      </Card>
    </div>
  );
}
