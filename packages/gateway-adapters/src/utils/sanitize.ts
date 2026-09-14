const SENSITIVE_KEYS = new Set([
  'password',
  'store_passwd',
  'storepasswd',
  'storepassword',
  'appsecret',
  'app_secret',
  'merchantprivatekey',
  'signaturekey',
  'signature_key',
  'token',
  'authorization',
  'xappkey',
  'x-app-key',
  'idtoken',
  'id_token',
  'refreshtoken',
  'refresh_token',
]);

/**
 * Recursively redacts sensitive credentials from objects.
 */
export function sanitizeCredentials<T>(obj: T): T {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeCredentials(item)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (SENSITIVE_KEYS.has(lowerKey)) {
      result[key] = '***REDACTED***';
    } else if (typeof val === 'object' && val !== null) {
      result[key] = sanitizeCredentials(val);
    } else {
      result[key] = val;
    }
  }

  return result as T;
}