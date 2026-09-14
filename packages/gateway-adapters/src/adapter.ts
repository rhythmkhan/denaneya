import { Paisa } from '@denaneya/payment-core';
import type {
  GatewayProvider,
  InitiatePaymentParams,
  InitiatePaymentResult,
  VerifyPaymentParams,
  VerifyPaymentResult,
  RefundParams,
  RefundResult,
  PaymentDetailsResult,
  RefundDetailsResult,
  GatewayHealthStatus,
  BaseGatewayConfig,
} from './types.js';

export interface PaymentGatewayAdapter {
  readonly provider: GatewayProvider;
  readonly supportedMethods: readonly string[];

  initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult>;
  verifyPayment(params: VerifyPaymentParams): Promise<VerifyPaymentResult>;
  refundPayment(params: RefundParams): Promise<RefundResult>;
  verifyWebhookSignature(
    headers: Record<string, string>,
    body: string | Record<string, unknown>
  ): Promise<boolean>;

  queryPayment(providerTrxId: string): Promise<PaymentDetailsResult>;
  queryRefund(refundId: string): Promise<RefundDetailsResult>;
  healthCheck(): Promise<GatewayHealthStatus>;
}

export abstract class BasePaymentGatewayAdapter<TConfig extends BaseGatewayConfig>
  implements PaymentGatewayAdapter
{
  abstract readonly provider: GatewayProvider;
  abstract readonly supportedMethods: readonly string[];

  protected readonly config: TConfig;

  constructor(config: TConfig) {
    this.config = config;
  }

  abstract initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult>;
  abstract verifyPayment(params: VerifyPaymentParams): Promise<VerifyPaymentResult>;
  abstract refundPayment(params: RefundParams): Promise<RefundResult>;
  abstract verifyWebhookSignature(
    headers: Record<string, string>,
    body: string | Record<string, unknown>
  ): Promise<boolean>;

  abstract queryPayment(providerTrxId: string): Promise<PaymentDetailsResult>;
  abstract queryRefund(refundId: string): Promise<RefundDetailsResult>;
  abstract healthCheck(): Promise<GatewayHealthStatus>;

  /**
   * Helper to format Paisa into BDT decimal string for gateways.
   * Example: 15075n paisa -> "150.75"
   * Guaranteed zero float arithmetic.
   */
  protected formatBDT(amount: Paisa): string {
    return amount.toBDT();
  }

  /**
   * Helper to parse gateway BDT decimal or integer string to Paisa.
   * Example: "150.75" -> 15075n paisa.
   */
  protected parseBDT(amountStr: string | number): Paisa {
    return Paisa.fromBDT(amountStr);
  }
}