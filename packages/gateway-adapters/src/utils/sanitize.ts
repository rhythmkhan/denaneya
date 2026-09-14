const SENSITIVE_KEYS = new Set([
  'password',
  'passwd',
  'pass',
  'store_passwd',
  'storepasswd',
  'storepassword',
  'store_password',
  'appsecret',
  'app_secret',
  'merchantprivatekey',
  'merchant_private_key',
  'privatekey',
  'private_key',
  'signaturekey',
  'signature_key',
  'nagadpublickey',
  'nagad_public_key',
  'publickey',
  'public_key',
  'token',
  'authorization',
  'xappkey',
  'x-app-key',
  'idtoken',
  'id_token',
  'refreshtoken',
  'refresh_token',
  'accesstoken',
  'access_token',
  'authtoken',
  'auth_token',
  'secret',
  'clientsecret',
  'client_secret',
  'apikey',
  'api_key',
  'cvv',
  'cvv2',
  'pin',
  'otp',
]);

/**
 * Sanitizes URLs by redacting sensitive query parameters (e.g. store_passwd, signature_key, token).
 */
export function sanitizeUrl(urlStr: string): string {
  if (!urlStr || typeof urlStr !== 'string') return urlStr;
  try {
    const parsed = new URL(urlStr);
    let changed = false;
    for (const [key] of parsed.searchParams.entries()) {
      const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (
        SENSITIVE_KEYS.has(lowerKey) ||
        lowerKey.includes('password') ||
        lowerKey.includes('passwd') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('signature')
      ) {
        parsed.searchParams.set(key, '***REDACTED***');
        changed = true;
      }
    }
    return changed ? parsed.toString() : urlStr;
  } catch {
    // If not a full standard URL, check query parameters via regex
    return urlStr.replace(
      /([?&](?:store_passwd|storepasswd|storepassword|store_password|password|passwd|signature_key|signaturekey|app_secret|appsecret|token|secret)=)([^&]+)/gi,
      '$1***REDACTED***'
    );
  }
}

/**
 * Sanitizes raw string messages by redacting embedded PEM private keys, bearer tokens, or sensitive URL/JSON params.
 */
export function sanitizeString(text: string): string {
  if (!text || typeof text !== 'string') return text;

  let sanitized = text;

  // Redact RSA and general private keys
  sanitized = sanitized.replace(
    /-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9_-]+ )?PRIVATE KEY-----/g,
    '***REDACTED PRIVATE KEY***'
  );

  // Redact JSON sensitive key-value pairs (e.g. {"password":"12345", "store_passwd": "abc"})
  sanitized = sanitized.replace(
    /(["'](?:store_passwd|storepasswd|storepassword|store_password|password|passwd|signature_key|signaturekey|app_secret|appsecret|app_key|appkey|token|id_token|idtoken|secret|client_secret|merchant_private_key|private_key)["']\s*:\s*["'])([^"']+)(["'])/gi,
    '$1***REDACTED***$3'
  );

  // Redact key=value sensitive credentials (e.g. store_passwd=12345)
  sanitized = sanitized.replace(
    /([?&;,\s]|^)((?:store_passwd|storepasswd|storepassword|store_password|password|passwd|signature_key|signaturekey|app_secret|appsecret|app_key|appkey|token|id_token|idtoken|secret|client_secret)=)([^\s&,;]+)/gi,
    '$1$2***REDACTED***'
  );

  // Redact URLs containing sensitive query params
  sanitized = sanitized.replace(/https?:\/\/[^\s"'<>]+/g, (matchedUrl) => sanitizeUrl(matchedUrl));

  // Redact Bearer JWT tokens
  sanitized = sanitized.replace(
    /Bearer\s+[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+/g,
    'Bearer ***REDACTED JWT***'
  );

  // Redact opaque Bearer tokens
  sanitized = sanitized.replace(
    /Bearer\s+(?!\*\*\*REDACTED)[A-Za-z0-9-_=.]+/gi,
    'Bearer ***REDACTED TOKEN***'
  );

  return sanitized;
}

/**
 * Recursively redacts sensitive credentials from objects, arrays, and primitive strings.
 */
export function sanitizeCredentials<T>(obj: T): T {
  if (!obj || typeof obj !== 'object') {
    if (typeof obj === 'string') {
      return sanitizeString(obj) as unknown as T;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeCredentials(item)) as unknown as T;
  }

  const isSensitiveKey = (key: string): boolean => {
    const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    return (
      SENSITIVE_KEYS.has(lowerKey) ||
      lowerKey.includes('password') ||
      lowerKey.includes('passwd') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('token') ||
      lowerKey.includes('signature') ||
      lowerKey.includes('privatekey') ||
      lowerKey.includes('apikey')
    );
  };

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      result[key] = '***REDACTED***';
    } else if (typeof val === 'object' && val !== null) {
      result[key] = sanitizeCredentials(val);
    } else if (typeof val === 'string') {
      result[key] = sanitizeString(val);
    } else {
      result[key] = val;
    }
  }

  return result as T;
}