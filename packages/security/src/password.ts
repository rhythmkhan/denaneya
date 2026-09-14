import crypto from 'node:crypto';
import type { PasswordHashOptions } from './types.js';

let argon2Module: any = null;
let argon2Loaded = false;

async function loadArgon2() {
  if (argon2Loaded) return argon2Module;
  argon2Loaded = true;
  try {
    argon2Module = await import('@node-rs/argon2');
  } catch {
    argon2Module = null;
  }
  return argon2Module;
}

const DEFAULT_OPTIONS: Required<PasswordHashOptions> = {
  memoryCost: 65536, // 64 MB per OWASP recommendation
  timeCost: 3,       // 3 iterations
  parallelism: 1,    // 1 lane/thread
  outputLen: 32,     // 32-byte key
};

export async function hashPassword(
  plainPassword: string,
  options: PasswordHashOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const argon2 = await loadArgon2();
  if (argon2?.hash) {
    return argon2.hash(plainPassword, {
      memoryCost: opts.memoryCost,
      timeCost: opts.timeCost,
      parallelism: opts.parallelism,
      outputLen: opts.outputLen,
      algorithm: argon2.Algorithm?.Argon2id ?? 2,
      version: argon2.Version?.V0x13 ?? 19,
    });
  }

  // Cryptographic fallback (scrypt) when native argon2 binary is unavailable (e.g. Serverless/Edge)
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(plainPassword, salt, opts.outputLen || 32, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(`$scrypt$N=16384,r=8,p=1$${salt}$${derivedKey.toString('hex')}`);
    });
  });
}

export async function verifyPassword(
  storedHash: string,
  plainPassword: string
): Promise<boolean> {
  try {
    if (storedHash.startsWith('$argon2')) {
      const argon2 = await loadArgon2();
      if (argon2?.verify) {
        return await argon2.verify(storedHash, plainPassword);
      }
      return false;
    }
    if (storedHash.startsWith('$scrypt$')) {
      const parts = storedHash.split('$');
      const salt = parts[3];
      const keyHex = parts[4];
      if (!salt || !keyHex) return false;
      return new Promise((resolve) => {
        crypto.scrypt(plainPassword, salt, 32, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
          if (err) resolve(false);
          else resolve(crypto.timingSafeEqual(Buffer.from(keyHex, 'hex'), derivedKey));
        });
      });
    }
    return false;
  } catch {
    return false;
  }
}

export function needsRehash(
  storedHash: string,
  targetOptions: PasswordHashOptions = {}
): boolean {
  if (storedHash.startsWith('$scrypt$')) return true;
  const target = { ...DEFAULT_OPTIONS, ...targetOptions };
  // Expected prefix format: $argon2id$v=19$m=65536,t=3,p=1$...
  const match = storedHash.match(/^\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/);
  if (!match) return true;

  const m = Number.parseInt(match[1]!, 10);
  const t = Number.parseInt(match[2]!, 10);
  const p = Number.parseInt(match[3]!, 10);

  return m < target.memoryCost || t < target.timeCost || p < target.parallelism;
}

