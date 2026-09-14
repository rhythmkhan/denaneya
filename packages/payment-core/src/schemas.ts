/**
 * DenaNeya Payment Core Zod Schemas
 */

import { z } from 'zod';
import { PAYMENT_STATES } from './types.js';

// --- Reusable Field Primitives ---

/**
 * Exact Bangladesh Mobile Phone Regex:
 * Matches: "+8801712345678", "8801712345678", "01712345678", "01912345678"
 * Operators: 013, 014, 015, 016, 017, 018, 019.
 */
export const bdPhoneRegex = /^(?:\+?880|0)?1[3-9]\d{8}$/;

export const phoneSchema = z
  .string()
  .trim()
  .regex(bdPhoneRegex, {
    message:
      'Invalid Bangladesh mobile number format (expected 11 digits: e.g. 017XXXXXXXX or +88017XXXXXXXX)',
  });

/**
 * Bigint amount schema in Paisa.
 * Accepts bigint, positive integer number, or numeric string of digits; transforms into bigint.
 */
export const amountPaisaSchema = z
  .union([
    z.bigint(),
    z.number().int().positive(),
    z.string().regex(/^\d+$/, { message: 'Paisa string must contain only digits' }),
  ])
  .transform((val) => {
    if (typeof val === 'bigint') return val;
    if (typeof val === 'number') {
      if (!Number.isSafeInteger(val) || val <= 0) {
        throw new Error('Amount must be a positive safe integer');
      }
      return BigInt(val);
    }
    return BigInt(val);
  })
  .refine((val) => val > 0n, {
    message: 'Amount must be strictly greater than 0 paisa',
  });

export const currencySchema = z.literal('BDT');

export const metadataSchema = z
  .record(
    z.string().max(64),
    z.union([z.string().max(500), z.number(), z.boolean(), z.null()])
  )
  .optional()
  .refine((obj) => !obj || Object.keys(obj).length <= 50, {
    message: 'Metadata cannot exceed 50 key-value pairs',
  });

export const paymentStatusSchema = z.enum(PAYMENT_STATES);

export const providerEnumSchema = z.enum([
  'BKASH',
  'NAGAD',
  'ROCKET',
  'UPAY',
  'SSLCOMMERZ',
  'SHURJOPAY',
  'AAMARPAY',
  'SANDBOX',
]);

// --- Customer Schema ---

export const customerAddressSchema = z.object({
  street: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().length(2).default('BD'),
});

export const customerSchema = z.object({
  name: z.string().trim().min(1, 'Customer name is required').max(100),
  email: z.string().trim().email('Invalid email address'),
  phone: phoneSchema.optional(),
  billingAddress: customerAddressSchema.optional(),
});

// --- Payment Creation Schema ---

export const createPaymentSchema = z.object({
  merchantId: z.string().min(1, 'Merchant ID is required'),
  amountPaisa: amountPaisaSchema,
  currency: currencySchema.default('BDT'),
  idempotencyKey: z.string().trim().min(1).max(128).optional(),
  customer: customerSchema.optional(),
  description: z.string().trim().max(500).optional(),
  provider: providerEnumSchema.optional(),
  paymentLinkId: z.string().optional(),
  invoiceId: z.string().optional(),
  redirectUrl: z.string().url('Invalid redirect URL').optional(),
  metadata: metadataSchema,
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

// --- Refund Creation Schema ---

export const createRefundSchema = z.object({
  paymentId: z.string().min(1, 'Payment ID is required'),
  merchantId: z.string().min(1, 'Merchant ID is required'),
  amountPaisa: amountPaisaSchema,
  currency: currencySchema.default('BDT'),
  reason: z.string().trim().min(1, 'Refund reason is required').max(500),
  idempotencyKey: z.string().trim().min(1).max(128).optional(),
  metadata: metadataSchema,
});

export type CreateRefundInput = z.infer<typeof createRefundSchema>;

// --- Payment Link Schema ---

export const createPaymentLinkSchema = z.object({
  merchantId: z.string().min(1, 'Merchant ID is required'),
  title: z.string().trim().min(1, 'Title is required').max(255),
  description: z.string().trim().max(1000).optional(),
  slug: z
    .string()
    .trim()
    .min(3, 'Slug must be at least 3 characters')
    .max(64)
    .regex(/^[a-z0-9-_]+$/i, 'Slug must contain only alphanumeric characters, dashes, and underscores')
    .optional(),
  amountPaisa: amountPaisaSchema.optional(), // NULL allows customer-specified amount
  currency: currencySchema.default('BDT'),
  type: z.enum(['SINGLE_USE', 'MULTI_USE']).default('SINGLE_USE'),
  maxUses: z.number().int().positive().default(1),
  expiresAt: z.coerce.date().optional(),
  allowedProviders: z.array(providerEnumSchema).default(['BKASH', 'NAGAD', 'ROCKET', 'SSLCOMMERZ']),
  redirectUrl: z.string().url('Invalid redirect URL').optional(),
  metadata: metadataSchema,
});

export type CreatePaymentLinkInput = z.infer<typeof createPaymentLinkSchema>;

// --- Invoice Item & Invoice Schema ---

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1, 'Item description is required').max(255),
  quantity: z.number().int().positive('Quantity must be at least 1').default(1),
  unitPricePaisa: z.bigint().nonnegative('Unit price cannot be negative'),
  taxRateBps: z.number().int().min(0).max(10000).default(0), // 0 to 100% in bps
  totalPaisa: z.bigint().nonnegative('Item total cannot be negative'),
});

export const createInvoiceSchema = z
  .object({
    merchantId: z.string().min(1, 'Merchant ID is required'),
    invoiceNumber: z.string().trim().min(1, 'Invoice number is required').max(64),
    customer: customerSchema,
    items: z.array(invoiceItemSchema).min(1, 'Invoice must have at least one line item'),
    currency: currencySchema.default('BDT'),
    taxPaisa: z.bigint().nonnegative().default(0n),
    discountPaisa: z.bigint().nonnegative().default(0n),
    dueDate: z.coerce.date(),
    notes: z.string().trim().max(1000).optional(),
    metadata: metadataSchema,
  })
  .refine(
    (inv) => {
      // Validate item arithmetic consistency: quantity * unitPrice == total
      for (const item of inv.items) {
        const expectedTotal = BigInt(item.quantity) * item.unitPricePaisa;
        if (item.totalPaisa !== expectedTotal) {
          return false;
        }
      }
      return true;
    },
    { message: 'Line item totals do not match quantity * unitPrice' }
  );

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
