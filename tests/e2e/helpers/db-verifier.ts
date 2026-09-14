import { eq, and } from 'drizzle-orm';
import { db } from '../../../packages/database/src/client.js';
import {
  payments,
  merchants,
  devices,
  outboxEvents,
  mfsSmsEvents,
  ledgerTransactions,
  ledgerEntries,
} from '../../../packages/database/src/schema/index.js';

export class DbVerifier {
  public static async getPayment(paymentId: string) {
    if (!db) return null;
    try {
      const rows = await db.select().from(payments).where(eq(payments.id, paymentId));
      return rows[0] || null;
    } catch {
      return null;
    }
  }

  public static async getPaymentByIdempotencyKey(merchantId: string, idempotencyKey: string) {
    if (!db) return null;
    try {
      const rows = await db
        .select()
        .from(payments)
        .where(and(eq(payments.merchantId, merchantId), eq(payments.idempotencyKey, idempotencyKey)));
      return rows[0] || null;
    } catch {
      return null;
    }
  }

  public static async getMerchant(merchantId: string) {
    if (!db) return null;
    try {
      const rows = await db.select().from(merchants).where(eq(merchants.id, merchantId));
      return rows[0] || null;
    } catch {
      return null;
    }
  }

  public static async getDevice(deviceId: string) {
    if (!db) return null;
    try {
      const rows = await db.select().from(devices).where(eq(devices.id, deviceId));
      return rows[0] || null;
    } catch {
      return null;
    }
  }

  public static async getOutboxEvents(paymentId: string) {
    if (!db) return [];
    try {
      return await db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, paymentId));
    } catch {
      return [];
    }
  }

  public static async getSmsEventByHash(dedupHash: string) {
    if (!db) return null;
    try {
      const rows = await db.select().from(mfsSmsEvents).where(eq(mfsSmsEvents.dedupHash, dedupHash));
      return rows[0] || null;
    } catch {
      return null;
    }
  }

  public static async getLedgerEntries(transactionId: string) {
    if (!db) return [];
    try {
      return await db.select().from(ledgerEntries).where(eq(ledgerEntries.transactionId, transactionId));
    } catch {
      return [];
    }
  }
}
