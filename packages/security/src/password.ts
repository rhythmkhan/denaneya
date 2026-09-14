import { hash, verify, Version, Algorithm } from '@node-rs/argon2';
import type { PasswordHashOptions } from './types.js';

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
  return hash(plainPassword, {
    memoryCost: opts.memoryCost,
    timeCost: opts.timeCost,
    parallelism: opts.parallelism,
    outputLen: opts.outputLen,
    algorithm: Algorithm.Argon2id,
    version: Version.V0x13,
  });
}

export async function verifyPassword(
  storedHash: string,
  plainPassword: string
): Promise<boolean> {
  try {
    return await verify(storedHash, plainPassword);
  } catch {
    return false;
  }
}

export function needsRehash(
  storedHash: string,
  targetOptions: PasswordHashOptions = {}
): boolean {
  const target = { ...DEFAULT_OPTIONS, ...targetOptions };
  // Expected prefix format: $argon2id$v=19$m=65536,t=3,p=1$...
  const match = storedHash.match(/^\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/);
  if (!match) return true;

  const m = Number.parseInt(match[1]!, 10);
  const t = Number.parseInt(match[2]!, 10);
  const p = Number.parseInt(match[3]!, 10);

  return m < target.memoryCost || t < target.timeCost || p < target.parallelism;
}
