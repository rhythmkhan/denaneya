'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react';

export interface GatewayStatus {
  id: string;
  name: string;
  type: string;
  status: 'UP' | 'DEGRADED' | 'DOWN';
  latencyMs: number;
  successRate: number;
  mode: string;
  lastChecked: Date;
}

export function GatewaysBoardClient({ initialGateways }: { initialGateways: GatewayStatus[] }) {
  const [gateways, setGateways] = React.useState<GatewayStatus[]>(initialGateways);
  const [probing, setProbing] = React.useState(false);

  const handleProbeAll = async () => {
    setProbing(true);
    try {
      const res = await fetch('/api/v1/gateways/health');
      if (res.ok) {
        const data = await res.json();
        setGateways((prev) =>
          prev.map((g) => {
            const probe = data.gateways?.[g.id];
            if (probe) {
              return {
                ...g,
                status: probe.status,
                latencyMs: probe.latencyMs,
                lastChecked: new Date(),
              };
            }
            return g;
          })
        );
      }
    } catch (err) {
      console.error('Probe failed', err);
    } finally {
      setProbing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Live Payment Gateway Health</h1>
          <p className="text-xs text-slate-400">
            Real-time ping latency, health probe checks, and 24-hour success rate metrics.
          </p>
        </div>
        <Button
          onClick={handleProbeAll}
          disabled={probing}
          className="gap-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${probing ? 'animate-spin' : ''}`} />
          {probing ? 'Probing Adapters...' : 'Probe All Gateways'}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {gateways.map((g) => {
          const statusVariant =
            g.status === 'UP' ? 'success' : g.status === 'DEGRADED' ? 'warning' : 'destructive';
          const StatusIcon =
            g.status === 'UP' ? CheckCircle2 : g.status === 'DEGRADED' ? AlertTriangle : XCircle;

          return (
            <Card
              key={g.id}
              className="p-5 border-slate-800 bg-slate-900 text-slate-100 flex flex-col justify-between space-y-4 shadow-sm"
            >
              <div>
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="font-semibold text-white text-sm">{g.name}</h2>
                    <p className="text-[11px] text-slate-400">{g.type}</p>
                  </div>
                  <Badge variant={statusVariant} className="flex items-center gap-1 text-[10px]">
                    <StatusIcon className="w-3 h-3" />
                    {g.status}
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded bg-slate-950/60 border border-slate-800/80">
                    <div className="text-slate-400 text-[10px]">Roundtrip Latency</div>
                    <div className="text-white font-mono font-semibold mt-0.5">
                      {g.latencyMs} ms
                    </div>
                  </div>
                  <div className="p-2 rounded bg-slate-950/60 border border-slate-800/80">
                    <div className="text-slate-400 text-[10px]">24h Success Rate</div>
                    <div className="text-emerald-400 font-mono font-semibold mt-0.5">
                      {g.successRate}%
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex justify-between items-center text-[11px] text-slate-500 pt-2 border-t border-slate-800">
                  <span>Operating Mode:</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {g.mode}
                  </Badge>
                </div>
              </div>

              <div className="pt-2 text-[10px] text-slate-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Last probed: {new Date(g.lastChecked).toLocaleTimeString()}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
