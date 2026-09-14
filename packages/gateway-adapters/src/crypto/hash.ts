import * as crypto from 'node:crypto';

/**
 * Computes MD5 hash as lowercase hexadecimal string.
 */
export function md5(data: string | Buffer): string {
  return crypto.createHash('md5').update(data).digest('hex');
}

/**
 * Computes SHA-256 hash as lowercase hexadecimal string.
 */
export function sha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Computes HMAC-SHA256 hash as lowercase hexadecimal string.
 */
export function hmacSha256(data: string | Buffer, key: string | Buffer): string {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}