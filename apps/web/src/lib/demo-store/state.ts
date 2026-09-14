/**
 * DenaNeya Demo Merchant Store In-Memory State Repository
 * Stores merchant orders, verification statuses, and received webhook audit events.
 */

export interface DemoOrder {
  orderId: string;
  paymentId: string;
  amountBDT: number;
  amountPaisa: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';
  apiVerified: boolean;
  webhookVerified: boolean;
  webhookReceivedAt?: string;
  verifiedAt?: string;
  provider?: string;
  providerTrxId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DemoWebhookAuditLog {
  id: string;
  receivedAt: string;
  eventType: string;
  paymentId: string;
  orderId?: string;
  signatureHeader: string;
  signatureValid: boolean;
  payloadSummary: Record<string, unknown>;
}

// Global demo store repository preserved across hot-reloads
const globalOrders = new Map<string, DemoOrder>();
const globalWebhookLogs: DemoWebhookAuditLog[] = [];

export const DEMO_MERCHANT_CONFIG = {
  merchantId: 'mch_sandbox_demo',
  apiKey: 'dn_test_sec_9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d',
  webhookSecret: 'whsec_demo_store_webhook_secret_key_2026',
  storeName: 'DenaNeya Demo Gadget Store',
  currency: 'BDT',
};

export function saveDemoOrder(order: DemoOrder): void {
  globalOrders.set(order.orderId, { ...order, updatedAt: new Date().toISOString() });
}

export function getDemoOrder(orderId: string): DemoOrder | undefined {
  return globalOrders.get(orderId);
}

export function getDemoOrderByPaymentId(paymentId: string): DemoOrder | undefined {
  for (const order of globalOrders.values()) {
    if (order.paymentId === paymentId) {
      return order;
    }
  }
  return undefined;
}

export function getAllDemoOrders(): DemoOrder[] {
  return Array.from(globalOrders.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function recordDemoWebhookLog(log: DemoWebhookAuditLog): void {
  globalWebhookLogs.unshift(log);
  if (globalWebhookLogs.length > 50) {
    globalWebhookLogs.pop();
  }
}

export function getDemoWebhookLogs(): DemoWebhookAuditLog[] {
  return [...globalWebhookLogs];
}

export function clearDemoStoreState(): void {
  globalOrders.clear();
  globalWebhookLogs.length = 0;
}
