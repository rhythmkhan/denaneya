'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { sendInvoiceAction } from '@/lib/actions/invoice.actions';
import { Printer, Send, Check, Loader2 } from 'lucide-react';

export function InvoiceActionsClient({
  invoiceId,
  invoiceNumber: _invoiceNumber,
}: {
  invoiceId: string;
  invoiceNumber: string;
}) {
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleSendReminder = async () => {
    setSending(true);
    try {
      await sendInvoiceAction(invoiceId);
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch (err) {
      console.error('Failed to send reminder', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5 text-xs">
        <Printer className="w-3.5 h-3.5" /> Print / PDF
      </Button>
      <Button
        size="sm"
        onClick={handleSendReminder}
        disabled={sending || sent}
        className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
      >
        {sending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : sent ? (
          <Check className="w-3.5 h-3.5" />
        ) : (
          <Send className="w-3.5 h-3.5" />
        )}
        {sent ? 'Reminder Sent' : 'Send Reminder'}
      </Button>
    </div>
  );
}
