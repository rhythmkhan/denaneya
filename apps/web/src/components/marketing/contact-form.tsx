'use client';

import * as React from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2, Send } from 'lucide-react';

const contactSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Please enter a valid business email address'),
  phone: z.string().regex(/^(\+8801|01)[3-9]\d{8}$/, 'Must be a valid Bangladesh phone number (017...)'),
  companyName: z.string().min(2, 'Company name is required'),
  monthlyVolume: z.string().min(1, 'Please select estimated monthly volume'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
});

type ContactFormData = z.infer<typeof contactSchema>;

export function ContactForm() {
  const [formData, setFormData] = React.useState<ContactFormData>({
    fullName: '',
    email: '',
    phone: '',
    companyName: '',
    monthlyVolume: 'BDT 500K - 2M',
    message: '',
  });

  const [errors, setErrors] = React.useState<Partial<Record<keyof ContactFormData, string>>>({});
  const [submitted, setSubmitted] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    const result = contactSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof ContactFormData, string>> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof ContactFormData;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      setLoading(false);
      return;
    }

    // Simulate submission delay
    await new Promise((r) => setTimeout(r, 600));
    setLoading(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="p-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white">
          Message Received
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
          Thank you for reaching out, {formData.fullName}. Our enterprise onboarding team in Dhaka will contact you within 2 business hours.
        </p>
        <Button variant="outline" onClick={() => setSubmitted(false)} className="mt-4">
          Send Another Message
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Full Name"
          placeholder="e.g. Tanvir Ahmed"
          value={formData.fullName}
          onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
          error={errors.fullName}
          required
        />
        <Input
          label="Work Email"
          type="email"
          placeholder="tanvir@company.com.bd"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          error={errors.email}
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Mobile Phone (+880)"
          placeholder="01712345678"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          error={errors.phone}
          required
        />
        <Input
          label="Company / Merchant Name"
          placeholder="e.g. Shwapno Logistics"
          value={formData.companyName}
          onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
          error={errors.companyName}
          required
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Estimated Monthly Processing Volume
        </label>
        <select
          value={formData.monthlyVolume}
          onChange={(e) => setFormData({ ...formData, monthlyVolume: e.target.value })}
          className="w-full h-10 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="Under BDT 500K">Under ৳ 5,00,000 / month</option>
          <option value="BDT 500K - 2M">৳ 5,00,000 – ৳ 20,00,000 / month</option>
          <option value="BDT 2M - 10M">৳ 20,00,000 – ৳ 1,00,00,000 / month</option>
          <option value="Over BDT 10M">Enterprise (Over ৳ 1,00,00,000 / month)</option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          How can we help your business?
        </label>
        <textarea
          rows={4}
          value={formData.message}
          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
          placeholder="Tell us about your payment integration requirements, expected MFS/Card mix, or custom settlement needs..."
          className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          required
        />
        {errors.message && <p className="text-xs text-red-500">{errors.message}</p>}
      </div>

      <Button type="submit" disabled={loading} className="w-full sm:w-auto gap-2">
        {loading ? 'Sending...' : 'Submit Inquiry'} <Send className="w-4 h-4" />
      </Button>
    </form>
  );
}
