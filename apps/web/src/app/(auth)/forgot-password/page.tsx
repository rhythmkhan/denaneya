'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
import { requestPasswordResetAction } from '@/lib/actions/auth.actions';

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const formData = new FormData();
    formData.append('email', email);
    try {
      const res = await requestPasswordResetAction(null, formData);
      if (res?.error) {
        setError(res.error);
      } else {
        setSubmitted(true);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send password reset link.');
    } finally {
      setLoading(false);
    }
  };

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

        <Card className="border-slate-200 dark:border-slate-800 shadow-xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl font-bold">Reset your password</CardTitle>
            <CardDescription className="text-xs">
              Enter your registered email address to receive password reset instructions.
            </CardDescription>
          </CardHeader>
          {submitted ? (
            <CardContent className="space-y-4 text-center py-6">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center mx-auto text-emerald-600">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">Check Your Inbox</h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                If an account exists for <strong>{email}</strong>, we have sent a secure password reset link valid for 1 hour.
              </p>
              <Link href="/login" className="inline-block pt-2">
                <Button variant="outline" size="sm" className="gap-2">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
                </Button>
              </Link>
            </CardContent>
          ) : (
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">
                {error && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
                    {error}
                  </div>
                )}
                <Input
                  label="Email Address"
                  type="email"
                  placeholder="merchant@company.com.bd"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </CardContent>
              <CardFooter className="flex flex-col space-y-4">
                <Button type="submit" disabled={loading} className="w-full gap-2">
                  <Mail className="w-4 h-4" />
                  {loading ? 'Sending Link...' : 'Send Reset Link'}
                </Button>
                <div className="text-center text-xs text-slate-500">
                  Remember your password?{' '}
                  <Link href="/login" className="text-emerald-600 font-semibold hover:underline">
                    Sign In
                  </Link>
                </div>
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
