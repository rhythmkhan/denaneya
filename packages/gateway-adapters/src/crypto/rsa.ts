import * as crypto from 'node:crypto';

/**
 * Normalizes PEM formatted keys by decoding escaped newlines and trimming whitespace.
 * Particularly important when keys are loaded from environment variables (.env files).
 */
export function normalizePemKey(
  key: string,
  defaultType: 'PUBLIC KEY' | 'RSA PRIVATE KEY' = 'PUBLIC KEY'
): string {
  if (!key || typeof key !== 'string') return key;
  let normalized = key.trim();

  // Strip surrounding quotes if loaded verbatim from environment
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }

  if (normalized.includes('\\n')) {
    normalized = normalized.replace(/\\n/g, '\n');
  }

  // If a bare Base64 key without PEM header is provided (common with Nagad portal keys)
  if (!normalized.includes('-----BEGIN')) {
    const cleanB64 = normalized.replace(/\s+/g, '');
    const formatted = cleanB64.match(/.{1,64}/g)?.join('\n') ?? cleanB64;
    return `-----BEGIN ${defaultType}-----\n${formatted}\n-----END ${defaultType}-----`;
  }

  return normalized;
}

/**
 * Signs data using RSA-SHA256 with private key.
 * Returns Base64 encoded signature.
 */
export function rsaSign(data: string | Buffer, privateKeyPem: string): string {
  const normalizedKey = normalizePemKey(privateKeyPem, 'RSA PRIVATE KEY');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(typeof data === 'string' ? Buffer.from(data, 'utf8') : data);
  return signer.sign(normalizedKey, 'base64');
}

/**
 * Verifies RSA-SHA256 signature using public key.
 */
export function rsaVerify(
  data: string | Buffer,
  signatureBase64: string,
  publicKeyPem: string
): boolean {
  try {
    const normalizedKey = normalizePemKey(publicKeyPem, 'PUBLIC KEY');
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(typeof data === 'string' ? Buffer.from(data, 'utf8') : data);
    return verifier.verify(normalizedKey, Buffer.from(signatureBase64, 'base64'));
  } catch {
    return false;
  }
}

/**
 * Encrypts data using RSA public key with PKCS1 padding.
 * Returns Base64 encoded ciphertext.
 */
export function rsaEncrypt(data: string | Buffer, publicKeyPem: string): string {
  const normalizedKey = normalizePemKey(publicKeyPem, 'PUBLIC KEY');
  const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  const encrypted = crypto.publicEncrypt(
    {
      key: normalizedKey,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    buffer
  );
  return encrypted.toString('base64');
}

/**
 * Decrypts Base64 ciphertext using RSA private key with PKCS1 padding.
 * Returns UTF-8 decrypted plaintext.
 */
export function rsaDecrypt(cipherTextBase64: string, privateKeyPem: string): string {
  const normalizedKey = normalizePemKey(privateKeyPem, 'RSA PRIVATE KEY');
  const decrypted = crypto.privateDecrypt(
    {
      key: normalizedKey,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(cipherTextBase64, 'base64')
  );
  return decrypted.toString('utf8');
}