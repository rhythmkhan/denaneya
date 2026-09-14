import * as crypto from 'node:crypto';

/**
 * Signs data using RSA-SHA256 with private key.
 * Returns Base64 encoded signature.
 */
export function rsaSign(data: string | Buffer, privateKeyPem: string): string {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(typeof data === 'string' ? Buffer.from(data, 'utf8') : data);
  return signer.sign(privateKeyPem, 'base64');
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
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(typeof data === 'string' ? Buffer.from(data, 'utf8') : data);
    return verifier.verify(publicKeyPem, Buffer.from(signatureBase64, 'base64'));
  } catch {
    return false;
  }
}

/**
 * Encrypts data using RSA public key with PKCS1 padding.
 * Returns Base64 encoded ciphertext.
 */
export function rsaEncrypt(data: string | Buffer, publicKeyPem: string): string {
  const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  const encrypted = crypto.publicEncrypt(
    {
      key: publicKeyPem,
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
  const decrypted = crypto.privateDecrypt(
    {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(cipherTextBase64, 'base64')
  );
  return decrypted.toString('utf8');
}