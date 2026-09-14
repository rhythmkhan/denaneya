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
  NagadConfig,
  GatewayTransactionStatus,
} from '../types.js';
import { fetchWithTimeout, parseJsonResponse } from '../utils/http.js';
import { rsaEncrypt, rsaDecrypt, rsaSign, rsaVerify } from '../crypto/rsa.js';

export class NagadAdapter extends BasePaymentGatewayAdapter<NagadConfig> {
  readonly provider = 'NAGAD' as const;
  readonly supportedMethods = ['NAGAD'] as const;

  private get baseUrl(): string {
    return this.config.isSandbox
      ? 'http://sandbox.mynagad.com:10080/remote-payment-gateway-1.0/api/dfs'
      : 'https://api.mynagad.com/api/dfs';
  }

  private formatDateTime(d = new Date()): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return (
      d.getFullYear().toString() +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) +
      pad(d.getHours()) +
      pad(d.getMinutes()) +
      pad(d.getSeconds())
    );
  }

  async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    const datetime = this.formatDateTime();
    const challenge = crypto.randomBytes(16).toString('hex');
    const orderId = params.paymentId;

    // Step 1: Initialize
    const sensitiveDataInit = JSON.stringify({
      merchantId: this.config.merchantId,
      datetime,
      orderId,
      challenge,
    });

    const encSensitiveDataInit = rsaEncrypt(sensitiveDataInit, this.config.nagadPublicKey);
    const signatureInit = rsaSign(sensitiveDataInit, this.config.merchantPrivateKey);

    const initUrl = `${this.baseUrl}/check-out/initialize/${this.config.merchantId}/${orderId}`;
    const initResponse = await fetchWithTimeout(
      initUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-KM-Api-Version': 'v-0.2',
          'X-KM-IP-V4': params.clientIp || '127.0.0.1',
          'X-KM-Client-Type': 'PC_WEB',
        },
        body: JSON.stringify({
          dateTime: datetime,
          sensitiveData: encSensitiveDataInit,
          signature: signatureInit,
        }),
        timeoutMs: this.config.timeoutMs,
      },
      this.provider
    );

    const initData: any = await parseJsonResponse(initResponse, this.provider);

    if (!initData.sensitiveData) {
      throw new GatewayError({
        provider: this.provider,
        code: 'INVALID_REQUEST',
        message: initData.message || 'Nagad check-out initialize failed',
        rawResponse: initData,
      });
    }

    const decryptedInitJson = rsaDecrypt(initData.sensitiveData, this.config.merchantPrivateKey);
    const decryptedInit = JSON.parse(decryptedInitJson);
    const paymentReferenceId = decryptedInit.paymentReferenceId;
    const serverChallenge = decryptedInit.challenge || challenge;

    // Step 2: Complete Checkout Initialization
    const sensitiveDataComplete = JSON.stringify({
      merchantId: this.config.merchantId,
      orderId,
      currencyCode: '050',
      amount: this.formatBDT(params.amount),
      challenge: serverChallenge,
    });

    const encSensitiveDataComplete = rsaEncrypt(
      sensitiveDataComplete,
      this.config.nagadPublicKey
    );
    const signatureComplete = rsaSign(sensitiveDataComplete, this.config.merchantPrivateKey);

    const completeUrl = `${this.baseUrl}/check-out/complete/${paymentReferenceId}`;
    const completeResponse = await fetchWithTimeout(
      completeUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-KM-Api-Version': 'v-0.2',
          'X-KM-IP-V4': params.clientIp || '127.0.0.1',
          'X-KM-Client-Type': 'PC_WEB',
        },
        body: JSON.stringify({
          sensitiveData: encSensitiveDataComplete,
          signature: signatureComplete,
          merchantCallbackURL: params.returnUrl,
        }),
        timeoutMs: this.config.timeoutMs,
      },
      this.provider
    );

    const completeData: any = await parseJsonResponse(completeResponse, this.provider);

    if (completeData.status !== 'Success' && !completeData.callBackUrl) {
      throw new GatewayError({
        provider: this.provider,
        code: 'INVALID_REQUEST',
        message: completeData.message || 'Nagad check-out complete failed',
        rawResponse: completeData,
      });
    }

    return {
      provider: this.provider,
      redirectUrl: completeData.callBackUrl,
      providerPaymentId: paymentReferenceId,
      sessionData: {
        paymentReferenceId,
        orderId,
      },
    };
  }

  async verifyPayment(params: VerifyPaymentParams): Promise<VerifyPaymentResult> {
    const paymentRefId =
      (params.rawCallbackParams?.payment_ref_id as string) ||
      params.providerPaymentId ||
      params.paymentId;

    if (!paymentRefId) {
      throw new GatewayError({
        provider: this.provider,
        code: 'INVALID_REQUEST',
        message: 'Missing payment reference ID for Nagad payment verification',
      });
    }

    const url = `${this.baseUrl}/verify/payment/${paymentRefId}`;
    const response = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: {
          'X-KM-Api-Version': 'v-0.2',
        },
        timeoutMs: this.config.timeoutMs,
      },
      this.provider
    );

    const data: any = await parseJsonResponse(response, this.provider);

    if (!data || !data.status) {
      throw new GatewayError({
        provider: this.provider,
        code: 'GATEWAY_UNAVAILABLE',
        message: 'Nagad verify response missing status field',
        httpStatus: 502,
        isRetryable: true,
        rawResponse: data,
      });
    }

    const statusMap: Record<string, GatewayTransactionStatus> = {
      Success: 'COMPLETED',
      Failed: 'FAILED',
      Cancelled: 'CANCELLED',
      Pending: 'PENDING',
    };

    const status =
      data.status === 'Success' && data.statusCode === '000'
        ? 'COMPLETED'
        : statusMap[data.status] || 'FAILED';

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
        providerTrxId: data.issuerPaymentRefNo || paymentRefId,
        providerPaymentId: data.paymentRefId || paymentRefId,
        amount: verifiedAmount,
        fee: Paisa.zero(),
        currency: 'BDT',
        customerPhone: data.clientMobileNo,
        cardType: 'Nagad',
        paidAt: data.issuerPaymentDateTime
          ? new Date(data.issuerPaymentDateTime)
          : new Date(),
        rawResponse: data,
      };
    }

    return {
      provider: this.provider,
      status,
      providerTrxId: data.issuerPaymentRefNo || paymentRefId,
      providerPaymentId: data.paymentRefId || paymentRefId,
      amount: data.amount ? this.parseBDT(data.amount) : Paisa.zero(),
      fee: Paisa.zero(),
      currency: 'BDT',
      cardType: 'Nagad',
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
      message: 'Nagad Direct PGW refunds must be processed through the merchant management portal',
    });
  }

  async verifyWebhookSignature(
    headers: Record<string, string>,
    body: string | Record<string, unknown>
  ): Promise<boolean> {
    const signature = headers['x-km-signature'] || headers['signature'];
    if (!signature) {
      return false;
    }

    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    return rsaVerify(payload, signature, this.config.nagadPublicKey);
  }

  async queryPayment(providerTrxId: string): Promise<PaymentDetailsResult> {
    const result = await this.verifyPayment({ paymentId: providerTrxId, providerPaymentId: providerTrxId });
    return {
      provider: this.provider,
      paymentId: providerTrxId,
      providerTrxId: result.providerTrxId,
      status: result.status,
      amount: result.amount,
      currency: 'BDT',
      customerMsisdn: result.customerPhone,
      paidAt: result.paidAt,
      rawResponse: result.rawResponse,
    };
  }

  async queryRefund(_refundId: string): Promise<RefundDetailsResult> {
    throw new GatewayError({
      provider: this.provider,
      code: 'REFUND_NOT_ALLOWED',
      message: 'Nagad PGW does not support automated API refund query; refunds are managed via merchant portal',
      httpStatus: 400,
      isRetryable: false,
    });
  }

  async healthCheck(): Promise<GatewayHealthStatus> {
    const start = performance.now();
    try {
      const response = await fetchWithTimeout(
        `${this.baseUrl}/check-out/initialize/${this.config.merchantId}/health_test`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-KM-Api-Version': 'v-0.2',
          },
          body: JSON.stringify({}),
          timeoutMs: 5000,
        },
        this.provider
      );
      const latencyMs = Math.round(performance.now() - start);
      return {
        provider: this.provider,
        status: response.status < 500 ? 'UP' : 'DEGRADED',
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