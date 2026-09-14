import { SslCommerzAdapter } from './adapters/sslcommerz.js';
import { ShurjoPayAdapter } from './adapters/shurjopay.js';
import { AamarPayAdapter } from './adapters/aamarpay.js';
import { BkashAdapter } from './adapters/bkash.js';
import { NagadAdapter } from './adapters/nagad.js';
import { MockAdapter } from './adapters/mock.js';
import type { PaymentGatewayAdapter } from './adapter.js';
import type {
  GatewayProvider,
  GatewayConfig,
  SslCommerzConfig,
  ShurjoPayConfig,
  AamarPayConfig,
  BkashConfig,
  NagadConfig,
  MockConfig,
} from './types.js';
import { GatewayError } from './errors.js';
import { GatewayFailoverRouter, FailoverGatewayAdapter } from './failover.js';
import type { FailoverRouterConfig } from './types.js';

export class GatewayFactory {
  private static readonly instanceCache = new Map<string, PaymentGatewayAdapter>();

  /**
   * Creates or retrieves a cached adapter instance for a provider and config.
   */
  static getAdapter(
    provider: GatewayProvider,
    config: GatewayConfig,
    cacheKey?: string
  ): PaymentGatewayAdapter {
    if (cacheKey && this.instanceCache.has(cacheKey)) {
      return this.instanceCache.get(cacheKey)!;
    }

    let adapter: PaymentGatewayAdapter;

    switch (provider) {
      case 'SSLCOMMERZ':
        adapter = new SslCommerzAdapter(config as SslCommerzConfig);
        break;
      case 'SHURJOPAY':
        adapter = new ShurjoPayAdapter(config as ShurjoPayConfig);
        break;
      case 'AAMARPAY':
        adapter = new AamarPayAdapter(config as AamarPayConfig);
        break;
      case 'BKASH':
        adapter = new BkashAdapter(config as BkashConfig);
        break;
      case 'NAGAD':
        adapter = new NagadAdapter(config as NagadConfig);
        break;
      case 'MOCK':
      case 'SANDBOX' as any:
        adapter = new MockAdapter(config as MockConfig);
        break;
      default:
        throw new GatewayError({
          provider: provider as any,
          code: 'CONFIGURATION_ERROR',
          message: `Unsupported gateway provider: ${provider}`,
        });
    }

    if (cacheKey) {
      this.instanceCache.set(cacheKey, adapter);
    }

    return adapter;
  }

  /**
   * Clears the adapter cache.
   */
  static clearCache(): void {
    this.instanceCache.clear();
  }

  /**
   * Checks if an adapter is in cache.
   */
  static hasCached(cacheKey: string): boolean {
    return this.instanceCache.has(cacheKey);
  }

  /**
   * Builds provider configuration from environment variables.
   */
  static createConfigFromEnv(provider: GatewayProvider): GatewayConfig {
    const isSandboxEnv = (prefix: string) => {
      const val = process.env[`${prefix}_IS_SANDBOX`] ?? process.env.GATEWAY_IS_SANDBOX;
      if (val !== undefined) {
        const norm = val.toLowerCase().trim();
        return norm !== 'false' && norm !== '0' && norm !== 'no';
      }
      return true;
    };

    switch (provider) {
      case 'SSLCOMMERZ':
        return {
          storeId: process.env.SSLCOMMERZ_STORE_ID || '',
          storePassword:
            process.env.SSLCOMMERZ_STORE_PASSWD || process.env.SSLCOMMERZ_STORE_PASSWORD || '',
          isSandbox: isSandboxEnv('SSLCOMMERZ'),
          baseUrl: process.env.SSLCOMMERZ_BASE_URL || process.env.SSLCOMMERZ_SESSION_URL,
        } as SslCommerzConfig;
      case 'SHURJOPAY':
        return {
          username: process.env.SHURJOPAY_USERNAME || '',
          password: process.env.SHURJOPAY_PASSWORD || '',
          prefix: process.env.SHURJOPAY_PREFIX || 'NOK',
          isSandbox: isSandboxEnv('SHURJOPAY'),
          baseUrl: process.env.SHURJOPAY_BASE_URL,
        } as ShurjoPayConfig;
      case 'AAMARPAY':
        return {
          storeId: process.env.AAMARPAY_STORE_ID || '',
          signatureKey: process.env.AAMARPAY_SIGNATURE_KEY || '',
          isSandbox: isSandboxEnv('AAMARPAY'),
          baseUrl: process.env.AAMARPAY_BASE_URL,
        } as AamarPayConfig;
      case 'BKASH':
        return {
          appKey: process.env.BKASH_APP_KEY || '',
          appSecret: process.env.BKASH_APP_SECRET || '',
          username: process.env.BKASH_USERNAME || '',
          password: process.env.BKASH_PASSWORD || '',
          isSandbox: isSandboxEnv('BKASH'),
          baseUrl: process.env.BKASH_BASE_URL,
        } as BkashConfig;
      case 'NAGAD':
        return {
          merchantId: process.env.NAGAD_MERCHANT_ID || '',
          merchantPrivateKey: process.env.NAGAD_MERCHANT_PRIVATE_KEY || '',
          nagadPublicKey:
            process.env.NAGAD_PG_PUBLIC_KEY || process.env.NAGAD_PUBLIC_KEY || '',
          isSandbox: isSandboxEnv('NAGAD'),
          baseUrl: process.env.NAGAD_BASE_URL,
        } as NagadConfig;
      case 'MOCK':
        return {
          isSandbox: isSandboxEnv('MOCK'),
        } as MockConfig;
      default:
        throw new GatewayError({
          provider: provider as any,
          code: 'CONFIGURATION_ERROR',
          message: `Cannot create env config for unsupported gateway provider: ${provider}`,
        });
    }
  }

  /**
   * Retrieves an adapter configured from environment variables.
   */
  static getAdapterFromEnv(provider: GatewayProvider, cacheKey?: string): PaymentGatewayAdapter {
    const config = this.createConfigFromEnv(provider);
    return this.getAdapter(provider, config, cacheKey);
  }

  /**
   * Creates a GatewayFailoverRouter instance.
   */
  static getFailoverRouter(
    config: FailoverRouterConfig = {},
    adapters?: Map<GatewayProvider, PaymentGatewayAdapter> | Record<string, PaymentGatewayAdapter>
  ): GatewayFailoverRouter {
    return new GatewayFailoverRouter(config, adapters);
  }

  /**
   * Creates a FailoverGatewayAdapter instance.
   */
  static createFailoverAdapter(
    config: FailoverRouterConfig = {},
    adapters?: Map<GatewayProvider, PaymentGatewayAdapter> | Record<string, PaymentGatewayAdapter>
  ): FailoverGatewayAdapter {
    const router = new GatewayFailoverRouter(config, adapters);
    return new FailoverGatewayAdapter(router);
  }
}