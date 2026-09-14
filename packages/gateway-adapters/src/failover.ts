import { GatewayError } from './errors.js';
import type { PaymentGatewayAdapter } from './adapter.js';
import type {
  GatewayProvider,
  GatewayHealthStatus,
  GatewayHealthState,
  FailoverRouterConfig,
  GatewayFailoverExecutionResult,
  InitiatePaymentParams,
  InitiatePaymentResult,
  VerifyPaymentParams,
  VerifyPaymentResult,
  RefundParams,
  RefundResult,
  PaymentDetailsResult,
  RefundDetailsResult,
  PaymentMethodType,
} from './types.js';

export class GatewayFailoverRouter {
  private readonly config: Required<
    Omit<FailoverRouterConfig, 'methodRouting' | 'fallbackProviders' | 'primaryProvider'>
  > & {
    primaryProvider: GatewayProvider;
    fallbackProviders: GatewayProvider[];
    methodRouting: Partial<Record<PaymentMethodType, GatewayProvider[]>>;
  };

  private readonly adapters = new Map<GatewayProvider, PaymentGatewayAdapter>();
  private readonly healthStates = new Map<GatewayProvider, GatewayHealthState>();

  constructor(
    config: FailoverRouterConfig = {},
    adapters: Map<GatewayProvider, PaymentGatewayAdapter> | Record<string, PaymentGatewayAdapter> = new Map()
  ) {
    this.config = {
      primaryProvider: config.primaryProvider ?? 'SSLCOMMERZ',
      fallbackProviders: config.fallbackProviders ?? ['SHURJOPAY', 'AAMARPAY'],
      methodRouting: config.methodRouting ?? {
        CARDS: ['SSLCOMMERZ', 'SHURJOPAY', 'AAMARPAY'],
        BKASH: ['BKASH', 'SSLCOMMERZ', 'SHURJOPAY'],
        NAGAD: ['NAGAD', 'SSLCOMMERZ', 'SHURJOPAY'],
        ROCKET: ['SSLCOMMERZ', 'SHURJOPAY', 'AAMARPAY'],
        UPAY: ['SSLCOMMERZ', 'SHURJOPAY', 'AAMARPAY'],
        INTERNET_BANKING: ['SSLCOMMERZ', 'SHURJOPAY', 'AAMARPAY'],
        ALL: ['SSLCOMMERZ', 'SHURJOPAY', 'AAMARPAY'],
      },
      failureThreshold: config.failureThreshold ?? 3,
      degradedThreshold: config.degradedThreshold ?? 2,
      recoveryCooldownMs: config.recoveryCooldownMs ?? 30_000,
      successThresholdForRecovery: config.successThresholdForRecovery ?? 2,
      failoverOnDegraded: config.failoverOnDegraded ?? true,
      maxFailoverAttempts: config.maxFailoverAttempts ?? 3,
    };

    if (adapters instanceof Map) {
      for (const [provider, adapter] of adapters.entries()) {
        this.registerAdapter(provider, adapter);
      }
    } else if (adapters && typeof adapters === 'object') {
      for (const [provider, adapter] of Object.entries(adapters)) {
        this.registerAdapter(provider as GatewayProvider, adapter);
      }
    }
  }

  registerAdapter(provider: GatewayProvider, adapter: PaymentGatewayAdapter): this {
    this.adapters.set(provider, adapter);
    if (!this.healthStates.has(provider)) {
      this.healthStates.set(provider, {
        provider,
        status: 'UP',
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
      });
    }
    return this;
  }

  getAdapter(provider: GatewayProvider): PaymentGatewayAdapter | undefined {
    return this.adapters.get(provider);
  }

  getHealthState(provider: GatewayProvider): GatewayHealthState {
    let state = this.healthStates.get(provider);
    if (!state) {
      state = {
        provider,
        status: 'UP',
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
      };
      this.healthStates.set(provider, state);
    }
    return state;
  }

  getAllHealthStates(): GatewayHealthState[] {
    return Array.from(this.healthStates.values());
  }

  setGatewayStatus(
    provider: GatewayProvider,
    status: 'UP' | 'DEGRADED' | 'DOWN',
    message?: string
  ): void {
    const state = this.getHealthState(provider);
    state.status = status;
    state.lastError = message ?? (status === 'UP' ? undefined : state.lastError);
    if (status === 'UP') {
      state.consecutiveFailures = 0;
      state.lastSuccessTime = Date.now();
    } else if (status === 'DOWN') {
      state.consecutiveSuccesses = 0;
      state.lastFailureTime = Date.now();
    }
  }

  recordFailure(provider: GatewayProvider, error?: unknown, latencyMs?: number): void {
    const state = this.getHealthState(provider);
    state.consecutiveFailures += 1;
    state.consecutiveSuccesses = 0;
    state.lastFailureTime = Date.now();
    state.latencyMs = latencyMs ?? state.latencyMs;

    if (error instanceof Error) {
      state.lastError = error.message;
    } else if (typeof error === 'string') {
      state.lastError = error;
    }

    if (state.consecutiveFailures >= this.config.failureThreshold) {
      state.status = 'DOWN';
    } else if (state.consecutiveFailures >= this.config.degradedThreshold) {
      state.status = 'DEGRADED';
    }
  }

  recordSuccess(provider: GatewayProvider, latencyMs?: number): void {
    const state = this.getHealthState(provider);
    state.consecutiveSuccesses += 1;
    state.consecutiveFailures = 0;
    state.lastSuccessTime = Date.now();
    state.latencyMs = latencyMs ?? state.latencyMs;

    if (
      (state.status === 'DOWN' || state.status === 'DEGRADED') &&
      state.consecutiveSuccesses >= this.config.successThresholdForRecovery
    ) {
      state.status = 'UP';
      state.lastError = undefined;
    }
  }

  /**
   * Checks if a provider is eligible for receiving traffic.
   * If a gateway is DOWN, allows half-open probing once recoveryCooldownMs has elapsed.
   */
  isProviderAvailable(provider: GatewayProvider): boolean {
    const state = this.getHealthState(provider);

    if (state.status === 'UP') {
      return true;
    }

    if (state.status === 'DEGRADED') {
      if (!this.config.failoverOnDegraded) {
        return true;
      }
      // If failoverOnDegraded is true, only use DEGRADED if no UP gateway exists
      const hasUpGateway = Array.from(this.healthStates.values()).some((s) => s.status === 'UP');
      return !hasUpGateway;
    }

    if (state.status === 'DOWN') {
      // Check cooldown window for half-open auto-recovery probe
      if (state.lastFailureTime) {
        const elapsed = Date.now() - state.lastFailureTime;
        if (elapsed >= this.config.recoveryCooldownMs) {
          return true; // Eligible for half-open recovery attempt
        }
      }
      return false;
    }

    return false;
  }

  /**
   * Determines prioritized provider list for request execution.
   */
  getRoutingOrder(
    preferredProvider?: GatewayProvider,
    method?: PaymentMethodType
  ): GatewayProvider[] {
    const order: GatewayProvider[] = [];

    if (preferredProvider) {
      order.push(preferredProvider);
    }

    if (method && this.config.methodRouting[method]) {
      for (const p of this.config.methodRouting[method]!) {
        if (!order.includes(p)) {
          order.push(p);
        }
      }
    }

    if (!order.includes(this.config.primaryProvider)) {
      order.push(this.config.primaryProvider);
    }

    for (const p of this.config.fallbackProviders) {
      if (!order.includes(p)) {
        order.push(p);
      }
    }

    return order;
  }

  /**
   * Selects the highest-priority healthy gateway.
   */
  selectHealthyProvider(
    preferredProvider?: GatewayProvider,
    method?: PaymentMethodType
  ): { provider: GatewayProvider; adapter: PaymentGatewayAdapter } {
    const routingOrder = this.getRoutingOrder(preferredProvider, method);

    // 1. Try healthy 'UP' gateways in priority order
    for (const provider of routingOrder) {
      const state = this.getHealthState(provider);
      const adapter = this.adapters.get(provider);
      if (adapter && state.status === 'UP') {
        return { provider, adapter };
      }
    }

    // 2. Try DEGRADED or half-open probing gateways
    for (const provider of routingOrder) {
      const adapter = this.adapters.get(provider);
      if (adapter && this.isProviderAvailable(provider)) {
        return { provider, adapter };
      }
    }

    // 3. If any adapter is registered regardless of state, select first as last resort
    for (const provider of routingOrder) {
      const adapter = this.adapters.get(provider);
      if (adapter) {
        return { provider, adapter };
      }
    }

    throw new GatewayError({
      provider: preferredProvider || this.config.primaryProvider,
      code: 'GATEWAY_UNAVAILABLE',
      message: 'No healthy or registered payment gateway adapter available',
      httpStatus: 503,
      isRetryable: true,
    });
  }

  /**
   * Executes an operation with automated gateway failover and health tracking.
   */
  async executeWithFailover<T>(
    operation: (adapter: PaymentGatewayAdapter, provider: GatewayProvider) => Promise<T>,
    options: {
      preferredProvider?: GatewayProvider;
      method?: PaymentMethodType;
      maxAttempts?: number;
    } = {}
  ): Promise<GatewayFailoverExecutionResult<T>> {
    const routingOrder = this.getRoutingOrder(options.preferredProvider, options.method);
    const maxAttempts = Math.min(
      options.maxAttempts ?? this.config.maxFailoverAttempts,
      routingOrder.length
    );

    const expectedPrimary = options.preferredProvider || this.config.primaryProvider;
    const errors: Array<{ provider: GatewayProvider; error: unknown }> = [];
    let attempts = 0;
    let initialProvider: GatewayProvider | null = null;

    // Filter candidate providers that have registered adapters
    const candidateProviders = routingOrder.filter((p) => this.adapters.has(p));

    if (candidateProviders.length === 0) {
      throw new GatewayError({
        provider: options.preferredProvider || this.config.primaryProvider,
        code: 'CONFIGURATION_ERROR',
        message: 'No registered adapters available for routing',
        httpStatus: 500,
      });
    }

    // Score candidate providers: UP (3), DEGRADED (2), DOWN with elapsed cooldown (1), DOWN active cooldown (0)
    const scoreProvider = (p: GatewayProvider) => {
      const state = this.getHealthState(p);
      if (state.status === 'UP') return 3;
      if (state.status === 'DEGRADED') return 2;
      if (this.isProviderAvailable(p)) return 1;
      return 0;
    };

    const availableCandidates = candidateProviders
      .filter((p) => this.isProviderAvailable(p))
      .sort((a, b) => scoreProvider(b) - scoreProvider(a));

    const unavailableCandidates = candidateProviders
      .filter((p) => !this.isProviderAvailable(p))
      .sort((a, b) => scoreProvider(b) - scoreProvider(a));

    const sortedCandidates = [...availableCandidates, ...unavailableCandidates];

    for (const provider of sortedCandidates) {
      if (attempts >= maxAttempts) {
        break;
      }

      attempts += 1;
      if (!initialProvider) {
        initialProvider = provider;
      }

      const adapter = this.adapters.get(provider)!;
      const start = performance.now();

      try {
        const result = await operation(adapter, provider);
        const latencyMs = Math.round(performance.now() - start);
        this.recordSuccess(provider, latencyMs);

        const failoverOccurred = provider !== expectedPrimary || initialProvider !== provider;
        return {
          result,
          providerUsed: provider,
          failoverOccurred,
          attempts,
          errors: errors.length > 0 ? errors : undefined,
        };
      } catch (err: any) {
        const latencyMs = Math.round(performance.now() - start);
        this.recordFailure(provider, err, latencyMs);
        errors.push({ provider, error: err });

        // Non-retryable client errors (e.g. INVALID_REQUEST, PAYMENT_DECLINED, AMOUNT_MISMATCH)
        // should fail fast without failover unless it is an upstream gateway connectivity issue
        const isFailoverEligible =
          err instanceof GatewayError
            ? err.isRetryable ||
              err.code === 'GATEWAY_UNAVAILABLE' ||
              err.code === 'NETWORK_TIMEOUT' ||
              err.code === 'INTERNAL_GATEWAY_ERROR' ||
              err.code === 'RATE_LIMIT_EXCEEDED'
            : true;

        if (!isFailoverEligible || attempts >= maxAttempts) {
          throw err;
        }
      }
    }

    const lastError = errors[errors.length - 1]?.error;
    if (lastError instanceof Error) {
      throw lastError;
    }

    throw new GatewayError({
      provider: initialProvider || this.config.primaryProvider,
      code: 'GATEWAY_UNAVAILABLE',
      message: `All gateway failover attempts failed (${attempts} attempts tried)`,
      httpStatus: 503,
      isRetryable: true,
    });
  }

  /**
   * Initiates payment with automatic failover to healthy backup gateway if primary is DOWN or fails.
   */
  async initiatePayment(
    params: InitiatePaymentParams,
    options: { preferredProvider?: GatewayProvider } = {}
  ): Promise<InitiatePaymentResult & { failoverOccurred: boolean; providerUsed: GatewayProvider }> {
    const res = await this.executeWithFailover(
      (adapter) => adapter.initiatePayment(params),
      {
        preferredProvider: options.preferredProvider,
        method: params.preferredMethod,
      }
    );

    return {
      ...res.result,
      failoverOccurred: res.failoverOccurred,
      providerUsed: res.providerUsed,
    };
  }

  /**
   * Active probe and auto-recovery routine.
   * Runs health checks on DOWN or DEGRADED gateways and automatically recovers healthy ones to UP.
   */
  async probeAndRecover(provider?: GatewayProvider): Promise<GatewayHealthStatus[]> {
    const targets = provider
      ? [provider]
      : Array.from(this.adapters.keys()).filter((p) => {
          const state = this.getHealthState(p);
          return state.status === 'DOWN' || state.status === 'DEGRADED';
        });

    const results: GatewayHealthStatus[] = [];

    for (const p of targets) {
      const adapter = this.adapters.get(p);
      if (!adapter) continue;

      try {
        const health = await adapter.healthCheck();
        results.push(health);

        if (health.status === 'UP') {
          this.setGatewayStatus(p, 'UP');
        } else if (health.status === 'DEGRADED') {
          this.setGatewayStatus(p, 'DEGRADED', health.message);
        } else {
          this.setGatewayStatus(p, 'DOWN', health.message);
        }
      } catch (err: any) {
        const downStatus: GatewayHealthStatus = {
          provider: p,
          status: 'DOWN',
          latencyMs: 0,
          message: err.message,
          timestamp: new Date(),
        };
        results.push(downStatus);
        this.setGatewayStatus(p, 'DOWN', err.message);
      }
    }

    return results;
  }
}

/**
 * Composite adapter that implements PaymentGatewayAdapter with automatic failover and recovery.
 */
export class FailoverGatewayAdapter implements PaymentGatewayAdapter {
  readonly supportedMethods = [
    'CARDS',
    'BKASH',
    'NAGAD',
    'ROCKET',
    'UPAY',
    'INTERNET_BANKING',
    'ALL',
  ] as const;

  readonly router: GatewayFailoverRouter;

  constructor(router: GatewayFailoverRouter) {
    this.router = router;
  }

  get provider(): GatewayProvider {
    try {
      const { provider } = this.router.selectHealthyProvider();
      return provider;
    } catch {
      return 'SSLCOMMERZ';
    }
  }

  private detectProvider(params?: {
    provider?: GatewayProvider;
    rawCallbackParams?: Record<string, unknown>;
    providerPaymentId?: string;
    providerTrxId?: string;
    paymentId?: string;
  }): GatewayProvider | undefined {
    if (params?.provider) return params.provider;

    const cb = params?.rawCallbackParams;
    if (cb) {
      if ('paymentID' in cb || 'bkashURL' in cb) return 'BKASH';
      if ('payment_ref_id' in cb) return 'NAGAD';
      if ('val_id' in cb || 'verify_sign' in cb || 'tran_id' in cb) return 'SSLCOMMERZ';
      if ('sp_code' in cb || 'order_id' in cb) return 'SHURJOPAY';
      if ('mer_txnid' in cb || 'pg_txnid' in cb || 'pay_status' in cb) return 'AAMARPAY';
    }

    const id = params?.providerPaymentId || params?.providerTrxId || params?.paymentId;
    if (id) {
      const lower = id.toLowerCase();
      if (lower.includes('bkash')) return 'BKASH';
      if (lower.includes('nagad')) return 'NAGAD';
      if (lower.includes('ssl')) return 'SSLCOMMERZ';
      if (lower.includes('shurjo') || lower.startsWith('nok')) return 'SHURJOPAY';
      if (lower.includes('aamar')) return 'AAMARPAY';
      if (lower.includes('mock')) return 'MOCK';
    }

    return undefined;
  }

  async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    return this.router.initiatePayment(params);
  }

  async verifyPayment(params: VerifyPaymentParams): Promise<VerifyPaymentResult> {
    const preferredProvider = this.detectProvider(params);
    const execution = await this.router.executeWithFailover(
      async (adapter) => {
        return adapter.verifyPayment(params);
      },
      { preferredProvider }
    );
    return execution.result;
  }

  async refundPayment(params: RefundParams): Promise<RefundResult> {
    const preferredProvider = this.detectProvider(params);
    const execution = await this.router.executeWithFailover(
      async (adapter) => {
        return adapter.refundPayment(params);
      },
      { preferredProvider }
    );
    return execution.result;
  }

  async verifyWebhookSignature(
    headers: Record<string, string>,
    body: string | Record<string, unknown>
  ): Promise<boolean> {
    const states = this.router.getAllHealthStates();
    for (const state of states) {
      const adapter = this.router.getAdapter(state.provider);
      if (adapter) {
        try {
          const verified = await adapter.verifyWebhookSignature(headers, body);
          if (verified) return true;
        } catch {
          // Check next adapter
        }
      }
    }
    return false;
  }

  async queryPayment(providerTrxId: string): Promise<PaymentDetailsResult> {
    const preferredProvider = this.detectProvider({ providerTrxId });
    const execution = await this.router.executeWithFailover(
      async (adapter) => {
        return adapter.queryPayment(providerTrxId);
      },
      { preferredProvider }
    );
    return execution.result;
  }

  async queryRefund(refundId: string): Promise<RefundDetailsResult> {
    const preferredProvider = this.detectProvider({ providerPaymentId: refundId });
    const execution = await this.router.executeWithFailover(
      async (adapter) => {
        return adapter.queryRefund(refundId);
      },
      { preferredProvider }
    );
    return execution.result;
  }

  async healthCheck(): Promise<GatewayHealthStatus> {
    const states = this.router.getAllHealthStates();
    const isAnyUp = states.some((s) => s.status === 'UP');
    const isAllDown = states.every((s) => s.status === 'DOWN');

    const status = isAllDown ? 'DOWN' : isAnyUp ? 'UP' : 'DEGRADED';
    return {
      provider: this.provider,
      status,
      latencyMs: 1,
      timestamp: new Date(),
    };
  }
}
