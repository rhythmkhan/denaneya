import crypto from 'node:crypto';
import type { EncryptedEnvelope, EncryptionOptions } from './types.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const DEK_LENGTH = 32; // 256 bits

/**
 * Constant-time string comparison to mitigate timing attacks on AAD context validation.
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export class EncryptionService {
  private masterKek: Buffer;

  constructor(masterKeyHexOrBase64?: string) {
    const rawKey = masterKeyHexOrBase64 || process.env.ENCRYPTION_MASTER_KEY || process.env.MASTER_ENCRYPTION_KEY;
    if (!rawKey) {
      throw new Error(
        'Master encryption key is not configured. Supply parameter or set ENCRYPTION_MASTER_KEY.'
      );
    }
    this.masterKek = this.parseOrDeriveMasterKey(rawKey);
  }

  private parseOrDeriveMasterKey(keyInput: string): Buffer {
    // If hex 64 chars -> 32 bytes
    if (/^[0-9a-fA-F]{64}$/.test(keyInput)) {
      return Buffer.from(keyInput, 'hex');
    }
    // If base64 44 chars -> 32 bytes
    if (/^[A-Za-z0-9+/]{43}=?$/.test(keyInput)) {
      const buf = Buffer.from(keyInput, 'base64');
      if (buf.length === 32) return buf;
    }
    // Otherwise derive 32-byte KEK via HKDF-SHA256
    return this.deriveHkdfKey(
      Buffer.from(keyInput, 'utf-8'),
      Buffer.from('denaneya-salt-master-kek', 'utf-8'),
      'denaneya-kek-derivation'
    );
  }

  public deriveHkdfKey(ikm: Buffer, salt: Buffer, info: string, length = 32): Buffer {
    return Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from(info, 'utf-8'), length));
  }

  public async derivePbkdf2Key(password: string, salt: Buffer, iterations = 100_000, length = 32): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, iterations, length, 'sha256', (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      });
    });
  }

  /**
   * Encrypts plaintext using AES-256-GCM envelope encryption.
   * Generates a unique DEK per encryption, encrypts DEK under KEK,
   * encrypts plaintext under DEK with IV and auth tag.
   */
  public encrypt(plaintext: string | Buffer, options: EncryptionOptions = {}): EncryptedEnvelope {
    const bufferData = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf-8');
    const aadBuffer = options.aad ? Buffer.from(options.aad, 'utf-8') : undefined;

    // 1. Generate unique DEK
    const dek = crypto.randomBytes(DEK_LENGTH);

    // 2. Encrypt plaintext with DEK
    const payloadIv = crypto.randomBytes(IV_LENGTH);
    const payloadCipher = crypto.createCipheriv(ALGORITHM, dek, payloadIv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    if (aadBuffer) {
      payloadCipher.setAAD(aadBuffer);
    }
    const encryptedPayload = Buffer.concat([payloadCipher.update(bufferData), payloadCipher.final()]);
    const payloadAuthTag = payloadCipher.getAuthTag();

    // 3. Encrypt DEK under Master KEK
    const dekIv = crypto.randomBytes(IV_LENGTH);
    const kekCipher = crypto.createCipheriv(ALGORITHM, this.masterKek, dekIv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    const encryptedDek = Buffer.concat([kekCipher.update(dek), kekCipher.final()]);
    const dekAuthTag = kekCipher.getAuthTag();

    return {
      version: 1,
      algorithm: 'AES-256-GCM',
      encryptedDek: encryptedDek.toString('base64'),
      dekIv: dekIv.toString('base64'),
      dekAuthTag: dekAuthTag.toString('base64'),
      iv: payloadIv.toString('base64'),
      authTag: payloadAuthTag.toString('base64'),
      ciphertext: encryptedPayload.toString('base64'),
      ...(options.aad && { aad: Buffer.from(options.aad, 'utf-8').toString('base64') }),
    };
  }

  /**
   * Decrypts an EncryptedEnvelope back to UTF-8 plaintext.
   * Validates DEK authenticity, payload authenticity, and enforces strict AAD tenant context binding.
   */
  public decrypt(envelope: EncryptedEnvelope, options: EncryptionOptions = {}): string {
    if (envelope.version !== 1 || envelope.algorithm !== 'AES-256-GCM') {
      throw new Error(`Unsupported encryption envelope version or algorithm: ${envelope.version}/${envelope.algorithm}`);
    }

    // 1. Decrypt DEK using Master KEK
    const dekIv = Buffer.from(envelope.dekIv, 'base64');
    const dekAuthTag = Buffer.from(envelope.dekAuthTag, 'base64');
    const encryptedDek = Buffer.from(envelope.encryptedDek, 'base64');

    const kekDecipher = crypto.createDecipheriv(ALGORITHM, this.masterKek, dekIv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    kekDecipher.setAuthTag(dekAuthTag);
    const dek = Buffer.concat([kekDecipher.update(encryptedDek), kekDecipher.final()]);

    // 2. Decrypt Payload using DEK
    const payloadIv = Buffer.from(envelope.iv, 'base64');
    const payloadAuthTag = Buffer.from(envelope.authTag, 'base64');
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64');

    const payloadDecipher = crypto.createDecipheriv(ALGORITHM, dek, payloadIv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    // 3. Strict AAD validation and authentication
    const envelopeAad = typeof envelope.aad === 'string' && envelope.aad.length > 0
      ? Buffer.from(envelope.aad, 'base64').toString('utf-8')
      : undefined;
    const callerAad = typeof options?.aad === 'string' && options.aad.length > 0
      ? options.aad
      : undefined;

    // Case 1: Envelope has AAD, but caller did not provide non-empty AAD context
    if (envelopeAad !== undefined && callerAad === undefined) {
      throw new Error(
        'AAD authentication error: envelope is bound to AAD context, but caller did not provide expected AAD (unable to authenticate data)'
      );
    }

    // Case 2: Caller provided AAD context, but envelope was not encrypted with AAD
    if (envelopeAad === undefined && callerAad !== undefined) {
      throw new Error(
        'AAD authentication error: caller provided AAD context, but envelope was not encrypted with AAD (unable to authenticate data)'
      );
    }

    // Case 3: Both have AAD; assert strict equality and pass to cipher
    if (envelopeAad !== undefined && callerAad !== undefined) {
      if (!timingSafeStringEqual(envelopeAad, callerAad)) {
        throw new Error(
          'AAD authentication error: caller AAD mismatch with envelope AAD (unable to authenticate data)'
        );
      }
      payloadDecipher.setAAD(Buffer.from(callerAad, 'utf-8'));
    }

    // 4. Verify GCM authentication tag and decrypt
    payloadDecipher.setAuthTag(payloadAuthTag);
    const decrypted = Buffer.concat([payloadDecipher.update(ciphertext), payloadDecipher.final()]);

    return decrypted.toString('utf-8');
  }

  /**
   * Compact serialization for database storage:
   * v1.aes256gcm.<encryptedDek>.<dekIv>.<dekAuthTag>.<iv>.<authTag>.<ciphertext>[.<aad>]
   */
  public serialize(envelope: EncryptedEnvelope): string {
    const parts = [
      'v1',
      'aes256gcm',
      envelope.encryptedDek,
      envelope.dekIv,
      envelope.dekAuthTag,
      envelope.iv,
      envelope.authTag,
      envelope.ciphertext,
    ];
    if (envelope.aad) {
      parts.push(envelope.aad);
    }
    return parts.join('.');
  }

  public deserialize(serialized: string): EncryptedEnvelope {
    const parts = serialized.split('.');
    if (parts.length < 8 || parts.length > 9 || parts[0] !== 'v1' || parts[1] !== 'aes256gcm') {
      throw new Error('Invalid serialized encryption envelope format');
    }
    return {
      version: 1,
      algorithm: 'AES-256-GCM',
      encryptedDek: parts[2]!,
      dekIv: parts[3]!,
      dekAuthTag: parts[4]!,
      iv: parts[5]!,
      authTag: parts[6]!,
      ciphertext: parts[7]!,
      ...(parts[8] && { aad: parts[8] }),
    };
  }

  public encryptField(plaintext: string, context?: { aad?: string }): string {
    const envelope = this.encrypt(plaintext, context);
    return this.serialize(envelope);
  }

  public decryptField(serialized: string, context?: { aad?: string }): string {
    const envelope = this.deserialize(serialized);
    return this.decrypt(envelope, context);
  }
}

export const encryptionService = new EncryptionService(
  process.env.ENCRYPTION_MASTER_KEY ||
  process.env.MASTER_ENCRYPTION_KEY ||
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
);
