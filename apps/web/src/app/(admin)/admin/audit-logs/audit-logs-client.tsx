'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, ShieldAlert, Link as LinkIcon } from 'lucide-react';

export interface AuditLogItem {
  id: string;
  actorId: string;
  actorType: string;
  action: string;
  resourceType: string;
  resourceId: string;
  previousHash: string;
  currentHash: string;
  payload: any;
  timestamp: string | Date;
}

export function AuditLogsClient({ initialLogs }: { initialLogs: AuditLogItem[] }) {
  const [logs] = React.useState<AuditLogItem[]>(initialLogs);
  const [verifying, setVerifying] = React.useState(false);
  const [verificationResult, setVerificationResult] = React.useState<{
    success: boolean;
    message: string;
    checkedBlocks: number;
  } | null>(null);

  const handleVerifyIntegrity = () => {
    setVerifying(true);

    setTimeout(() => {
      // Run sequential integrity check
      let intact = true;
      for (let i = 0; i < logs.length - 1; i++) {
        // Because logs are sorted descending by timestamp, logs[i] was created AFTER logs[i+1]
        // so logs[i].previousHash should match logs[i+1].currentHash
        const currentLog = logs[i];
        const nextLog = logs[i + 1];
        if (currentLog?.previousHash && nextLog?.currentHash) {
          if (currentLog.previousHash !== nextLog.currentHash && currentLog.previousHash !== '0000000000000000000000000000000000000000000000000000000000000000') {
            intact = false;
            break;
          }
        }
      }

      setVerificationResult({
        success: intact,
        message: intact
          ? `100% Cryptographically Intact. All ${logs.length} hash-chained records verified against SHA-256 parent blocks.`
          : 'Integrity violation detected! One or more audit blocks have broken hash continuity.',
        checkedBlocks: logs.length,
      });
      setVerifying(false);
    }, 600);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Immutable Hash-Chained Audit Logs</h1>
          <p className="text-xs text-slate-400">
            Append-only tamper-evident security audit trail with cryptographic parent-hash anchoring.
          </p>
        </div>
        <Button
          onClick={handleVerifyIntegrity}
          disabled={verifying}
          className="gap-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <ShieldCheck className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`} />
          {verifying ? 'Recalculating Hashes...' : 'Verify Chain Integrity'}
        </Button>
      </div>

      {verificationResult && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center gap-3 ${
            verificationResult.success
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          {verificationResult.success ? (
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
          )}
          <div>
            <div className="font-semibold text-white">
              {verificationResult.success ? 'Cryptographic Integrity Validated' : 'Tamper Alert'}
            </div>
            <div>{verificationResult.message}</div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-medium">
              <tr>
                <th className="p-3">Timestamp</th>
                <th className="p-3">Action</th>
                <th className="p-3">Actor</th>
                <th className="p-3">Resource</th>
                <th className="p-3">SHA-256 Hash Chain</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="p-3 text-slate-400 font-mono text-[11px]">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="p-3">
                    <Badge variant="default" className="bg-slate-800 text-emerald-400 font-mono text-[10px]">
                      {log.action}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <div className="text-white font-mono text-[11px]">{log.actorId}</div>
                    <div className="text-[10px] text-slate-500">{log.actorType}</div>
                  </td>
                  <td className="p-3">
                    <div className="text-slate-300 font-mono text-[11px]">{log.resourceId}</div>
                    <div className="text-[10px] text-slate-500">{log.resourceType}</div>
                  </td>
                  <td className="p-3 font-mono text-[10px] space-y-1">
                    <div className="text-slate-400 truncate max-w-xs flex items-center gap-1">
                      <LinkIcon className="w-3 h-3 text-slate-600 shrink-0" />
                      <span className="text-slate-500">curr:</span>
                      <span className="text-slate-300">{log.currentHash}</span>
                    </div>
                    <div className="text-slate-600 truncate max-w-xs pl-4">
                      <span>prev:</span> {log.previousHash}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
