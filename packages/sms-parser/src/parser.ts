import { Paisa } from '@denaneya/payment-core';
import { BkashParser } from './parsers/bkash.js';
import { NagadParser } from './parsers/nagad.js';
import { RocketParser } from './parsers/rocket.js';
import { UpayParser } from './parsers/upay.js';
import type {
  MfsProvider,
  ParseSmsOptions,
  ParsedSmsResult,
  ProviderParser,
} from './types.js';
import { sanitizeSmsText } from './utils/bengali.js';
import { computeUnrecognizedSmsHash } from './utils/crypto.js';

export class SmsParserFacade {
  private readonly parsers: Map<MfsProvider, ProviderParser> = new Map();

  constructor() {
    this.registerParser(new BkashParser());
    this.registerParser(new NagadParser());
    this.registerParser(new RocketParser());
    this.registerParser(new UpayParser());
  }

  private registerParser(parser: ProviderParser): void {
    this.parsers.set(parser.provider, parser);
  }

  /**
   * Detects the MFS provider from sender mask or content signatures
   */
  detectProvider(sender: string, text: string): MfsProvider | null {
    const cleanSender = sender.trim().toUpperCase();

    // 1. Direct Sender Mask Matching
    for (const [provider, parser] of this.parsers.entries()) {
      if (parser.verifiedSenders.some((s) => s.toUpperCase() === cleanSender)) {
        return provider;
      }
    }

    // 2. Content-Based Heuristics
    const sanitized = sanitizeSmsText(text);

    if (
      sanitized.includes('bKash') ||
      sanitized.includes('Payment Tk') ||
      sanitized.includes('You have received Tk')
    ) {
      return 'BKASH';
    }

    if (
      sanitized.includes('Nagad') ||
      sanitized.includes('Merchant Pay') ||
      sanitized.includes('Money Received')
    ) {
      return 'NAGAD';
    }

    if (
      sanitized.includes('Rocket') ||
      sanitized.includes('DBBL') ||
      sanitized.includes('A/C:') ||
      sanitized.includes('received from A/C')
    ) {
      return 'ROCKET';
    }

    if (
      sanitized.includes('upay') ||
      sanitized.includes('Upay') ||
      sanitized.includes('UCB') ||
      (sanitized.includes('TrxID:') && sanitized.includes('Time:'))
    ) {
      return 'UPAY';
    }

    return null;
  }

  /**
   * Parses an MFS SMS from any provider into a standardized ParsedSmsResult.
   */
  parse(sender: string, text: string, options?: ParseSmsOptions): ParsedSmsResult {
    const detectedProvider = options?.fallbackProvider ?? this.detectProvider(sender, text);

    if (detectedProvider) {
      const parser = this.parsers.get(detectedProvider);
      if (parser && parser.canParse(sender, text)) {
        try {
          return parser.parse(sender, text);
        } catch {
          // Regex failed to capture full structure; fall through to unrecognized
        }
      }
    }

    // Unrecognized SMS Fallback
    const unrecHash = computeUnrecognizedSmsHash(sender, text);
    return {
      provider: (detectedProvider ?? 'BKASH') as MfsProvider,
      type: 'UNKNOWN',
      trxId: '',
      amountPaisa: Paisa.zero(),
      feePaisa: Paisa.zero(),
      counterparty: null,
      balancePaisa: null,
      reference: null,
      timestamp: new Date(),
      rawSms: text,
      smsHash: unrecHash,
      parserVersion: 'unrecognized_v1',
      confidence: 0.0,
      status: 'PARSER_UNRECOGNIZED',
      isSenderVerified: false,
      metadata: {
        rawSender: sender,
        detectedProvider,
        reason: 'SMS format did not match any active provider regex patterns.',
      },

      // Aliases
      rawText: text,
      deduplicationHash: unrecHash,
      counterpartyMsisdn: null,
      newBalancePaisa: null,
    };
  }
}

// Global Singleton Instance & Direct Helper Export
export const defaultSmsParser = new SmsParserFacade();

export function parseMfsSms(
  sender: string,
  text: string,
  options?: ParseSmsOptions
): ParsedSmsResult {
  return defaultSmsParser.parse(sender, text, options);
}