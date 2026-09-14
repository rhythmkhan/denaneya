import { describe, it, expect } from 'vitest';
import { EncryptionService } from '../src/encryption.js';

describe('EncryptionService (AES-256-GCM Envelope Encryption)', () => {
  const masterKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const service = new EncryptionService(masterKey);

  it('T2.1: encrypts and decrypts arbitrary plaintext round-trip', () => {
    const secret = 'bkash_secret_passphrase_12345';
    const envelope = service.encrypt(secret);

    expect(envelope.version).toBe(1);
    expect(envelope.algorithm).toBe('AES-256-GCM');
    expect(envelope.encryptedDek).toBeDefined();
    expect(envelope.iv).toBeDefined();
    expect(envelope.authTag).toBeDefined();
    expect(envelope.ciphertext).toBeDefined();

    const decrypted = service.decrypt(envelope);
    expect(decrypted).toBe(secret);
  });

  it('T2.2: rejects decryption when authentication tag is tampered with', () => {
    const envelope = service.encrypt('sensitive_api_token');
    // Tamper with payload auth tag
    const tagBuffer = Buffer.from(envelope.authTag, 'base64');
    tagBuffer[0] = (tagBuffer[0]! ^ 0xff); // Flip bits
    const tampered = { ...envelope, authTag: tagBuffer.toString('base64') };

    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('T2.3: rejects decryption when ciphertext is tampered with', () => {
    const envelope = service.encrypt('payload_data_integrity_check');
    const cipherBuffer = Buffer.from(envelope.ciphertext, 'base64');
    cipherBuffer[0] = (cipherBuffer[0]! ^ 0x01);
    const tampered = { ...envelope, ciphertext: cipherBuffer.toString('base64') };

    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('T2.4: enforces Additional Authenticated Data (AAD) tenant binding', () => {
    const secret = 'merchant_private_rsa_key';
    const envelope = service.encrypt(secret, { aad: 'tenant_mch_123' });

    // Decrypting with correct AAD succeeds
    const decrypted = service.decrypt(envelope, { aad: 'tenant_mch_123' });
    expect(decrypted).toBe(secret);

    // Decrypting with wrong AAD fails
    expect(() => service.decrypt(envelope, { aad: 'tenant_mch_999' })).toThrow();
  });

  it('T2.5: derives deterministic 32-byte keys via HKDF and PBKDF2', async () => {
    const ikm = Buffer.from('raw_seed_material_123', 'utf-8');
    const salt = Buffer.from('salt_456', 'utf-8');
    const hkdfKey = service.deriveHkdfKey(ikm, salt, 'info_label', 32);
    expect(hkdfKey).toBeInstanceOf(Buffer);
    expect(hkdfKey.length).toBe(32);

    const pbkdf2Key = await service.derivePbkdf2Key('password123', salt, 1000, 32);
    expect(pbkdf2Key).toBeInstanceOf(Buffer);
    expect(pbkdf2Key.length).toBe(32);
  });

  it('T2.6: serializes to compact string format and deserializes back faithfully', () => {
    const secret = 'webhook_hmac_signing_key_sample';
    const envelope = service.encrypt(secret, { aad: 'mch_001' });

    const serialized = service.serialize(envelope);
    expect(serialized.startsWith('v1.aes256gcm.')).toBe(true);

    const deserialized = service.deserialize(serialized);
    expect(service.decrypt(deserialized, { aad: 'mch_001' })).toBe(secret);
  });

  it('T2.7: encryptField and decryptField provide convenient single-string storage', () => {
    const serializedField = service.encryptField('direct_field_value', { aad: 'ctx' });
    expect(typeof serializedField).toBe('string');

    const recovered = service.decryptField(serializedField, { aad: 'ctx' });
    expect(recovered).toBe('direct_field_value');
  });

  it('T2.8: handles base64 keys and derived passphrase keys', () => {
    const b64Key = Buffer.alloc(32, 7).toString('base64');
    const b64Service = new EncryptionService(b64Key);
    const enc = b64Service.encrypt('test_b64');
    expect(b64Service.decrypt(enc)).toBe('test_b64');

    const passService = new EncryptionService('short_passphrase_here');
    const encPass = passService.encrypt('test_pass');
    expect(passService.decrypt(encPass)).toBe('test_pass');

    expect(() => service.deserialize('invalid.envelope')).toThrow();
  });

  it('T2.9: rejects decryption when AAD is present on envelope but omitted by caller', () => {
    const envelope = service.encrypt('tenant_secret', { aad: 'tenant:mch_123' });
    expect(() => service.decrypt(envelope)).toThrow(/unable to authenticate data/i);
  });

  it('T2.10: rejects decryption when caller provides empty string AAD for AAD-bound envelope', () => {
    const envelope = service.encrypt('tenant_secret', { aad: 'tenant:mch_123' });
    expect(() => service.decrypt(envelope, { aad: '' })).toThrow(/unable to authenticate data/i);
  });

  it('T2.11: rejects decryption when caller provides mismatched AAD context', () => {
    const envelope = service.encrypt('tenant_secret', { aad: 'tenant:mch_alpha' });
    expect(() => service.decrypt(envelope, { aad: 'tenant:mch_beta' })).toThrow(/unable to authenticate data/i);
  });

  it('T2.12: rejects decryption when caller provides AAD prefix or suffix', () => {
    const envelope = service.encrypt('tenant_secret', { aad: 'tenant_123' });
    expect(() => service.decrypt(envelope, { aad: 'tenant_12' })).toThrow(/unable to authenticate data/i);
    expect(() => service.decrypt(envelope, { aad: 'tenant_1234' })).toThrow(/unable to authenticate data/i);
  });

  it('T2.13: rejects decryption when caller provides AAD for an envelope without AAD', () => {
    const envelope = service.encrypt('non_aad_secret');
    expect(() => service.decrypt(envelope, { aad: 'tenant:mch_123' })).toThrow(/unable to authenticate data/i);
  });

  it('T2.14: rejects decryption of serialized envelope when serialized AAD part is tampered', () => {
    const serialized = service.encryptField('field_secret', { aad: 'tenant_xyz' });
    const parts = serialized.split('.');
    parts[8] = Buffer.from('tampered_tenant', 'utf-8').toString('base64');
    const tampered = parts.join('.');

    expect(() => service.decryptField(tampered, { aad: 'tenant_xyz' })).toThrow(/unable to authenticate data/i);
  });
});
