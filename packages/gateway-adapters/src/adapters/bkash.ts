import * as crypto from 'node:crypto';
import { Paisa } from '@denaneya/payment-core';
import { BasePaymentGatewayAdapter } from '../adapter.js';
import { GatewayError } from '../errors.js';
import type {
  InitiatePaymentParams,
  InitiatePaymentResult,
  VerifyPaymentParams,
  VerifyPaymentResult,
  RefundParams,
  RefundResult,
  PaymentDetailsResult,
  RefundDetailsResult,
  GatewayHealthStatus,
  BkashConfig,
  GatewayTransactionStatus,
} from '../types.js';
import { fetchWithTimeout, parseJsonResponse } from '../utils/http.js';
import { hmacSha256 } from '../crypto/hash.js';

export class BkashAdapter extends BasePaymentGatewayAdapter<BkashConfig> {
  readonly provider = 'BKASH' as const;
  readonly supportedMethods = ['BKASH'] as const;

  private cachedToken: string | null = null;
  private cachedRefreshToken: string | null = null;
  private tokenExpiresAt = 0;

  private get baseUrl(): string {
    return this.config.isSandbox
      ? 'https://tokenized.sandbox.bka.sh/v2/tokenized/checkout'
      : 'https://tokenized.pay.bka.sh/v2/tokenized/checkout';
  }

  async getAuthToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    if (this.cachedRefreshToken) {
      try {
        const refreshUrl = `${this.baseUrl}/token/refresh`;
        const res = await fetchWithTimeout(
          refreshUrl,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              username: this.config.username,
              password: this.config.password,
            },
            body: JSON.stringify({
              app_key: this.config.appKey,
              app_secret: this.config.appSecret,
              refresh_token: this.cachedRefreshToken,
            }),
            timeoutMs: this.config.timeoutMs,
          },
          this.provider
        );

        const data: any = await parseJsonResponse(res, this.provider, {});
        if (data.statusCode === '0000' && data.id_token) {
          this.cachedToken = data.id_token;
          if (data.refresh_token) {
            this.cachedRefreshToken = data.refresh_token;
          }
          const expiresIn = data.expires_in ?? 3600;
          this.tokenExpiresAt = Date.now() + Math.max(0, expiresIn - 60) * 1000;
          return this.cachedToken!;
        }
      } catch {
        // Fall back to token grant
      }
    }

    // Call /token/grant
    const grantUrl = `${this.baseUrl}/token/grant`;
    const res = await fetchWithTimeout(
      grantUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          username: this.config.username,
          password: this.config.password,
        },
        body: JSON.stringify({
          app_key: this.config.appKey,
          app_secret: this.config.appSecret,
        }),
        timeoutMs: this.config.timeoutMs,
      },
      this.provider
    );

    const data: any = await parseJsonResponse(res, this.provider);
    if (data.statusCode !== '0000' || !data.id_token) {
      throw new GatewayError({
        provider: this.provider,
        code: 'AUTHENTICATION_FAILED',
        message: data.statusMessage || 'Failed to grant bKash token',
        rawResponse: data,
      });
    }

    this.cachedToken = data.id_token;
    this.cachedRefreshToken = data.refresh_token ?? null;
    const expiresIn = data.expires_in ?? 3600;
    this.tokenExpiresAt = Date.now() + Math.max(0, expiresIn - 60) * 1000;

    return this.cachedToken!;
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getAuthToken();
    return {
      'Content-Type': 'application/json',
      Authorization: token,
      'x-app-key': this.config.appKey,
    };
  }

  async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    const headers = await this.getAuthHeaders();
    const url = `${this.baseUrl}/create`;

    const payload = {
      mode: '0011',
      payerReference: params.customer.phone || '01700000000',
      callbackURL: params.returnUrl,
      amount: this.formatBDT(params.amount),
      currency: 'BDT',
      intent: 'sale',
      merchantInvoiceNumber: params.paymentId,
    };

    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        timeoutMs: this.config.timeoutMs,
      },
      this.provider
    );

    const data: any = await parseJsonResponse(response, this.provider);

    if (data.statusCode !== '0000' || !data.bkashURL) {
      throw new GatewayError({
        provider: this.provider,
        code: 'INVALID_REQUEST',
        message: data.statusMessage || 'bKash create payment failed',
        rawResponse: data,
      });
    }

    return {
      provider: this.provider,
      redirectUrl: data.bkashURL,
      providerPaymentId: data.paymentID,
      sessionData: {
        paymentID: data.paymentID,
      },
    };
  }

  async verifyPayment(params: VerifyPaymentParams): Promise<VerifyPaymentResult> {
    const paymentId =
      (params.rawCallbackParams?.paymentID as string) ||
      params.providerPaymentId ||
      params.paymentId;

    const callbackStatus = (params.rawCallbackParams?.status as string)?.toLowerCase();

    // If client callback claims cancel or failure, verify against upstream before accepting
    if (callbackStatus === 'cancel' || callbackStatus === 'failure') {
      try {
        const headers = await this.getAuthHeaders();
        const statusUrl = `${this.baseUrl}/payment/status`;
        const res = await fetchWithTimeout(
          statusUrl,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ paymentID: paymentId }),
            timeoutMs: this.config.timeoutMs,
          },
          this.provider
        );
        const queryData: any = await parseJsonResponse(res, this.provider);

        // If upstream says Completed, override untrusted callback!
        if (queryData.statusCode === '0000' && queryData.transactionStatus === 'Completed') {
          const verifiedAmount = this.parseBDT(queryData.amount);
          return {
            provider: this.provider,
            status: 'COMPLETED',
            providerTrxId: queryData.trxID,
            providerPaymentId: queryData.paymentID || paymentId,
            amount: verifiedAmount,
            fee: Paisa.zero(),
            currency: 'BDT',
            customerPhone: queryData.customerMsisdn,
            cardType: 'bKash',
            paidAt: queryData.paymentExecuteTime ? new Date(queryData.paymentExecuteTime) : new Date(),
            rawResponse: queryData,
          };
        }
      } catch (err) {
        if (err instanceof GatewayError && err.isRetryable) {
          throw err;
        }
        // Proceed with callback status if status check is definitive
      }

      return {
        provider: this.provider,
        status: callbackStatus === 'cancel' ? 'CANCELLED' : 'FAILED',
        providerTrxId: '',
        providerPaymentId: paymentId,
        amount: params.amount ?? Paisa.zero(),
        fee: Paisa.zero(),
        currency: 'BDT',
        paidAt: new Date(),
        rawResponse: params.rawCallbackParams || {},
      };
    }

    const headers = await this.getAuthHeaders();

    // First attempt execution
    let executeData: any;
    try {
      const execUrl = `${this.baseUrl}/execute`;
      const res = await fetchWithTimeout(
        execUrl,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ paymentID: paymentId }),
          timeoutMs: this.config.timeoutMs,
        },
        this.provider
      );
      executeData = await parseJsonResponse(res, this.provider);
    } catch (err) {
      if (err instanceof GatewayError && err.isRetryable) {
        throw err;
      }
      executeData = {};
    }

    // If execution was already performed or didn't return completed, query status
    if (executeData.statusCode !== '0000' || executeData.transactionStatus !== 'Completed') {
      const statusUrl = `${this.baseUrl}/payment/status`;
      const res = await fetchWithTimeout(
        statusUrl,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ paymentID: paymentId }),
          timeoutMs: this.config.timeoutMs,
        },
        this.provider
      );
      const queryData: any = await parseJsonResponse(res, this.provider);
      if (queryData.statusCode === '0000' && queryData.transactionStatus) {
        executeData = queryData;
      }
    }

    if (!executeData.transactionStatus && executeData.statusCode !== '0000') {
      throw new GatewayError({
        provider: this.provider,
        code: 'GATEWAY_UNAVAILABLE',
        message: executeData.statusMessage || 'bKash verification returned invalid response',
        httpStatus: 502,
        isRetryable: true,
        rawResponse: executeData,
      });
    }

    const txStatus = executeData.transactionStatus;
    let status: GatewayTransactionStatus;

    if (txStatus === 'Completed') {
      status = 'COMPLETED';
    } else if (txStatus === 'Pending') {
      status = 'PENDING';
    } else if (txStatus === 'Cancelled') {
      status = 'CANCELLED';
    } else {
      status = 'FAILED';
    }

    if (status === 'COMPLETED') {
      const verifiedAmount = this.parseBDT(executeData.amount);
      if (params.amount && !verifiedAmount.equals(params.amount)) {
        throw new GatewayError({
          provider: this.provider,
          code: 'AMOUNT_MISMATCH',
          message: `Amount mismatch: expected ${params.amount.toBDT()} BDT, but verified ${verifiedAmount.toBDT()} BDT`,
          rawResponse: executeData,
        });
      }

      return {
        provider: this.provider,
        status: 'COMPLETED',
        providerTrxId: executeData.trxID,
        providerPaymentId: executeData.paymentID || paymentId,
        amount: verifiedAmount,
        fee: Paisa.zero(),
        currency: 'BDT',
        customerPhone: executeData.customerMsisdn,
        cardType: 'bKash',
        paidAt: executeData.paymentExecuteTime
          ? new Date(executeData.paymentExecuteTime)
          : new Date(),
        rawResponse: executeData,
      };
    }

    return {
      provider: this.provider,
      status,
      providerTrxId: executeData.trxID || '',
      providerPaymentId: executeData.paymentID || paymentId,
      amount: executeData.amount ? this.parseBDT(executeData.amount) : Paisa.zero(),
      fee: Paisa.zero(),
      currency: 'BDT',
      cardType: 'bKash',
      paidAt: new Date(),
      rawResponse: executeData,
    };
  }

  async refundPayment(params: RefundParams): Promise<RefundResult> {
    if (params.refundAmount.gt(params.totalCapturedAmount)) {
      throw new GatewayError({
        provider: this.provider,
        code: 'REFUND_EXCEEDS_AMOUNT',
        message: 'Refund amount exceeds captured amount',
      });
    }

    const headers = await this.getAuthHeaders();
    const url = `${this.baseUrl}/payment/refund`;

    const payload = {
      paymentID: params.providerPaymentId,
      trxID: params.providerTrxId,
      amount: this.formatBDT(params.refundAmount),
      sku: params.refundId,
      reason: params.refundReason,
    };

    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        timeoutMs: this.config.timeoutMs,
      },
      this.provider
    );

    const data: any = await parseJsonResponse(response, this.provider);

    if (data.statusCode !== '0000') {
      throw new GatewayError({
        provider: this.provider,
        code: 'REFUND_NOT_ALLOWED',
        message: data.statusMessage || 'bKash refund request failed',
        rawResponse: data,
      });
    }

    return {
      provider: this.provider,
      status: 'SUCCEEDED',
      providerRefundId: data.refundTrxID || data.trxID || params.refundId,
      refundAmount: params.refundAmount,
      refundedAt: new Date(),
      rawResponse: data,
    };
  }

  async verifyWebhookSignature(
    headers: Record<string, string>,
    body: string | Record<string, unknown>
  ): Promise<boolean> {
    let params: Record<string, any>;
    if (typeof body === 'string') {
      try {
        params = JSON.parse(body);
      } catch {
        params = Object.fromEntries(new URLSearchParams(body).entries());
      }
    } else {
      params = body as Record<string, any>;
    }

    const paymentId = (params?.paymentID || params?.trxID) as string;
    if (!paymentId) {
      return false;
    }

    // 1. If cryptographic HMAC signature header is provided, verify it
    const signature = headers['x-bkash-signature'] || headers['x-signature'];
    if (signature) {
      const rawPayload = typeof body === 'string' ? body : JSON.stringify(body);
      const expected = hmacSha256(rawPayload, this.config.appSecret);
      const bufSig = Buffer.from(signature.toLowerCase(), 'utf8');
      const bufExp = Buffer.from(expected.toLowerCase(), 'utf8');
      return bufSig.length === bufExp.length && crypto.timingSafeEqual(bufSig, bufExp);
    }

    // 2. Otherwise verify via server-to-server status check query
    try {
      const result = await this.queryPayment(paymentId);
      return result.status === 'COMPLETED';
    } catch {
      return false;
    }
  }

  async queryPayment(providerTrxId: string): Promise<PaymentDetailsResult> {
    const headers = await this.getAuthHeaders();
    const url = `${this.baseUrl}/general/searchTran`;

    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ trxID: providerTrxId }),
        timeoutMs: this.config.timeoutMs,
      },
      this.provider
    );

    const data: any = await parseJsonResponse(response, this.provider);

    const isSuccess = data.transactionStatus === 'Completed';
    return {
      provider: this.provider,
      paymentId: data.paymentID,
      providerTrxId: data.trxID || providerTrxId,
      status: isSuccess ? 'COMPLETED' : 'FAILED',
      amount: data.amount ? this.parseBDT(data.amount) : Paisa.zero(),
      currency: 'BDT',
      customerMsisdn: data.customerMsisdn,
      paidAt: data.paymentExecuteTime ? new Date(data.paymentExecuteTime) : undefined,
      rawResponse: data,
    };
  }

  async queryRefund(refundId: string): Promise<RefundDetailsResult> {
    const headers = await this.getAuthHeaders();
    const url = `${this.baseUrl}/payment/refund/status`;

    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ refundTrxID: refundId, trxID: refundId }),
        timeoutMs: this.config.timeoutMs,
      },
      this.provider
    );

    const data: any = await parseJsonResponse(response, this.provider);

    const isSuccess =
      data.statusCode === '0000' &&
      (data.transactionStatus === 'Completed' || data.refundStatus === 'Completed');
    const isPending =
      data.transactionStatus === 'Pending' || data.refundStatus === 'Pending';

    return {
      provider: this.provider,
      providerRefundId: data.refundTrxID || refundId,
      providerTrxId: data.trxID || '',
      status: isSuccess ? 'SUCCEEDED' : isPending ? 'PENDING' : 'FAILED',
      amount: data.amount ? this.parseBDT(data.amount) : Paisa.zero(),
      rawResponse: data,
    };
  }

  async healthCheck(): Promise<GatewayHealthStatus> {
    const start = performance.now();
    try {
      await this.getAuthToken();
      const latencyMs = Math.round(performance.now() - start);
      return {
        provider: this.provider,
        status: 'UP',
        latencyMs,
        timestamp: new Date(),
      };
    } catch (err: any) {
      return {
        provider: this.provider,
        status: 'DOWN',
        latencyMs: Math.round(performance.now() - start),
        message: err.message,
        timestamp: new Date(),
      };
    }
  }
}