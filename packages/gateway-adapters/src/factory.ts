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
}