import { describe, it, expect } from 'vitest';
import {
  phoneSchema,
  amountPaisaSchema,
  createPaymentSchema,
  createRefundSchema,
  createPaymentLinkSchema,
  createInvoiceSchema,
} from '../src/schemas.js';

describe('Payment Core Zod Schemas', () => {
  describe('Phone Validation (+8801[3-9]... / 01[3-9]...)', () => {
    it('accepts valid Bangladesh phone numbers', () => {
      expect(phoneSchema.parse('+8801712345678')).toBe('+8801712345678');
      expect(phoneSchema.parse('01712345678')).toBe('01712345678');
      expect(phoneSchema.parse('8801912345678')).toBe('8801912345678');
      expect(phoneSchema.parse('01312345678')).toBe('01312345678');
      expect(phoneSchema.parse('01812345678')).toBe('01812345678');
    });

    it('rejects invalid phone numbers', () => {
      expect(() => phoneSchema.parse('01212345678')).toThrow(); // 012 is invalid operator
      expect(() => phoneSchema.parse('017123456')).toThrow(); // Too short
      expect(() => phoneSchema.parse('0171234567899')).toThrow(); // Too long
      expect(() => phoneSchema.parse('not_a_phone')).toThrow();
    });
  });

  describe('Amount Paisa Schema', () => {
    it('transforms various positive amount representations to bigint', () => {
      expect(amountPaisaSchema.parse(10000n)).toBe(10000n);
      expect(amountPaisaSchema.parse(5000)).toBe(5000n);
      expect(amountPaisaSchema.parse('15075')).toBe(15075n);
    });

    it('rejects zero or negative amounts', () => {
      expect(() => amountPaisaSchema.parse(0n)).toThrow();
      expect(() => amountPaisaSchema.parse(-100n)).toThrow();
      expect(() => amountPaisaSchema.parse(0)).toThrow();
      expect(() => amountPaisaSchema.parse('abc')).toThrow();
    });
  });

  describe('Payment Creation Schema', () => {
    it('validates a complete payment request', () => {
      const input = {
        merchantId: 'mer_123',
        amountPaisa: 50000, // 500 BDT
        currency: 'BDT',
        customer: {
          name: 'Rahim Uddin',
          email: 'rahim@example.com',
          phone: '01712345678',
        },
        description: 'E-commerce checkout order #1001',
        provider: 'BKASH',
        metadata: {
          orderId: 'ord_987',
        },
      };

      const parsed = createPaymentSchema.parse(input);
      expect(parsed.amountPaisa).toBe(50000n);
      expect(parsed.currency).toBe('BDT');
      expect(parsed.customer?.name).toBe('Rahim Uddin');
    });

    it('rejects non-BDT currencies', () => {
      expect(() =>
        createPaymentSchema.parse({
          merchantId: 'mer_123',
          amountPaisa: 10000n,
          currency: 'USD',
        })
      ).toThrow();
    });
  });

  describe('Refund Creation Schema', () => {
    it('validates refund payload', () => {
      const parsed = createRefundSchema.parse({
        paymentId: 'pay_123',
        merchantId: 'mer_456',
        amountPaisa: 25000n,
        reason: 'Customer cancelled order prior to dispatch',
      });

      expect(parsed.paymentId).toBe('pay_123');
      expect(parsed.amountPaisa).toBe(25000n);
    });

    it('requires non-empty reason', () => {
      expect(() =>
        createRefundSchema.parse({
          paymentId: 'pay_123',
          merchantId: 'mer_456',
          amountPaisa: 25000n,
          reason: '   ',
        })
      ).toThrow();
    });
  });

  describe('Payment Link Schema', () => {
    it('validates payment link configuration', () => {
      const parsed = createPaymentLinkSchema.parse({
        merchantId: 'mer_123',
        title: 'Donation Link',
        slug: 'donation-campaign-2026',
        type: 'MULTI_USE',
        maxUses: 100,
      });

      expect(parsed.slug).toBe('donation-campaign-2026');
      expect(parsed.type).toBe('MULTI_USE');
    });

    it('rejects invalid slug formats', () => {
      expect(() =>
        createPaymentLinkSchema.parse({
          merchantId: 'mer_123',
          title: 'Test',
          slug: 'invalid slug with spaces!',
        })
      ).toThrow();
    });
  });

  describe('Invoice Schema & Item Total Refinement', () => {
    it('accepts invoice with correct item line totals', () => {
      const parsed = createInvoiceSchema.parse({
        merchantId: 'mer_123',
        invoiceNumber: 'INV-2026-001',
        customer: {
          name: 'Karim Ahmed',
          email: 'karim@example.com',
        },
        items: [
          {
            description: 'Item A',
            quantity: 2,
            unitPricePaisa: 5000n,
            totalPaisa: 10000n, // 2 * 5000 = 10000
          },
          {
            description: 'Item B',
            quantity: 1,
            unitPricePaisa: 3000n,
            totalPaisa: 3000n,
          },
        ],
        dueDate: new Date('2026-10-01'),
      });

      expect(parsed.invoiceNumber).toBe('INV-2026-001');
      expect(parsed.items).toHaveLength(2);
    });

    it('rejects invoice when item line total does not match quantity * unitPrice', () => {
      expect(() =>
        createInvoiceSchema.parse({
          merchantId: 'mer_123',
          invoiceNumber: 'INV-2026-002',
          customer: {
            name: 'Karim Ahmed',
            email: 'karim@example.com',
          },
          items: [
            {
              description: 'Item Bad Math',
              quantity: 3,
              unitPricePaisa: 1000n,
              totalPaisa: 2500n, // Mismatch! 3 * 1000 = 3000 != 2500
            },
          ],
          dueDate: new Date('2026-10-01'),
        })
      ).toThrow(/Line item totals do not match quantity \* unitPrice/);
    });
  });
});
