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
  AamarPayConfig,
  GatewayTransactionStatus,
} from '../types.js';
import { fetchWithTimeout, parseJsonResponse } from '../utils/http.js';
import { hmacSha256 } from '../crypto/hash.js';

export class AamarPayAdapter extends BasePaymentGatewayAdapter<AamarPayConfig> {
  readonly provider = 'AAMARPAY' as const;
  readonly supportedMethods = [
    'CARDS',
    'BKASH',
    'NAGAD',
    'ROCKET',
    'UPAY',
    'INTERNET_BANKING',
  ] as const;

  private get baseUrl(): string {
    return this.config.isSandbox
      ? 'https://sandbox.aamarpay.com'
      : 'https://secure.aamarpay.com';
  }

  async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    const url = `${this.baseUrl}/jsonpost.php`;

    const payload = {
      store_id: this.config.storeId,
      signature_key: this.config.signatureKey,
      tran_id: params.paymentId,
      amount: this.formatBDT(params.amount),
      currency: 'BDT',
      desc: params.description || 'Payment',
      cus_name: params.customer.name,
      cus_email: params.customer.email,
      cus_phone: params.customer.phone || '01700000000',
      cus_add1: params.customer.address?.street || 'Dhaka',
      cus_city: params.customer.address?.city || 'Dhaka',
      cus_country: 'Bangladesh',
      success_url: params.returnUrl,
      fail_url: params.returnUrl,
      cancel_url: params.cancelUrl,
      type: 'json',
      opt_a: params.merchantId,
    };

    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        timeoutMs: this.config.timeoutMs,
      },
      this.provider
    );

    const data: any = await parseJsonResponse(response, this.provider);

    if (data.result !== 'true' && !data.payment_url) {
      throw new GatewayError({
        provider: this.provider,
        code: 'INVALID_REQUEST',
        message: data.error || 'aamarPay checkout initiation failed',
        rawResponse: data,
      });
    }

    return {
      provider: this.provider,
      redirectUrl: data.payment_url,
      providerPaymentId: params.paymentId,
      sessionData: {
        payment_url: data.payment_url,
      },
    };
  }

  async verifyPayment(params: VerifyPaymentParams): Promise<VerifyPaymentResult> {
    const tranId =
      (params.rawCallbackParams?.mer_txnid as string) ||
      params.providerPaymentId ||
      params.paymentId;

    if (!tranId) {
      throw new GatewayError({
        provider: this.provider,
        code: 'INVALID_REQUEST',
        message: 'Missing transaction ID required for aamarPay verification',
      });
    }

    const queryParams = new URLSearchParams({
      request_id: tranId,
      store_id: this.config.storeId,
      signature_key: this.config.signatureKey,
      type: 'json',
    });

    const url = `${this.baseUrl}/api/v1/trxcheck/request.php?${queryParams.toString()}`;
    const response = await fetchWithTimeout(
      url,
      { method: 'GET', timeoutMs: this.config.timeoutMs },
      this.provider
    );

    const data: any = await parseJsonResponse(response, this.provider);

    const payStatus = data.pay_status || data.status;
    if (!payStatus) {
      throw new GatewayError({
        provider: this.provider,
        code: 'GATEWAY_UNAVAILABLE',
        message: 'aamarPay validation response missing pay_status field',
        httpStatus: 502,
        isRetryable: true,
        rawResponse: data,
      });
    }

    let status: GatewayTransactionStatus;

    if (payStatus === 'Successful') {
      status = 'COMPLETED';
    } else if (payStatus === 'Pending') {
      status = 'PENDING';
    } else if (payStatus === 'Cancelled') {
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

      const fee = data.pg_service_charge_bdt
        ? this.parseBDT(data.pg_service_charge_bdt)
        : Paisa.zero();

      return {
        provider: this.provider,
        status: 'COMPLETED',
        providerTrxId: data.pg_txnid || tranId,
        providerPaymentId: data.mer_txnid || tranId,
        amount: verifiedAmount,
        fee,
        currency: 'BDT',
        cardType: data.card_type,
        bankTrxId: data.bank_trxid,
        paidAt: data.date_processed ? new Date(data.date_processed) : new Date(),
        rawResponse: data,
      };
    }

    return {
      provider: this.provider,
      status,
      providerTrxId: data.pg_txnid || tranId,
      providerPaymentId: data.mer_txnid || tranId,
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
        message: 'Refund amount exceeds captured amount',
      });
    }

    throw new GatewayError({
      provider: this.provider,
      code: 'REFUND_NOT_ALLOWED',
      message: 'aamarPay automated API refunds not supported; must be submitted via merchant dashboard',
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

    const tranId = (params?.mer_txnid || params?.pg_txnid) as string;
    if (!tranId) {
      return false;
    }

    const signature = headers['x-aamarpay-signature'] || headers['x-signature'];
    if (signature) {
      const rawPayload = typeof body === 'string' ? body : JSON.stringify(body);
      const expected = hmacSha256(rawPayload, this.config.signatureKey);
      const bufSig = Buffer.from(signature.toLowerCase(), 'utf8');
      const bufExp = Buffer.from(expected.toLowerCase(), 'utf8');
      return bufSig.length === bufExp.length && crypto.timingSafeEqual(bufSig, bufExp);
    }

    try {
      const verification = await this.verifyPayment({
        paymentId: tranId,
        providerTrxId: tranId,
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
      message: 'aamarPay automated API refund query is not supported; refunds are managed via merchant portal',
      httpStatus: 400,
      isRetryable: false,
    });
  }

  async healthCheck(): Promise<GatewayHealthStatus> {
    const start = performance.now();
    try {
      const response = await fetchWithTimeout(
        this.baseUrl,
        { method: 'GET', timeoutMs: 5000 },
        this.provider
      );
      const latencyMs = Math.round(performance.now() - start);
      return {
        provider: this.provider,
        status: response.ok || response.status < 500 ? 'UP' : 'DEGRADED',
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