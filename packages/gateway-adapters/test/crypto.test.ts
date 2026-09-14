import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import {
  aesCbcEncrypt,
  aesCbcDecrypt,
} from '../src/crypto/aes.js';
import {
  md5,
  sha256,
  hmacSha256,
} from '../src/crypto/hash.js';
import {
  rsaSign,
  rsaVerify,
  rsaEncrypt,
  rsaDecrypt,
} from '../src/crypto/rsa.js';

describe('Cryptographic Utilities', () => {
  describe('AES-CBC (aes.ts)', () => {
    it('encrypts and decrypts with 16-byte key (AES-128-CBC) using strings and Buffers', () => {
      const plaintext = 'DenaNeya Payment Secret Payload 128';
      const keyStr = '1234567890123456';
      const ivStr = 'abcdefghijklmnop';

      const cipherStr = aesCbcEncrypt(plaintext, keyStr, ivStr);
      expect(cipherStr).toBeTypeOf('string');
      const decryptedStr = aesCbcDecrypt(cipherStr, keyStr, ivStr);
      expect(decryptedStr).toBe(plaintext);

      const keyBuf = Buffer.from(keyStr, 'utf8');
      const ivBuf = Buffer.from(ivStr, 'utf8');
      const cipherBuf = aesCbcEncrypt(plaintext, keyBuf, ivBuf);
      const decryptedBuf = aesCbcDecrypt(cipherBuf, keyBuf, ivBuf);
      expect(decryptedBuf).toBe(plaintext);
    });

    it('encrypts and decrypts with 24-byte key (AES-192-CBC)', () => {
      const plaintext = 'Payment data for 192-bit test';
      const key24 = crypto.randomBytes(24);
      const iv16 = crypto.randomBytes(16);

      const cipher = aesCbcEncrypt(plaintext, key24, iv16);
      const decrypted = aesCbcDecrypt(cipher, key24, iv16);
      expect(decrypted).toBe(plaintext);
    });

    it('encrypts and decrypts with 32-byte key (AES-256-CBC)', () => {
      const plaintext = 'Highly secure transaction data for 256-bit test';
      const key32 = crypto.randomBytes(32);
      const iv16 = crypto.randomBytes(16);

      const cipher = aesCbcEncrypt(plaintext, key32, iv16);
      const decrypted = aesCbcDecrypt(cipher, key32, iv16);
      expect(decrypted).toBe(plaintext);
    });

    it('throws when decrypting invalid base64 or corrupted payload', () => {
      const key16 = crypto.randomBytes(16);
      const iv16 = crypto.randomBytes(16);

      expect(() => {
        aesCbcDecrypt('!!!invalid_base64$$$', key16, iv16);
      }).toThrow();
    });
  });

  describe('Hash Functions (hash.ts)', () => {
    it('computes MD5 correctly for string and Buffer', () => {
      const strHash = md5('hello world');
      expect(strHash).toBe('5eb63bbbe01eeed093cb22bb8f5acdc3');

      const bufHash = md5(Buffer.from('hello world', 'utf8'));
      expect(bufHash).toBe('5eb63bbbe01eeed093cb22bb8f5acdc3');
    });

    it('computes SHA-256 correctly for string and Buffer', () => {
      const strHash = sha256('hello world');
      expect(strHash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');

      const bufHash = sha256(Buffer.from('hello world', 'utf8'));
      expect(bufHash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    });

    it('computes HMAC-SHA256 correctly for string and Buffer', () => {
      const key = 'secret_key';
      const strHmac = hmacSha256('message_content', key);
      expect(strHmac).toBeTypeOf('string');
      expect(strHmac.length).toBe(64);

      const bufHmac = hmacSha256(Buffer.from('message_content', 'utf8'), Buffer.from(key, 'utf8'));
      expect(bufHmac).toBe(strHmac);
    });
  });

  describe('RSA Operations (rsa.ts)', () => {
    const keypair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    it('signs and verifies data with RSA-SHA256 using strings and Buffers', () => {
      const message = 'Important transaction verification payload';
      const sigStr = rsaSign(message, keypair.privateKey);
      expect(rsaVerify(message, sigStr, keypair.publicKey)).toBe(true);

      const msgBuf = Buffer.from(message, 'utf8');
      const sigBuf = rsaSign(msgBuf, keypair.privateKey);
      expect(rsaVerify(msgBuf, sigBuf, keypair.publicKey)).toBe(true);

      // Tampered message
      expect(rsaVerify('Tampered message', sigStr, keypair.publicKey)).toBe(false);

      // Tampered signature
      const badSig = Buffer.from(sigStr, 'base64');
      badSig[0] ^= 0xff;
      expect(rsaVerify(message, badSig.toString('base64'), keypair.publicKey)).toBe(false);
    });

    it('returns false in rsaVerify when signature or key is malformed (catch block)', () => {
      expect(rsaVerify('msg', 'invalid-base64!', keypair.publicKey)).toBe(false);
      expect(rsaVerify('msg', 'YWJj', 'not-a-valid-pem-key')).toBe(false);
    });

    it('encrypts and decrypts with RSA PKCS#1 padding using string and Buffer', () => {
      const secret = 'Confidential merchant credential';
      const encStr = rsaEncrypt(secret, keypair.publicKey);
      const decStr = rsaDecrypt(encStr, keypair.privateKey);
      expect(decStr).toBe(secret);

      const secBuf = Buffer.from(secret, 'utf8');
      const encBuf = rsaEncrypt(secBuf, keypair.publicKey);
      const decBuf = rsaDecrypt(encBuf, keypair.privateKey);
      expect(decBuf).toBe(secret);
    });
  });
});
