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
  SslCommerzConfig,
  GatewayTransactionStatus,
} from '../types.js';
import { fetchWithTimeout, parseJsonResponse } from '../utils/http.js';
import { md5 } from '../crypto/hash.js';

export class SslCommerzAdapter extends BasePaymentGatewayAdapter<SslCommerzConfig> {
  readonly provider = 'SSLCOMMERZ' as const;
  readonly supportedMethods = [
    'CARDS',
    'BKASH',
    'NAGAD',
    'ROCKET',
    'UPAY',
    'INTERNET_BANKING',
  ] as const;

  public get baseUrl(): string {
    if (this.config.baseUrl) return this.config.baseUrl;
    if (process.env.SSLCOMMERZ_BASE_URL) return process.env.SSLCOMMERZ_BASE_URL;
    return this.isSandbox
      ? 'https://sandbox.sslcommerz.com'
      : 'https://securepay.sslcommerz.com';
  }

  async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    const url = `${this.baseUrl}/gwprocess/v4/api.php`;

    const bodyParams = new URLSearchParams({
      store_id: this.config.storeId,
      store_passwd: this.config.storePassword,
      total_amount: this.formatBDT(params.amount),
      currency: 'BDT',
      tran_id: params.paymentId,
      success_url: params.returnUrl,
      fail_url: params.returnUrl,
      cancel_url: params.cancelUrl,
      ipn_url: params.ipnUrl,
      cus_name: params.customer.name,
      cus_email: params.customer.email,
      cus_phone: params.customer.phone || '01700000000',
      cus_add1: params.customer.address?.street || 'Dhaka',
      cus_city: params.customer.address?.city || 'Dhaka',
      cus_country: params.customer.address?.country || 'Bangladesh',
      shipping_method: 'NO',
      product_name: params.description || 'Order Payment',
      product_category: 'General',
      product_profile: 'general',
    });

    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams.toString(),
        timeoutMs: this.config.timeoutMs,
      },
      this.provider
    );

    const data: any = await parseJsonResponse(response, this.provider);

    if (data.status !== 'SUCCESS') {
      throw new GatewayError({
        provider: this.provider,
        code: data.failedreason ? 'PAYMENT_DECLINED' : 'INVALID_REQUEST',
        message: data.failedreason || 'SSLCOMMERZ session creation failed',
        httpStatus: 400,
        isRetryable: false,
        rawResponse: data,
      });
    }

    return {
      provider: this.provider,
      redirectUrl: data.GatewayPageURL,
      providerPaymentId: data.sessionkey,
      sessionData: { sessionkey: data.sessionkey },
    };
  }

  async verifyPayment(params: VerifyPaymentParams): Promise<VerifyPaymentResult> {
    const valId =
      (params.rawCallbackParams?.val_id as string) ||
      params.providerPaymentId ||
      params.providerTrxId;

    if (!valId) {
      throw new GatewayError({
        provider: this.provider,
        code: 'INVALID_REQUEST',
        message: 'Missing val_id required for SSLCOMMERZ payment verification',
      });
    }

    const queryParams = new URLSearchParams({
      val_id: valId,
      store_id: this.config.storeId,
      store_passwd: this.config.storePassword,
      format: 'json',
    });

    const url = `${this.baseUrl}/validator/api/validationserverAPI.php?${queryParams.toString()}`;
    const response = await fetchWithTimeout(
      url,
      { method: 'GET', timeoutMs: this.config.timeoutMs },
      this.provider
    );

    const data: any = await parseJsonResponse(response, this.provider);

    if (!data || !data.status) {
      throw new GatewayError({
        provider: this.provider,
        code: 'GATEWAY_UNAVAILABLE',
        message: 'SSLCOMMERZ validation response missing status field',
        httpStatus: 502,
        isRetryable: true,
        rawResponse: data,
      });
    }

    const statusMap: Record<string, GatewayTransactionStatus> = {
      VALID: 'COMPLETED',
      VALIDATED: 'COMPLETED',
      FAILED: 'FAILED',
      CANCELLED: 'CANCELLED',
      EXPIRED: 'EXPIRED',
      PENDING: 'PENDING',
    };

    const status = statusMap[data.status] || 'FAILED';

    if (status === 'COMPLETED') {
      if (data.currency && data.currency !== 'BDT') {
        throw new GatewayError({
          provider: this.provider,
          code: 'CURRENCY_MISMATCH',
          message: `Expected BDT currency, but received ${data.currency}`,
          rawResponse: data,
        });
      }

      const verifiedAmount = this.parseBDT(data.amount);
      if (params.amount && !verifiedAmount.equals(params.amount)) {
        throw new GatewayError({
          provider: this.provider,
          code: 'AMOUNT_MISMATCH',
          message: `Amount mismatch: expected ${params.amount.toBDT()} BDT, but verified ${verifiedAmount.toBDT()} BDT`,
          rawResponse: data,
        });
      }

      let fee = Paisa.zero();
      if (data.store_amount) {
        const storeAmount = this.parseBDT(data.store_amount);
        if (verifiedAmount.gt(storeAmount)) {
          fee = verifiedAmount.subtract(storeAmount);
        }
      }

      return {
        provider: this.provider,
        status: 'COMPLETED',
        providerTrxId: data.bank_tran_id || data.tran_id,
        providerPaymentId: data.val_id,
        amount: verifiedAmount,
        fee,
        currency: 'BDT',
        cardType: data.card_type,
        bankTrxId: data.bank_tran_id,
        paidAt: data.tran_date ? new Date(data.tran_date) : new Date(),
        rawResponse: data,
      };
    }

    return {
      provider: this.provider,
      status,
      providerTrxId: data.bank_tran_id || data.tran_id || valId,
      providerPaymentId: data.val_id || valId,
      amount: data.amount ? this.parseBDT(data.amount) : Paisa.zero(),
      fee: Paisa.zero(),
      currency: 'BDT',
      cardType: data.card_type,
      paidAt: new Date(),
      rawResponse: data,
    };
  }

  async refundPayment(params: RefundParams): Promise<RefundResult> {
    if (params.refundAmount.gt(params.totalCapturedAmount)) {
      throw new GatewayError({
        provider: this.provider,
        code: 'REFUND_EXCEEDS_AMOUNT',
        message: 'Refund amount exceeds total captured amount',
      });
    }

    const queryParams = new URLSearchParams({
      refund_amount: this.formatBDT(params.refundAmount),
      refund_remarks: params.refundReason,
      bank_tran_id: params.providerTrxId,
      refe_id: params.refundId,
      store_id: this.config.storeId,
      store_passwd: this.config.storePassword,
      format: 'json',
    });

    const url = `${this.baseUrl}/validator/api/merchantTransIDvalidationAPI.php?${queryParams.toString()}`;
    const response = await fetchWithTimeout(
      url,
      { method: 'GET', timeoutMs: this.config.timeoutMs },
      this.provider
    );

    const data: any = await parseJsonResponse(response, this.provider);

    if (data.status !== 'success') {
      throw new GatewayError({
        provider: this.provider,
        code: 'REFUND_NOT_ALLOWED',
        message: data.errorReason || 'SSLCOMMERZ refund request failed',
        rawResponse: data,
      });
    }

    return {
      provider: this.provider,
      status: 'SUCCEEDED',
      providerRefundId: data.refund_ref_id || params.refundId,
      refundAmount: params.refundAmount,
      refundedAt: new Date(),
      rawResponse: data,
    };
  }

  async verifyWebhookSignature(
    _headers: Record<string, string>,
    body: string | Record<string, unknown>
  ): Promise<boolean> {
    const params =
      typeof body === 'string'
        ? Object.fromEntries(new URLSearchParams(body).entries())
        : (body as Record<string, string>);

    if (params.verify_sign && params.verify_key) {
      const verifySign = params.verify_sign;
      const verifyKeys = params.verify_key.split(',');
      const parts: string[] = [];

      for (const k of verifyKeys) {
        const val = params[k] ?? '';
        parts.push(`${k}=${val}`);
      }

      const passwordHash = md5(this.config.storePassword);
      parts.push(`store_passwd=${passwordHash}`);
      const hashPayload = parts.join('&');
      const calculatedHash = md5(hashPayload);

      const bufCalculated = Buffer.from(calculatedHash.toLowerCase(), 'utf8');
      const bufReceived = Buffer.from(verifySign.toLowerCase(), 'utf8');

      return (
        bufCalculated.length === bufReceived.length &&
        crypto.timingSafeEqual(bufCalculated, bufReceived)
      );
    }

    // IPN fallback: If SSLCOMMERZ sends IPN without verify_sign but with val_id, verify upstream
    if (params.val_id) {
      try {
        const verification = await this.verifyPayment({
          paymentId: params.tran_id || '',
          rawCallbackParams: params,
        });
        return verification.status === 'COMPLETED';
      } catch {
        return false;
      }
    }

    return false;
  }

  async queryPayment(providerTrxId: string): Promise<PaymentDetailsResult> {
    const queryParams = new URLSearchParams({
      tran_id: providerTrxId,
      store_id: this.config.storeId,
      store_passwd: this.config.storePassword,
      format: 'json',
    });

    const url = `${this.baseUrl}/validator/api/merchantTransIDvalidationAPI.php?${queryParams.toString()}`;
    const response = await fetchWithTimeout(
      url,
      { method: 'GET', timeoutMs: this.config.timeoutMs },
      this.provider
    );

    const data: any = await parseJsonResponse(response, this.provider);
    const element = data.element?.[0] || data;

    const isSuccess = element.status === 'VALID' || element.status === 'VALIDATED';
    return {
      provider: this.provider,
      paymentId: element.tran_id,
      providerTrxId: element.bank_tran_id || providerTrxId,
      status: isSuccess ? 'COMPLETED' : 'FAILED',
      amount: element.amount ? this.parseBDT(element.amount) : Paisa.zero(),
      currency: 'BDT',
      paidAt: element.tran_date ? new Date(element.tran_date) : undefined,
      rawResponse: data,
    };
  }

  async queryRefund(refundId: string): Promise<RefundDetailsResult> {
    const queryParams = new URLSearchParams({
      refund_ref_id: refundId,
      store_id: this.config.storeId,
      store_passwd: this.config.storePassword,
      format: 'json',
    });

    const url = `${this.baseUrl}/validator/api/merchantTransIDvalidationAPI.php?${queryParams.toString()}`;
    const response = await fetchWithTimeout(
      url,
      { method: 'GET', timeoutMs: this.config.timeoutMs },
      this.provider
    );

    const data: any = await parseJsonResponse(response, this.provider);

    const isSuccess = data.status === 'success' || data.status === 'completed';
    const isPending = data.status === 'pending' || data.status === 'processing';

    return {
      provider: this.provider,
      providerRefundId: data.refund_ref_id || refundId,
      providerTrxId: data.bank_tran_id || data.trans_id || '',
      status: isSuccess ? 'SUCCEEDED' : isPending ? 'PENDING' : 'FAILED',
      amount: data.refund_amount ? this.parseBDT(data.refund_amount) : Paisa.zero(),
      rawResponse: data,
    };
  }

  async healthCheck(): Promise<GatewayHealthStatus> {
    const start = performance.now();
    try {
      const response = await fetchWithTimeout(
        `${this.baseUrl}/validator/api/validationserverAPI.php`,
        { method: 'GET', timeoutMs: 5000 },
        this.provider
      );
      const latencyMs = Math.round(performance.now() - start);
      return {
        provider: this.provider,
        status: response.ok ? 'UP' : 'DEGRADED',
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