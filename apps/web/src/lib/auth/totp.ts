import crypto from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i] ?? 0;
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(base32Str: string): Buffer {
  const cleanStr = base32Str.toUpperCase().replace(/=+$/, '').replace(/[\s-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleanStr.length; i++) {
    const char = cleanStr[i] ?? '';
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateTotpSecret(numBytes = 20): string {
  return base32Encode(crypto.randomBytes(numBytes));
}

export function getTotpUri(email: string, secret: string, issuer = 'DenaNeya'): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(email)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export function generateTotpCode(secret: string, timestampMs = Date.now(), period = 30): string {
  const counter = Math.floor(timestampMs / 1000 / period);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigInt64BE(BigInt(counter), 0);

  const key = base32Decode(secret);
  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();

  const lastByte = hmac[hmac.length - 1] ?? 0;
  const offset = lastByte & 0x0f;
  const b0 = hmac[offset] ?? 0;
  const b1 = hmac[offset + 1] ?? 0;
  const b2 = hmac[offset + 2] ?? 0;
  const b3 = hmac[offset + 3] ?? 0;

  const binary =
    ((b0 & 0x7f) << 24) |
    ((b1 & 0xff) << 16) |
    ((b2 & 0xff) << 8) |
    (b3 & 0xff);

  const otp = binary % 1_000_000;
  return otp.toString().padStart(6, '0');
}

export function verifyTotpCode(token: string, secret: string, window = 1): boolean {
  if (!token || token.trim().length !== 6) return false;
  const trimmed = token.trim();
  const now = Date.now();
  const period = 30;

  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const checkTime = now + errorWindow * period * 1000;
    const generated = generateTotpCode(secret, checkTime, period);
    const bufA = Buffer.from(generated, 'utf8');
    const bufB = Buffer.from(trimmed, 'utf8');

    if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
      return true;
    }
  }

  return false;
}
