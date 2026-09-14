import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, needsRehash } from '../src/password.js';

describe('Argon2id Password Hashing & Verification', () => {
  it('T2.8: hashes password producing compliant $argon2id$ format', async () => {
    // For test speed, use lower memory in test
    const hash = await hashPassword('MerchantSecureP@ss123', { memoryCost: 4096, timeCost: 2 });
    expect(hash.startsWith('$argon2id$v=19$')).toBe(true);
    expect(hash).toContain('m=4096,t=2,p=1');
  });

  it('T2.9: correctly verifies valid password', async () => {
    const password = 'SuperSecretMerchantKey!2026';
    const hash = await hashPassword(password, { memoryCost: 4096, timeCost: 2 });

    const isValid = await verifyPassword(hash, password);
    expect(isValid).toBe(true);
  });

  it('T2.10: rejects invalid password', async () => {
    const hash = await hashPassword('CorrectPassword', { memoryCost: 4096, timeCost: 2 });

    const isValid = await verifyPassword(hash, 'WrongPassword');
    expect(isValid).toBe(false);
  });

  it('T2.11: detects when stored hash needs rehashing based on target options', async () => {
    const lowCostHash = await hashPassword('OldPassword', { memoryCost: 1024, timeCost: 1 });
    expect(needsRehash(lowCostHash, { memoryCost: 65536, timeCost: 3 })).toBe(true);

    const highCostHash = await hashPassword('NewPassword', { memoryCost: 65536, timeCost: 3 });
    expect(needsRehash(highCostHash, { memoryCost: 65536, timeCost: 3 })).toBe(false);
  });
});
