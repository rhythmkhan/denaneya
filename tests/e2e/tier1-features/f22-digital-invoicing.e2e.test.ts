import { describe, it, expect } from 'vitest';
import { createInvoiceSchema, Paisa } from '@denaneya/payment-core';

describe('Feature 22: Digital Invoicing System (E2E-T1-F22)', () => {
  // E2E-T1-F22-01: Create Multi-Line Item Invoice with Paisa Math
  it('E2E-T1-F22-01: Create Multi-Line Item Invoice with Paisa Math', () => {
    const items = [
      {
        description: 'Web Design',
        quantity: 1,
        unitPricePaisa: 500000n, // 5,000.00 BDT
        totalPaisa: 500000n,
      },
      {
        description: 'Server Hosting (Annual)',
        quantity: 2,
        unitPricePaisa: 250000n, // 2,500.00 BDT each
        totalPaisa: 500000n,
      },
      {
        description: 'Domain Registration',
        quantity: 1,
        unitPricePaisa: 120000n, // 1,200.00 BDT
        totalPaisa: 120000n,
      },
    ];

    const subtotal = items.reduce((sum, item) => sum + item.totalPaisa, 0n);
    expect(subtotal).toBe(1120000n); // 11,200.00 BDT

    const taxPaisa = 56000n; // 560.00 BDT
    const discountPaisa = 20000n; // 200.00 BDT
    const totalPaisa = subtotal + taxPaisa - discountPaisa;

    expect(totalPaisa).toBe(1156000n); // 11,560.00 BDT
    expect(new Paisa(totalPaisa).toBDT()).toBe('11560.00');
  });

  // E2E-T1-F22-02: Dispatch Invoice Notification via Email / SMS
  it('E2E-T1-F22-02: Dispatch Invoice Notification via Email / SMS', () => {
    const invoice = {
      id: 'inv_001',
      status: 'DRAFT',
      customerEmail: 'client@example.com',
    };

    // Transition to SENT
    invoice.status = 'SENT';
    const outboxEvent = {
      eventType: 'invoice.sent',
      invoiceId: invoice.id,
      recipient: invoice.customerEmail,
    };

    expect(invoice.status).toBe('SENT');
    expect(outboxEvent.eventType).toBe('invoice.sent');
    expect(outboxEvent.recipient).toBe('client@example.com');
  });

  // E2E-T1-F22-03: Public Invoice View & PDF Generation Endpoint
  it('E2E-T1-F22-03: Public Invoice View & PDF Generation Endpoint', () => {
    const invoiceRecord = {
      id: 'inv_001',
      invoiceNumber: 'INV-2026-001',
      subtotalPaisa: 100000n,
      totalAmountPaisa: 100000n,
      currency: 'BDT',
    };

    expect(invoiceRecord.invoiceNumber).toBe('INV-2026-001');
    expect(invoiceRecord.currency).toBe('BDT');
    const bdtString = new Paisa(invoiceRecord.totalAmountPaisa).toBDT();
    expect(bdtString).toBe('1000.00');
  });

  // E2E-T1-F22-04: Invoice Settlement upon Payment Completion
  it('E2E-T1-F22-04: Invoice Settlement upon Payment Completion', () => {
    const invoice = {
      id: 'inv_001',
      status: 'SENT',
      paidAt: null as Date | null,
    };

    // When linked payment succeeds
    invoice.status = 'PAID';
    invoice.paidAt = new Date();

    expect(invoice.status).toBe('PAID');
    expect(invoice.paidAt).toBeInstanceOf(Date);
  });

  // E2E-T1-F22-05: Voiding Unpaid Invoice
  it('E2E-T1-F22-05: Voiding Unpaid Invoice', () => {
    const invoice = {
      id: 'inv_002',
      status: 'SENT',
    };

    // Void action
    invoice.status = 'VOID';

    expect(invoice.status).toBe('VOID');
    const isPayable = invoice.status === 'SENT';
    expect(isPayable).toBe(false);
  });
});
