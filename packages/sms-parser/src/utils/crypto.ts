import * as crypto from 'node:crypto';
import type { MfsProvider } from '../types.js';

/**
 * Computes deterministic SHA-256 deduplication hash for recognized MFS transactions:
 * SHA-256(provider + ":" + trxId + ":" + amountPaisa + ":" + normalizedSender)
 */
export function computeSmsHash(
  provider: MfsProvider,
  trxId: string,
  amountPaisa: bigint,
  sender: string
): string {
  const normalizedSender = sender.trim().toUpperCase();
  const normalizedTrxId = trxId.trim().toUpperCase();
  const payload = `${provider}:${normalizedTrxId}:${amountPaisa.toString()}:${normalizedSender}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Computes deterministic SHA-256 hash for unrecognized SMS messages:
 * SHA-256("UNRECOGNIZED:" + normalizedSender + ":" + rawText.trim())
 */
export function computeUnrecognizedSmsHash(sender: string, rawText: string): string {
  const normalizedSender = sender.trim().toUpperCase();
  const payload = `UNRECOGNIZED:${normalizedSender}:${rawText.trim()}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}