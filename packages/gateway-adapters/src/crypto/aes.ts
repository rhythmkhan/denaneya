import * as crypto from 'node:crypto';

/**
 * AES-CBC encryption with PKCS7 padding.
 * Key must be 16, 24, or 32 bytes (for AES-128, AES-192, or AES-256).
 * IV must be 16 bytes.
 */
export function aesCbcEncrypt(
  plainText: string,
  key: Buffer | string,
  iv: Buffer | string
): string {
  const keyBuf = typeof key === 'string' ? Buffer.from(key, 'utf8') : key;
  const ivBuf = typeof iv === 'string' ? Buffer.from(iv, 'utf8') : iv;

  const algorithm =
    keyBuf.length === 16
      ? 'aes-128-cbc'
      : keyBuf.length === 24
      ? 'aes-192-cbc'
      : 'aes-256-cbc';

  const cipher = crypto.createCipheriv(algorithm, keyBuf, ivBuf);
  let encrypted = cipher.update(plainText, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return encrypted;
}

/**
 * AES-CBC decryption with PKCS7 padding.
 */
export function aesCbcDecrypt(
  cipherTextBase64: string,
  key: Buffer | string,
  iv: Buffer | string
): string {
  const keyBuf = typeof key === 'string' ? Buffer.from(key, 'utf8') : key;
  const ivBuf = typeof iv === 'string' ? Buffer.from(iv, 'utf8') : iv;

  const algorithm =
    keyBuf.length === 16
      ? 'aes-128-cbc'
      : keyBuf.length === 24
      ? 'aes-192-cbc'
      : 'aes-256-cbc';

  const decipher = crypto.createDecipheriv(algorithm, keyBuf, ivBuf);
  let decrypted = decipher.update(cipherTextBase64, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}