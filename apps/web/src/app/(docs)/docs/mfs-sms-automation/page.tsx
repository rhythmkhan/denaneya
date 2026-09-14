import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { QrCode, Key, RefreshCw, ShieldCheck } from 'lucide-react';

export default function MfsSmsAutomationDocsPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <Badge variant="success">Tier C Verification</Badge>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
          MFS SMS Automation & Android Fleet
        </h1>
        <p className="text-slate-600 dark:text-slate-300 text-sm mt-1">
          Automate bKash, Nagad, Rocket, and Upay reconciliation using dedicated Android devices equipped with hardware-backed cryptographic signing.
        </p>
      </div>

      <div className="space-y-6 text-sm text-slate-700 dark:text-slate-300">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Why Hardware-Backed SMS Ingestion?
        </h2>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          Many Bangladeshi retail merchants operate high-volume business and personal MFS wallets that do not have direct access to enterprise PGW APIs. DenaNeya allows merchants to pair an Android smartphone that automatically listens for incoming SMS from official shortcodes (e.g. <code>bKash</code>, <code>16216</code>, <code>NAGAD</code>), parses transaction details, and signs the payload with non-exportable hardware keys.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <Card className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-emerald-600">
              <QrCode className="w-5 h-5" />
              <h3 className="font-semibold text-sm">Expiring QR Pairing</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              One-time QR tokens expire in 10 minutes. During the handshake, the device uploads its public key and binds securely to your merchant account.
            </p>
          </Card>

          <Card className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-blue-600">
              <Key className="w-5 h-5" />
              <h3 className="font-semibold text-sm">EC P-256 Signing</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Private keys are generated in the Android hardware Keystore. Every ingested SMS is digitally signed with SHA-256 ECDSA before transmission.
            </p>
          </Card>

          <Card className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-600">
              <RefreshCw className="w-5 h-5" />
              <h3 className="font-semibold text-sm">Balance-Chain Integrity</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Our balance-chain engine continuously verifies that the new balance reported in each SMS satisfies: <code>newBalance = previousBalance + amount - fee</code>.
            </p>
          </Card>

          <Card className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-purple-600">
              <ShieldCheck className="w-5 h-5" />
              <h3 className="font-semibold text-sm">Anti-Replay Protection</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Monotonic sequence numbers, 128-bit UUID nonces, and a strict ±300s clock drift window prevent man-in-the-middle replay attacks.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
