'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { QrCode } from '@/components/ui/qr-code';
import { generateDevicePairingTokenAction, revokeDeviceAction } from '@/lib/actions/device.actions';
import {
  Smartphone,
  Plus,
  Battery,
  BatteryCharging,
  Wifi,
  Radio,
  Clock,
  AlertTriangle,
  Trash2,
} from 'lucide-react';

export interface DeviceItem {
  id: string;
  deviceId: string;
  deviceName: string;
  model: string | null;
  osVersion: string | null;
  batteryLevel: number | null;
  isCharging: boolean | null;
  networkType: string | null;
  status: string;
  sequenceNumber: bigint | string;
  lastHeartbeatAt: string | Date | null;
  createdAt: string | Date;
}

export function DevicesClient({ devices }: { devices: DeviceItem[] }) {
  const [pairOpen, setPairOpen] = React.useState(false);
  const [deviceName, setDeviceName] = React.useState('');
  const [qrData, setQrData] = React.useState<string | null>(null);
  const [expiresAt, setExpiresAt] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleGeneratePairing = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await generateDevicePairingTokenAction(deviceName);
      if (res?.qrPayload) {
        setQrData(res.qrPayload);
        setExpiresAt(res.expiresAt);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate pairing token.');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (devId: string) => {
    if (!confirm('Are you sure you want to revoke this device? It will be disconnected immediately.')) {
      return;
    }
    try {
      await revokeDeviceAction(devId);
    } catch (err: any) {
      alert(err.message || 'Failed to revoke device');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Connected Android Fleet</h1>
          <p className="text-xs text-slate-500">
            Multi-SIM SMS collector devices running hardware-backed EC P-256 signatures for Tier C settlement.
          </p>
        </div>
        <Button onClick={() => { setPairOpen(true); setQrData(null); }} className="gap-2">
          <Plus className="w-4 h-4" /> Pair Android Device
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {devices.length === 0 ? (
          <div className="col-span-full p-12 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900">
            <Smartphone className="w-10 h-10 mx-auto text-slate-400 mb-3" />
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              No Collector Devices Paired
            </div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Pair an Android phone running the DenaNeya SMS Collector app to automatically match bKash & Nagad incoming transactions.
            </p>
            <Button onClick={() => { setPairOpen(true); setQrData(null); }} variant="outline" size="sm" className="mt-4 gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Pair Your First Device
            </Button>
          </div>
        ) : (
          devices.map((d) => {
            const isOffline =
              !d.lastHeartbeatAt ||
              Date.now() - new Date(d.lastHeartbeatAt).getTime() > 20 * 60 * 1000;
            const displayStatus = d.status === 'ACTIVE' && isOffline ? 'OFFLINE' : d.status;
            const badgeVariant =
              displayStatus === 'ACTIVE'
                ? 'success'
                : displayStatus === 'OFFLINE'
                ? 'warning'
                : 'destructive';

            return (
              <div
                key={d.id}
                className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-slate-900 dark:text-white">
                          {d.deviceName}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {d.deviceId}
                        </div>
                      </div>
                    </div>
                    <Badge variant={badgeVariant}>{displayStatus}</Badge>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      {d.isCharging ? (
                        <BatteryCharging className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Battery className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span>{d.batteryLevel !== null ? `${d.batteryLevel}%` : 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Wifi className="w-3.5 h-3.5 text-slate-400" />
                      <span>{d.networkType || 'LTE / WiFi'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate">{d.model || 'Android Phone'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>Seq: {d.sequenceNumber.toString()}</span>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Last Heartbeat:</span>
                    <span className="font-medium text-slate-600 dark:text-slate-300">
                      {d.lastHeartbeatAt ? new Date(d.lastHeartbeatAt).toLocaleTimeString() : 'Never'}
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  {d.status === 'ACTIVE' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevoke(d.deviceId)}
                      className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="w-3 h-3 mr-1" /> Revoke
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* QR Pairing Modal */}
      <Dialog open={pairOpen} onClose={() => setPairOpen(false)} title="Pair Android SMS Collector">
        {!qrData ? (
          <form onSubmit={handleGeneratePairing} className="space-y-4">
            {error && (
              <div className="p-2.5 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded text-xs">
                {error}
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Device Friendly Name</label>
              <Input
                required
                placeholder="e.g. Shop Counter 1 - Redmi 12"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
              />
            </div>
            <p className="text-[11px] text-slate-500">
              Generating a pairing token will produce an encrypted QR code valid for 10 minutes. Scan it using the DenaNeya Collector app to bind the device&apos;s Keystore public key.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPairOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={loading}>
                {loading ? 'Generating...' : 'Generate Pairing QR'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4 text-center">
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2 text-left">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>
                Scan with the DenaNeya Collector app. {expiresAt ? `Expires at ${new Date(expiresAt).toLocaleTimeString()}` : 'Token expires in 10 minutes.'}
              </span>
            </div>

            <div className="flex justify-center p-4 bg-white rounded-xl border border-slate-200">
              <QrCode data={qrData} size={220} />
            </div>

            <div className="text-xs text-slate-400 font-mono break-all">
              Payload: {qrData.slice(0, 48)}...
            </div>

            <div className="flex justify-end pt-2">
              <Button size="sm" onClick={() => setPairOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
