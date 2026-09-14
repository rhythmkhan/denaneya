import crypto from 'node:crypto';
import { EC_P256_TEST_KEY } from '../fixtures/crypto-keys.js';

export function generateWebhookSignature(
  payload: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000)
): string {
  const signaturePayload = `${timestamp}.${payload}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(signaturePayload);
  const signature = hmac.digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

export function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds: number = 300
): boolean {
  if (!signatureHeader) return false;

  const parts = signatureHeader.split(',');
  let timestamp: number | null = null;
  let signature: string | null = null;

  for (const part of parts) {
    const [key, val] = part.split('=');
    if (key === 't' && val) timestamp = Number.parseInt(val, 10);
    if (key === 'v1' && val) signature = val;
  }

  if (!timestamp || !signature) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return false;
  }

  const expectedSignaturePayload = `${timestamp}.${payload}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(expectedSignaturePayload);
  const expectedSignature = hmac.digest('hex');

  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expectedSignature, 'hex');
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

export function signDevicePayload(
  payload: Record<string, any>,
  privateKeyPem: string = EC_P256_TEST_KEY.privateKeyPem
): string {
  const canonical = JSON.stringify(payload);
  const signer = crypto.createSign('SHA256');
  signer.update(canonical);
  return signer.sign(privateKeyPem, 'base64');
}

export function verifyDevicePayload(
  payload: Record<string, any>,
  signatureBase64: string,
  publicKeyPem: string = EC_P256_TEST_KEY.publicKeyPem
): boolean {
  try {
    const canonical = JSON.stringify(payload);
    const verifier = crypto.createVerify('SHA256');
    verifier.update(canonical);
    return verifier.verify(publicKeyPem, signatureBase64, 'base64');
  } catch {
    return false;
  }
}
