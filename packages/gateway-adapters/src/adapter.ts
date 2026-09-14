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

  /**
   * Resolves whether the adapter is operating in Sandbox or Live Production mode.
   * Priority:
   * 1. Environment variable `{PROVIDER}_IS_SANDBOX` (e.g. `BKASH_IS_SANDBOX=false` -> false)
   * 2. Global environment variable `GATEWAY_IS_SANDBOX`
   * 3. Config property `config.isSandbox`
   * 4. Config alias `config.sandbox`
   * 5. Safe default: true (sandbox)
   */
  public get isSandbox(): boolean {
    const parseBool = (val: string | undefined): boolean | undefined => {
      if (val === undefined) return undefined;
      const normalized = val.toLowerCase().trim();
      if (
        normalized === 'false' ||
        normalized === '0' ||
        normalized === 'no' ||
        normalized === 'off' ||
        normalized === 'live' ||
        normalized === 'production'
      ) {
        return false;
      }
      if (
        normalized === 'true' ||
        normalized === '1' ||
        normalized === 'yes' ||
        normalized === 'on' ||
        normalized === 'sandbox'
      ) {
        return true;
      }
      return undefined;
    };

    const prov = this.provider;
    const provUnderscore =
      prov === 'SHURJOPAY'
        ? 'SHURJO_PAY'
        : prov === 'AAMARPAY'
          ? 'AAMAR_PAY'
          : prov === 'SSLCOMMERZ'
            ? 'SSL_COMMERZ'
            : prov;

    const providerEnv =
      process.env[`${prov}_IS_SANDBOX`] ??
      process.env[`${prov}_SANDBOX`] ??
      process.env[`${provUnderscore}_IS_SANDBOX`] ??
      process.env[`${provUnderscore}_SANDBOX`];

    const parsedProviderEnv = parseBool(providerEnv);
    if (parsedProviderEnv !== undefined) {
      return parsedProviderEnv;
    }

    if (this.config.isSandbox !== undefined) {
      return Boolean(this.config.isSandbox);
    }
    if (this.config.sandbox !== undefined) {
      return Boolean(this.config.sandbox);
    }

    const globalEnv = process.env.GATEWAY_IS_SANDBOX ?? process.env.GATEWAY_SANDBOX;
    const parsedGlobalEnv = parseBool(globalEnv);
    if (parsedGlobalEnv !== undefined) {
      return parsedGlobalEnv;
    }

    return true;
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