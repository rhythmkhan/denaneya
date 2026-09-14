import { Paisa } from '@denaneya/payment-core';
import type { MfsProvider, ParsedSmsResult, ProviderParser, SmsTransactionType } from '../types.js';
import { computeSmsHash } from '../utils/crypto.js';
import { normalizeBengaliNumerals } from '../utils/bengali.js';

export abstract class BaseProviderParser implements ProviderParser {
  abstract readonly provider: MfsProvider;
  abstract readonly verifiedSenders: readonly string[];
  abstract readonly version: string;

  /**
   * Verifies if sender is in the provider's verified mask whitelist
   */
  isSenderVerified(sender: string): boolean {
    const clean = sender.trim().toUpperCase();
    return this.verifiedSenders.some((s) => s.toUpperCase() === clean);
  }

  abstract canParse(sender: string, text: string): boolean;
  abstract parse(sender: string, text: string): ParsedSmsResult;

  /**
   * Helper to construct a standard ParsedSmsResult
   */
  protected createResult(params: {
    type: SmsTransactionType;
    trxId: string;
    amountPaisa: Paisa;
    feePaisa?: Paisa;
    counterparty?: string | null;
    balancePaisa?: Paisa | null;
    reference?: string | null;
    timestamp: Date;
    rawSms: string;
    sender: string;
    confidence?: number;
    metadata?: Record<string, unknown>;
  }): ParsedSmsResult {
    const fee = params.feePaisa ?? Paisa.zero();
    const balance = params.balancePaisa ?? null;
    const counterparty = params.counterparty ?? null;
    const reference = params.reference ?? null;
    const isVerified = this.isSenderVerified(params.sender);
    const hash = computeSmsHash(
      this.provider,
      params.trxId,
      params.amountPaisa.amountPaisa,
      params.sender
    );

    return {
      provider: this.provider,
      type: params.type,
      trxId: params.trxId.trim().toUpperCase(),
      amountPaisa: params.amountPaisa,
      feePaisa: fee,
      counterparty,
      balancePaisa: balance,
      reference,
      timestamp: params.timestamp,
      rawSms: params.rawSms,
      smsHash: hash,
      parserVersion: this.version,
      confidence: params.confidence ?? (isVerified ? 1.0 : 0.6),
      status: 'SUCCESS',
      isSenderVerified: isVerified,
      metadata: params.metadata,

      // Aliases
      rawText: params.rawSms,
      deduplicationHash: hash,
      counterpartyMsisdn: counterparty,
      newBalancePaisa: balance,
    };
  }

  /**
   * Extracts Paisa safely from a BDT string (e.g. "1,250.00", "500", or "১,২৫০.০০")
   * Guaranteed zero floating-point arithmetic.
   */
  protected parsePaisa(amountStr: string): Paisa {
    if (!amountStr) return Paisa.zero();
    let clean = normalizeBengaliNumerals(amountStr).replace(/,/g, '').trim();

    // Strip trailing zeros beyond 2 decimal places (e.g. 10.500 -> 10.50)
    const dotIdx = clean.indexOf('.');
    if (dotIdx !== -1 && clean.length - dotIdx - 1 > 2) {
      clean = clean.replace(/(\.\d{2})0+$/, '$1');
      const m = clean.match(/^([+-]?\d+)\.(\d+)$/);
      if (m && m[2]!.length > 2) {
        const whole = BigInt(m[1]!);
        const fracDigits = m[2]!;
        const firstTwo = BigInt(fracDigits.slice(0, 2));
        const third = parseInt(fracDigits[2]!, 10);
        const roundedFrac = third >= 5 ? firstTwo + 1n : firstTwo;
        const totalPaisa = whole * 100n + (whole >= 0n ? roundedFrac : -roundedFrac);
        return new Paisa(totalPaisa);
      }
    }

    return Paisa.fromBDT(clean);
  }
}