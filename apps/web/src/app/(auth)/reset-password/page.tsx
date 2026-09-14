'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { CheckCircle2, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { resetPasswordAction } from '@/lib/actions/auth.actions';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';

  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !email) {
      setError('Missing password reset token or email address. Please request a new link.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');
    const formData = new FormData();
    formData.append('email', email);
    formData.append('token', token);
    formData.append('password', password);
    formData.append('confirmPassword', confirmPassword);

    try {
      const res = await resetPasswordAction(null, formData);
      if (res?.error) {
        setError(res.error);
      } else if (res?.success) {
        setSuccess(true);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while resetting password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-xl">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl font-bold">Choose a new password</CardTitle>
        <CardDescription className="text-xs">
          Your new password must be at least 8 characters long.
        </CardDescription>
      </CardHeader>
      {success ? (
        <CardContent className="space-y-4 text-center py-6">
          <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center mx-auto text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-900 dark:text-white text-base">Password Updated</h3>
          <p className="text-xs text-slate-500">
            Your password has been successfully updated via Argon2id hashing. You may now sign in.
          </p>
          <Link href="/login" className="inline-block pt-2">
            <Button size="sm">Sign In Now</Button>
          </Link>
        </CardContent>
      ) : (
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {!token && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-600 dark:text-amber-400">
                Warning: No reset token detected in URL. Please click the link in your reset email.
              </div>
            )}
            <Input
              label="New Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
            <Input
              label="Confirm New Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={loading} className="w-full gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {loading ? 'Updating Password...' : 'Update Password'}
            </Button>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="h-10 w-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold shadow-md">
              DN
            </div>
            <span className="font-bold text-2xl text-slate-900 dark:text-white">DenaNeya</span>
          </Link>
        </div>
        <React.Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Loading reset form...</div>}>
          <ResetPasswordForm />
        </React.Suspense>
      </div>
    </div>
  );
}
