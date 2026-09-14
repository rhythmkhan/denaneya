'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { QrCode } from '@/components/ui/qr-code';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import {
  initiateMfaSetupAction,
  enableMfaAction,
  getMfaStatusAction,
} from '@/lib/actions/mfa.actions';

export default function MfaSetupPage() {
  const [totpCode, setTotpCode] = React.useState('');
  const [secret, setSecret] = React.useState('');
  const [uri, setUri] = React.useState('');
  const [enabled, setEnabled] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [initialLoading, setInitialLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const status = await getMfaStatusAction();
        if (status.mfaEnabled) {
          if (mounted) {
            setEnabled(true);
            setInitialLoading(false);
          }
          return;
        }

        const setup = await initiateMfaSetupAction();
        if (mounted) {
          if (setup.secret && setup.uri) {
            setSecret(setup.secret);
            setUri(setup.uri);
          } else if (setup.error) {
            setError(setup.error);
          }
          setInitialLoading(false);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || 'Failed to initialize 2FA setup.');
          setInitialLoading(false);
        }
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (totpCode.trim().length !== 6) {
      setError('Please enter a valid 6-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      const res = await enableMfaAction(secret, totpCode.trim());
      if (res.error) {
        setError(res.error);
      } else if (res.success) {
        setEnabled(true);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to activate 2FA.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/settings">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Two-Factor Authentication (2FA)
          </h1>
          <p className="text-xs text-slate-500">
            Secure your merchant account using an Authenticator app (Google Authenticator, Authy, 1Password).
          </p>
        </div>
      </div>

      <Card className="p-6 space-y-6">
        {initialLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            <span className="text-xs">Loading two-factor authentication configuration...</span>
          </div>
        ) : enabled ? (
          <div className="text-center py-6 space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6" />
            </div>
            <div className="text-base font-bold text-slate-900 dark:text-white">
              2FA Successfully Enabled!
            </div>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              Your account is now protected with RFC 6238 time-based one-time password (TOTP) authentication.
            </p>
            <Link href="/dashboard/settings" className="inline-block pt-2">
              <Button size="sm">Back to Settings</Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Step 1: Scan QR code with your Authenticator
              </h2>
              <p className="text-xs text-slate-500">
                Open Google Authenticator, Microsoft Authenticator, or 1Password and scan the QR code below.
              </p>
              {uri ? (
                <div className="flex justify-center p-4 bg-white rounded-xl border border-slate-200 dark:border-slate-800 my-4">
                  <QrCode data={uri} size={180} />
                </div>
              ) : null}
              {secret ? (
                <div className="text-center text-xs text-slate-400">
                  Can&apos;t scan? Enter manual secret:{' '}
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300 select-all">
                    {secret}
                  </span>
                </div>
              ) : null}
            </div>

            <form onSubmit={handleVerify} className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Step 2: Enter the 6-digit code
                </h3>
                <p className="text-xs text-slate-500">
                  Enter the confirmation code displayed in your app to activate 2FA.
                </p>
                <div className="pt-2">
                  <Input
                    required
                    maxLength={6}
                    placeholder="123456"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    className="font-mono text-center tracking-widest text-lg w-48 mx-auto"
                  />
                </div>
              </div>

              {error && (
                <div className="text-xs text-red-600 text-center">{error}</div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Link href="/dashboard/settings">
                  <Button type="button" variant="outline" size="sm">
                    Cancel
                  </Button>
                </Link>
                <Button type="submit" size="sm" disabled={loading || !secret}>
                  {loading ? 'Verifying...' : 'Activate 2FA'}
                </Button>
              </div>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
