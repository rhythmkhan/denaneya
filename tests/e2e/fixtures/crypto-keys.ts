import crypto from 'node:crypto';

// Pre-generated EC P-256 (prime256v1) key pair
const ecKeyPair = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

export const EC_P256_TEST_KEY = {
  publicKeyPem: ecKeyPair.publicKey,
  privateKeyPem: ecKeyPair.privateKey,
};

// Pre-generated RSA-2048 key pair
const rsaKeyPair = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

export const RSA_2048_TEST_KEY = {
  publicKeyPem: rsaKeyPair.publicKey,
  privateKeyPem: rsaKeyPair.privateKey,
};

export const AES_256_MASTER_KEY_HEX =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

export const WEBHOOK_TEST_SECRET = 'whsec_test_secret_1234567890abcdef12345678';

export function createTestEcKeyPair() {
  return crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

export function createTestRsaKeyPair() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}
