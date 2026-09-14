'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { createInvoiceAction, InvoiceItemInput } from '@/lib/actions/invoice.actions';
import { formatPaisaToBDT } from '@/lib/format';
import { Paisa } from '@denaneya/payment-core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, ArrowLeft, Loader2, Save } from 'lucide-react';
import Link from 'next/link';

interface LineItemState {
  id: string;
  description: string;
  quantity: number;
  unitPriceBDT: string;
  taxRateBps: number;
}

export default function NewInvoicePage() {
  const router = useRouter();
  const [customerName, setCustomerName] = React.useState('');
  const [customerEmail, setCustomerEmail] = React.useState('');
  const [customerPhone, setCustomerPhone] = React.useState('');
  const [dueDate, setDueDate] = React.useState(
    new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10)
  );
  const [notes, setNotes] = React.useState('');
  const [items, setItems] = React.useState<LineItemState[]>([
    { id: '1', description: 'Web Application Development', quantity: 1, unitPriceBDT: '50000', taxRateBps: 500 },
  ]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        description: '',
        quantity: 1,
        unitPriceBDT: '0',
        taxRateBps: 0,
      },
    ]);
  };

  const removeItem = (id: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const updateItem = (id: string, field: keyof LineItemState, val: any) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: val } : i))
    );
  };

  // Helper for line Paisa math
  const getLineTotals = (item: LineItemState) => {
    const qty = BigInt(Math.max(0, Math.floor(Number(item.quantity) || 0)));
    let unitPaisa = 0n;
    try {
      unitPaisa = item.unitPriceBDT ? Paisa.fromBDT(String(item.unitPriceBDT).trim()).toPaisa() : 0n;
    } catch {
      unitPaisa = 0n;
    }
    const basePaisa = qty * unitPaisa;
    const taxBps = BigInt(Math.floor(Number(item.taxRateBps) || 0));
    const taxPaisa = (basePaisa * taxBps) / 10000n;
    const totalPaisa = basePaisa + taxPaisa;
    return { basePaisa, taxPaisa, totalPaisa };
  };

  // Calculations in strict integer Paisa
  const subtotalPaisa = items.reduce((sum, item) => sum + getLineTotals(item).basePaisa, 0n);
  const taxPaisa = items.reduce((sum, item) => sum + getLineTotals(item).taxPaisa, 0n);
  const grandTotalPaisa = subtotalPaisa + taxPaisa;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payloadItems: InvoiceItemInput[] = items.map((i) => ({
        description: i.description,
        quantity: Math.max(1, Math.floor(Number(i.quantity) || 1)),
        unitPriceBDT: String(i.unitPriceBDT || '0'),
        taxRateBps: Math.floor(Number(i.taxRateBps) || 0),
      }));

      const res = await createInvoiceAction({
        customerName,
        customerEmail,
        customerPhone,
        dueDate,
        items: payloadItems,
        notes,
      });

      if (res?.invoiceId) {
        router.push(`/dashboard/invoices/${res.invoiceId}`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create invoice.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/invoices">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Create New Digital Invoice</h1>
          <p className="text-xs text-slate-500">
            Issue B2B invoices with itemized VAT breakdown and online payment link.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Customer Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Customer / Company Name *
              </label>
              <Input
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Bengal Commerce Ltd."
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Email Address *
              </label>
              <Input
                required
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="billing@company.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Phone (+880...)
              </label>
              <Input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+8801711223344"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Due Date *</label>
              <Input
                required
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Notes / Terms</label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Payment due within 7 days of invoice issue"
              />
            </div>
          </div>
        </Card>

        {/* Line Items Table */}
        <Card className="p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Itemized Line Items</h2>
            <Button type="button" onClick={addItem} variant="outline" size="sm" className="h-7 text-xs gap-1">
              <Plus className="w-3.5 h-3.5" /> Add Item
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
                <tr>
                  <th className="p-2.5 w-1/2">Description</th>
                  <th className="p-2.5 w-20">Qty</th>
                  <th className="p-2.5 w-32">Unit Price (BDT)</th>
                  <th className="p-2.5 w-28">VAT Rate</th>
                  <th className="p-2.5 w-28 text-right">Line Total</th>
                  <th className="p-2.5 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {items.map((item) => {
                  const lineTotals = getLineTotals(item);

                  return (
                    <tr key={item.id}>
                      <td className="p-2.5">
                        <Input
                          required
                          value={item.description}
                          onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                          placeholder="Service or product description"
                          className="h-8 text-xs"
                        />
                      </td>
                      <td className="p-2.5">
                        <Input
                          required
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.id, 'quantity', Math.max(1, Number(e.target.value)))}
                          className="h-8 text-xs"
                        />
                      </td>
                      <td className="p-2.5">
                        <Input
                          required
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPriceBDT}
                          onChange={(e) => updateItem(item.id, 'unitPriceBDT', e.target.value)}
                          className="h-8 text-xs"
                        />
                      </td>
                      <td className="p-2.5">
                        <select
                          value={item.taxRateBps}
                          onChange={(e) => updateItem(item.id, 'taxRateBps', Number(e.target.value))}
                          className="w-full h-8 text-xs rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-slate-900 dark:text-white"
                        >
                          <option value="0">0% (Zero)</option>
                          <option value="500">5% (Reduced)</option>
                          <option value="750">7.5% (Standard)</option>
                          <option value="1500">15% (Full VAT)</option>
                        </select>
                      </td>
                      <td className="p-2.5 text-right font-medium text-slate-800 dark:text-slate-200">
                        {formatPaisaToBDT(lineTotals.totalPaisa)}
                      </td>
                      <td className="p-2.5 text-center">
                        <button
                          type="button"
                          disabled={items.length <= 1}
                          onClick={() => removeItem(item.id)}
                          className="text-slate-400 hover:text-red-500 disabled:opacity-30 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="w-64 space-y-2 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal:</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {formatPaisaToBDT(subtotalPaisa)}
                </span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Total VAT / Tax:</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {formatPaisaToBDT(taxPaisa)}
                </span>
              </div>
              <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-800">
                <span>Total Due:</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  {formatPaisaToBDT(grandTotalPaisa)}
                </span>
              </div>
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Link href="/dashboard/invoices">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save & Issue Invoice
          </Button>
        </div>
      </form>
    </div>
  );
}
