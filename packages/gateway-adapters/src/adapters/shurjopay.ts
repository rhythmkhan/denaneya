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
  ShurjoPayConfig,
  GatewayTransactionStatus,
} from '../types.js';
import { fetchWithTimeout, parseJsonResponse } from '../utils/http.js';
import { hmacSha256 } from '../crypto/hash.js';

export class ShurjoPayAdapter extends BasePaymentGatewayAdapter<ShurjoPayConfig> {
  readonly provider = 'SHURJOPAY' as const;
  readonly supportedMethods = [
    'CARDS',
    'BKASH',
    'NAGAD',
    'ROCKET',
    'UPAY',
    'INTERNET_BANKING',
  ] as const;

  private cachedToken: string | null = null;
  private cachedStoreId: number | string | null = null;
  private tokenExpiresAt = 0;
  private cachedTokenSandbox: boolean | null = null;

  public get baseUrl(): string {
    if (this.config.baseUrl) return this.config.baseUrl;
    if (process.env.SHURJOPAY_BASE_URL) return process.env.SHURJOPAY_BASE_URL;
    return this.isSandbox
      ? 'https://sandbox.shurjopayment.com/api'
      : 'https://engine.shurjopay.com/api';
  }

  async ensureToken(): Promise<{ token: string; storeId: number | string }> {
    if (this.cachedTokenSandbox !== null && this.cachedTokenSandbox !== this.isSandbox) {
      this.cachedToken = null;
      this.cachedStoreId = null;
      this.tokenExpiresAt = 0;
    }

    if (this.cachedToken && Date.now() < this.tokenExpiresAt && this.cachedStoreId) {
      return { token: this.cachedToken, storeId: this.cachedStoreId };
    }

    const url = `${this.baseUrl}/get_token`;
    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.config.username,
          password: this.config.password,
        }),
        timeoutMs: this.config.timeoutMs,
      },
      this.provider
    );

    const data: any = await parseJsonResponse(response, this.provider, {});

    if (!data.token || String(data.sp_code) !== '1000') {
      throw new GatewayError({
        provider: this.provider,
        code: 'AUTHENTICATION_FAILED',
        message: data.message || 'Failed to authenticate with shurjoPay token API',
        rawResponse: data,
      });
    }

    this.cachedToken = data.token;
    this.cachedStoreId = data.store_id;
    const expiresInSec = data.expires_in ?? 3600;
    this.tokenExpiresAt = Date.now() + Math.max(0, expiresInSec - 60) * 1000;
    this.cachedTokenSandbox = this.isSandbox;

    return { token: data.token, storeId: this.cachedStoreId! };
  }

  async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    const { token, storeId } = await this.ensureToken();
    const url = `${this.baseUrl}/secret-pay`;

    const payload = {
      prefix: this.config.prefix,
      token,
      return_url: params.returnUrl,
      cancel_url: params.cancelUrl,
      store_id: storeId,
      amount: this.formatBDT(params.amount),
      order_id: params.paymentId,
      currency: 'BDT',
      customer_name: params.customer.name,
      customer_address: params.customer.address?.street || 'Dhaka',
      customer_email: params.customer.email,
      customer_phone: params.customer.phone || '01700000000',
      customer_city: params.customer.address?.city || 'Dhaka',
      customer_post_code: params.customer.address?.postalCode || '1200',
      client_ip: params.clientIp || '127.0.0.1',
    };

    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
        timeoutMs: this.config.timeoutMs,
      },
      this.provider
    );

    const data: any = await parseJsonResponse(response, this.provider);

    if (!data.checkout_url) {
      throw new GatewayError({
        provider: this.provider,
        code: 'INVALID_REQUEST',
        message: data.message || 'Failed to initiate shurjoPay secret-pay checkout',
        rawResponse: data,
      });
    }

    return {
      provider: this.provider,
      redirectUrl: data.checkout_url,
      providerPaymentId: data.sp_order_id,
      sessionData: {
        sp_order_id: data.sp_order_id,
      },
    };
  }

  async verifyPayment(params: VerifyPaymentParams): Promise<VerifyPaymentResult> {
    const orderId =
      (params.rawCallbackParams?.order_id as string) ||
      params.providerPaymentId ||
      params.providerTrxId ||
      params.paymentId;

    if (!orderId) {
      throw new GatewayError({
        provider: this.provider,
        code: 'INVALID_REQUEST',
        message: 'Missing order_id required for shurjoPay verification',
      });
    }

    const { token } = await this.ensureToken();
    const url = `${this.baseUrl}/verification`;

    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ order_id: orderId }),
        timeoutMs: this.config.timeoutMs,
      },
      this.provider
    );

    const rawData: any = await parseJsonResponse(response, this.provider);
    const data = Array.isArray(rawData) ? rawData[0] : rawData;

    if (!data) {
      throw new GatewayError({
        provider: this.provider,
        code: 'TRANSACTION_NOT_FOUND',
        message: `No transaction found for order_id: ${orderId}`,
        rawResponse: rawData,
      });
    }

    const code = String(data.sp_code ?? '');
    let status: GatewayTransactionStatus;

    if (code === '1000') {
      status = 'COMPLETED';
    } else if (code === '1001') {
      status = 'PENDING';
    } else if (code === '1002') {
      status = 'CANCELLED';
    } else {
      status = 'FAILED';
    }

    if (status === 'COMPLETED') {
      const verifiedAmount = this.parseBDT(data.amount);
      if (params.amount && !verifiedAmount.equals(params.amount)) {
        throw new GatewayError({
          provider: this.provider,
          code: 'AMOUNT_MISMATCH',
          message: `Amount mismatch: expected ${params.amount.toBDT()} BDT, but verified ${verifiedAmount.toBDT()} BDT`,
          rawResponse: data,
        });
      }

      return {
        provider: this.provider,
        status: 'COMPLETED',
        providerTrxId: data.bank_trx_id || data.sp_order_id || orderId,
        providerPaymentId: data.sp_order_id || orderId,
        amount: verifiedAmount,
        fee: Paisa.zero(),
        currency: 'BDT',
        cardType: data.method,
        bankTrxId: data.bank_trx_id,
        paidAt: data.date_time ? new Date(data.date_time) : new Date(),
        rawResponse: data,
      };
    }

    return {
      provider: this.provider,
      status,
      providerTrxId: data.bank_trx_id || data.sp_order_id || orderId,
      providerPaymentId: data.sp_order_id || orderId,
      amount: data.amount ? this.parseBDT(data.amount) : Paisa.zero(),
      fee: Paisa.zero(),
      currency: 'BDT',
      cardType: data.method,
      paidAt: new Date(),
      rawResponse: data,
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

    throw new GatewayError({
      provider: this.provider,
      code: 'REFUND_NOT_ALLOWED',
      message: 'shurjoPay v2.1 does not support direct automated API refunds; must be processed via merchant portal',
    });
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

    const orderId = (params?.order_id || params?.sp_order_id) as string;
    if (!orderId) {
      return false;
    }

    const headerKeys = Object.keys(headers || {});
    const sigKey = headerKeys.find(
      (k) => k.toLowerCase() === 'x-shurjopay-signature' || k.toLowerCase() === 'x-signature'
    );
    const signature = sigKey ? headers[sigKey] : undefined;
    if (signature) {
      const rawPayload = typeof body === 'string' ? body : JSON.stringify(body);
      const expected = hmacSha256(rawPayload, this.config.password);
      const bufSig = Buffer.from(signature.toLowerCase(), 'utf8');
      const bufExp = Buffer.from(expected.toLowerCase(), 'utf8');
      return bufSig.length === bufExp.length && crypto.timingSafeEqual(bufSig, bufExp);
    }

    try {
      const verification = await this.verifyPayment({
        paymentId: orderId,
        rawCallbackParams: { order_id: orderId },
      });
      return verification.status === 'COMPLETED' || verification.status === 'PENDING';
    } catch {
      return false;
    }
  }

  async queryPayment(providerTrxId: string): Promise<PaymentDetailsResult> {
    const result = await this.verifyPayment({ paymentId: providerTrxId, providerTrxId });
    return {
      provider: this.provider,
      paymentId: providerTrxId,
      providerTrxId: result.providerTrxId,
      status: result.status,
      amount: result.amount,
      currency: 'BDT',
      paidAt: result.paidAt,
      rawResponse: result.rawResponse,
    };
  }

  async queryRefund(_refundId: string): Promise<RefundDetailsResult> {
    throw new GatewayError({
      provider: this.provider,
      code: 'REFUND_NOT_ALLOWED',
      message: 'shurjoPay v2.1 does not support automated API refund query; refunds are managed via merchant portal',
      httpStatus: 400,
      isRetryable: false,
    });
  }

  async healthCheck(): Promise<GatewayHealthStatus> {
    const start = performance.now();
    try {
      await this.ensureToken();
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