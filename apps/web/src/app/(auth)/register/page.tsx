'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { registerMerchantAction } from '@/lib/actions/auth.actions';
import { UserPlus, ShieldCheck } from 'lucide-react';

export default function RegisterPage() {
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    try {
      const res = await registerMerchantAction(null, formData);
      if (res?.error) {
        setError(res.error);
        setLoading(false);
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('NEXT_REDIRECT')) {
        setError(err.message);
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 py-12">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="h-10 w-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold shadow-md">
              DN
            </div>
            <span className="font-bold text-2xl text-slate-900 dark:text-white">DenaNeya</span>
          </Link>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium font-bengali">
            দেনা-নেওয়া সহজ, হিসাব নিশ্চিত
          </p>
        </div>

        <Card className="border-slate-200 dark:border-slate-800 shadow-xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl font-bold">Register Merchant Account</CardTitle>
            <CardDescription className="text-xs">
              Instant sandbox activation with test keys and simulator access.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Administrator Name"
                  name="name"
                  placeholder="Arif Chowdhury"
                  required
                />
                <Input
                  label="Work Email"
                  name="email"
                  type="email"
                  placeholder="arif@company.com.bd"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Mobile Phone (+880)"
                  name="phone"
                  placeholder="01711223344"
                  required
                />
                <Input
                  label="Password (min 8 chars)"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                />
              </div>

              <div className="space-y-1">
                <Input
                  label="Registered Business Name"
                  name="businessName"
                  placeholder="e.g. Dhaka Artisan Silk Ltd."
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Business Entity Type
                </label>
                <select
                  name="businessType"
                  className="w-full h-10 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="INDIVIDUAL">Individual / Freelancer</option>
                  <option value="SOLE_PROPRIETORSHIP">Sole Proprietorship (একমালিকানা)</option>
                  <option value="PARTNERSHIP">Partnership Firm</option>
                  <option value="PRIVATE_LIMITED">Private Limited Company</option>
                  <option value="PUBLIC_LIMITED">Public Limited Company</option>
                </select>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-start gap-2 text-xs text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  By registering, you acknowledge that DenaNeya operates in SOFTWARE/ORCHESTRATION mode and does not hold merchant deposits or custodial funds.
                </span>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <Button type="submit" disabled={loading} className="w-full gap-2">
                <UserPlus className="w-4 h-4" />
                {loading ? 'Creating Account...' : 'Create Merchant Account'}
              </Button>
              <div className="text-center text-xs text-slate-500">
                Already have an account?{' '}
                <Link href="/login" className="text-emerald-600 font-semibold hover:underline">
                  Sign In
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
