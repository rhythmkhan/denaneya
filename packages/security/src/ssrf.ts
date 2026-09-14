import dns from 'node:dns/promises';
import dnsCallback from 'node:dns';
import type { SsrfOptions, SsrfValidationResult } from './types.js';

// Standard CIDR blocklist for private, loopback, link-local, cloud-metadata
export const DEFAULT_BLOCKED_IPV4_RANGES = [
  { start: 0x00000000, end: 0x00ffffff, desc: 'Current network (0.0.0.0/8)' },
  { start: 0x0a000000, end: 0x0affffff, desc: 'Private Class A (10.0.0.0/8)' },
  { start: 0x64400000, end: 0x647fffff, desc: 'Carrier-Grade NAT (100.64.0.0/10)' },
  { start: 0x7f000000, end: 0x7fffffff, desc: 'Loopback (127.0.0.0/8)' },
  { start: 0xa9fa0000, end: 0xa9feffff, desc: 'Link-Local & Cloud Metadata (169.254.0.0/16)' },
  { start: 0xac100000, end: 0xac1fffff, desc: 'Private Class B (172.16.0.0/12)' },
  { start: 0xc0000000, end: 0xc00000ff, desc: 'IETF Protocol Assignments (192.0.0.0/24)' },
  { start: 0xc0000200, end: 0xc00002ff, desc: 'Documentation (TEST-NET-1)' },
  { start: 0xc0a80000, end: 0xc0a8ffff, desc: 'Private Class C (192.168.0.0/16)' },
  { start: 0xc6336400, end: 0xc63364ff, desc: 'Documentation (TEST-NET-2)' },
  { start: 0xcb007100, end: 0xcb0071ff, desc: 'Documentation (TEST-NET-3)' },
  { start: 0xe0000000, end: 0xefffffff, desc: 'Multicast (224.0.0.0/4)' },
  { start: 0xf0000000, end: 0xfffffffe, desc: 'Reserved (240.0.0.0/4)' },
  { start: 0xffffffff, end: 0xffffffff, desc: 'Broadcast' },
];

/**
 * Checks if a 32-bit unsigned integer falls into any blocked IPv4 CIDR range.
 */
export function isBlockedIpv4Long(longVal: number): { blocked: boolean; reason?: string } {
  for (const range of DEFAULT_BLOCKED_IPV4_RANGES) {
    if (longVal >= range.start && longVal <= range.end) {
      return { blocked: true, reason: range.desc };
    }
  }
  return { blocked: false };
}

/**
 * Parses any IPv4 representation (dotted-decimal, hex dotted/integer, octal dotted/integer, dword)
 * into an unsigned 32-bit integer. Returns null if string is not a valid IPv4 address.
 */
export function parseIpv4ToLong(ipStr: string): number | null {
  if (typeof ipStr !== 'string') return null;
  const str = ipStr.trim();
  if (!str) return null;

  const parts = str.split('.');
  if (parts.length < 1 || parts.length > 4) return null;

  const parsedParts: number[] = [];
  for (const part of parts) {
    if (!part) return null;
    let val: number;
    if (/^0x[0-9a-f]+$/i.test(part)) {
      val = Number.parseInt(part.slice(2), 16);
    } else if (part === '0') {
      val = 0;
    } else if (/^0[0-7]+$/.test(part)) {
      val = Number.parseInt(part, 8);
    } else if (/^0[0-9]+$/.test(part)) {
      // Leading zero with invalid octal digits (8, 9) is rejected
      return null;
    } else if (/^[0-9]+$/.test(part)) {
      val = Number.parseInt(part, 10);
    } else {
      return null;
    }
    if (Number.isNaN(val) || !Number.isFinite(val) || val < 0) return null;
    parsedParts.push(val);
  }

  if (parts.length === 1) {
    if (parsedParts[0]! > 0xffffffff) return null;
    return parsedParts[0]! >>> 0;
  }
  if (parts.length === 2) {
    if (parsedParts[0]! > 255 || parsedParts[1]! > 0xffffff) return null;
    return (parsedParts[0]! * 16777216 + parsedParts[1]!) >>> 0;
  }
  if (parts.length === 3) {
    if (parsedParts[0]! > 255 || parsedParts[1]! > 255 || parsedParts[2]! > 0xffff) return null;
    return (parsedParts[0]! * 16777216 + parsedParts[1]! * 65536 + parsedParts[2]!) >>> 0;
  }
  if (parts.length === 4) {
    if (parsedParts.some(p => p > 255)) return null;
    return (parsedParts[0]! * 16777216 + parsedParts[1]! * 65536 + parsedParts[2]! * 256 + parsedParts[3]!) >>> 0;
  }
  return null;
}

/**
 * Checks whether an IPv4 string (in any notation) is blocked.
 */
export function isBlockedIpv4(ip: string): { blocked: boolean; reason?: string } {
  const longVal = parseIpv4ToLong(ip);
  if (longVal === null) {
    return { blocked: false };
  }
  return isBlockedIpv4Long(longVal);
}

/**
 * Parses any RFC 4291 IPv6 address into an array of 8 unsigned 16-bit words.
 * Handles compression ('::'), embedded IPv4, brackets, and scope IDs.
 */
export function parseIpv6ToWords(ipStr: string): number[] | null {
  if (typeof ipStr !== 'string') return null;
  let ip = ipStr.trim().toLowerCase();
  if (ip.startsWith('[') && ip.endsWith(']')) {
    ip = ip.slice(1, -1);
  }
  const zoneIndex = ip.indexOf('%');
  if (zoneIndex !== -1) {
    ip = ip.slice(0, zoneIndex);
  }
  if (!ip) return null;

  // Handle embedded IPv4 at the end (e.g. ::ffff:192.168.1.1, ::127.0.0.1, 64:ff9b::127.0.0.1)
  const lastColon = ip.lastIndexOf(':');
  if (lastColon !== -1) {
    const potentialIpv4 = ip.slice(lastColon + 1);
    if (potentialIpv4.includes('.')) {
      const longVal = parseIpv4ToLong(potentialIpv4);
      if (longVal === null) return null;
      const w6 = (longVal >>> 16) & 0xffff;
      const w7 = longVal & 0xffff;
      ip = ip.slice(0, lastColon + 1) + w6.toString(16) + ':' + w7.toString(16);
    }
  }

  // An IPv6 address must contain at least one colon
  if (!ip.includes(':')) return null;

  const doubleColonIdx = ip.indexOf('::');
  if (doubleColonIdx !== -1 && ip.indexOf('::', doubleColonIdx + 2) !== -1) {
    return null; // At most one '::' permitted
  }

  let leftHextets: string[] = [];
  let rightHextets: string[] = [];

  if (doubleColonIdx !== -1) {
    const leftPart = ip.slice(0, doubleColonIdx);
    const rightPart = ip.slice(doubleColonIdx + 2);
    leftHextets = leftPart.length > 0 ? leftPart.split(':') : [];
    rightHextets = rightPart.length > 0 ? rightPart.split(':') : [];
  } else {
    leftHextets = ip.split(':');
  }

  const parseHextet = (h: string): number | null => {
    if (!/^[0-9a-f]{1,4}$/i.test(h)) return null;
    return Number.parseInt(h, 16);
  };

  const leftWords: number[] = [];
  for (const h of leftHextets) {
    const val = parseHextet(h);
    if (val === null) return null;
    leftWords.push(val);
  }

  const rightWords: number[] = [];
  for (const h of rightHextets) {
    const val = parseHextet(h);
    if (val === null) return null;
    rightWords.push(val);
  }

  const totalProvided = leftWords.length + rightWords.length;

  if (doubleColonIdx !== -1) {
    if (totalProvided > 7) return null;
    const zerosNeeded = 8 - totalProvided;
    const zeros = new Array(zerosNeeded).fill(0);
    return [...leftWords, ...zeros, ...rightWords];
  } else {
    if (totalProvided !== 8) return null;
    return leftWords;
  }
}

/**
 * Checks whether an IPv6 address is in any blocked range, including IPv4-mapped,
 * IPv4-compatible, NAT64, 6to4, link-local, loopback, and private ranges.
 */
export function isBlockedIpv6(ip: string): { blocked: boolean; reason?: string } {
  const words = parseIpv6ToWords(ip);
  if (!words) {
    return { blocked: true, reason: 'Malformed or invalid IPv6 address' };
  }

  // 1. Unspecified ::/128
  if (words.every(w => w === 0)) {
    return { blocked: true, reason: 'IPv6 Unspecified (::)' };
  }

  // 2. Loopback ::1/128
  if (words.slice(0, 7).every(w => w === 0) && words[7] === 1) {
    return { blocked: true, reason: 'IPv6 Loopback (::1)' };
  }

  // 3. IPv4-Mapped IPv6 ::ffff:0:0/96
  if (words.slice(0, 5).every(w => w === 0) && words[5] === 0xffff) {
    const embeddedIpv4Long = ((words[6]! << 16) | words[7]!) >>> 0;
    const check = isBlockedIpv4Long(embeddedIpv4Long);
    if (check.blocked) {
      return { blocked: true, reason: `IPv4-Mapped IPv6 (${check.reason})` };
    }
    return { blocked: false };
  }

  // 4. IPv4-Compatible IPv6 ::/96 (deprecated in RFC 4291)
  if (words.slice(0, 6).every(w => w === 0)) {
    const embeddedIpv4Long = ((words[6]! << 16) | words[7]!) >>> 0;
    const check = isBlockedIpv4Long(embeddedIpv4Long);
    if (check.blocked) {
      return { blocked: true, reason: `IPv4-Compatible IPv6 (${check.reason})` };
    }
    return { blocked: true, reason: 'Deprecated IPv4-Compatible IPv6 (::/96)' };
  }

  // 5. SIIT / IPv4-Translated ::ffff:0:0:0/96
  if (words.slice(0, 4).every(w => w === 0) && words[4] === 0xffff && words[5] === 0) {
    const embeddedIpv4Long = ((words[6]! << 16) | words[7]!) >>> 0;
    const check = isBlockedIpv4Long(embeddedIpv4Long);
    if (check.blocked) {
      return { blocked: true, reason: `IPv4-Translated SIIT (${check.reason})` };
    }
    return { blocked: false };
  }

  // 6. NAT64 Well-Known Prefix 64:ff9b::/96
  if (words[0] === 0x0064 && words[1] === 0xff9b && words.slice(2, 6).every(w => w === 0)) {
    const embeddedIpv4Long = ((words[6]! << 16) | words[7]!) >>> 0;
    const check = isBlockedIpv4Long(embeddedIpv4Long);
    if (check.blocked) {
      return { blocked: true, reason: `NAT64 IPv6 (${check.reason})` };
    }
    return { blocked: false };
  }

  // 7. 6to4 2002::/16
  if (words[0] === 0x2002) {
    const embeddedIpv4Long = ((words[1]! << 16) | words[2]!) >>> 0;
    const check = isBlockedIpv4Long(embeddedIpv4Long);
    if (check.blocked) {
      return { blocked: true, reason: `6to4 IPv6 (${check.reason})` };
    }
    return { blocked: false };
  }

  // 8. Link-Local Unicast fe80::/10
  if ((words[0]! & 0xffc0) === 0xfe80) {
    return { blocked: true, reason: 'IPv6 Link-Local (fe80::/10)' };
  }

  // 9. Unique Local Address fc00::/7
  if ((words[0]! & 0xfe00) === 0xfc00) {
    return { blocked: true, reason: 'IPv6 Unique Local Address (fc00::/7)' };
  }

  // 10. Multicast ff00::/8
  if ((words[0]! & 0xff00) === 0xff00) {
    return { blocked: true, reason: 'IPv6 Multicast (ff00::/8)' };
  }

  // 11. Documentation 2001:db8::/32
  if (words[0] === 0x2001 && words[1] === 0x0db8) {
    return { blocked: true, reason: 'IPv6 Documentation (2001:db8::/32)' };
  }

  // 12. Discard-Only 100::/64
  if (words[0] === 0x0100 && words[1] === 0 && words[2] === 0 && words[3] === 0) {
    return { blocked: true, reason: 'IPv6 Discard-Only (100::/64)' };
  }

  return { blocked: false };
}

/**
 * Validates a target URL against SSRF attacks (protocol, port, direct IP, DNS resolution).
 */
export async function validateUrlForSsrf(
  urlString: string,
  options: SsrfOptions = {}
): Promise<SsrfValidationResult> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { safe: false, resolvedIps: [], error: 'Invalid URL format' };
  }

  // 1. Protocol validation
  const allowHttp = options.allowHttp ?? (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test');
  if (parsed.protocol === 'https:') {
    // Allowed
  } else if (parsed.protocol === 'http:' && allowHttp) {
    // Allowed only when explicitly permitted in dev/test
  } else {
    return {
      safe: false,
      resolvedIps: [],
      error: `Protocol '${parsed.protocol}' is forbidden. Only HTTPS is allowed in production.`,
    };
  }

  // 2. Port validation
  const defaultPort = parsed.protocol === 'https:' ? 443 : 80;
  const port = parsed.port ? Number.parseInt(parsed.port, 10) : defaultPort;
  const allowedPorts = options.allowedPorts || (allowHttp ? [80, 443] : [443]);
  if (!allowedPorts.includes(port)) {
    return {
      safe: false,
      resolvedIps: [],
      error: `Port '${port}' is forbidden. Allowed ports: ${allowedPorts.join(', ')}`,
    };
  }

  // 3. Hostname check
  let hostname = parsed.hostname;
  if (!hostname) {
    return { safe: false, resolvedIps: [], error: 'Empty hostname' };
  }

  // Strip brackets if IPv6 literal e.g. [::1]
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }

  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    return { safe: false, resolvedIps: [], error: 'Localhost or .local domain is blocked' };
  }

  // 4. Direct IP address verification
  // Check IPv4 (handles hex/octal/decimal representations normalized by WHATWG)
  const ipv4Long = parseIpv4ToLong(hostname);
  if (ipv4Long !== null) {
    const check = isBlockedIpv4Long(ipv4Long);
    if (check.blocked) {
      return { safe: false, resolvedIps: [hostname], error: `Direct IP ${hostname} is blocked: ${check.reason}` };
    }
    return { safe: true, resolvedIps: [hostname] };
  }

  // Check IPv6 (handles hex-mapped, uncompressed, compatible)
  const ipv6Words = parseIpv6ToWords(hostname);
  if (ipv6Words !== null) {
    const check = isBlockedIpv6(hostname);
    if (check.blocked) {
      return { safe: false, resolvedIps: [hostname], error: `Direct IPv6 ${hostname} is blocked: ${check.reason}` };
    }
    return { safe: true, resolvedIps: [hostname] };
  }

  // 5. DNS Resolution check (prevents DNS rebinding and private resolution)
  try {
    const lookups = await dns.lookup(hostname, { all: true });
    if (!lookups || lookups.length === 0) {
      return { safe: false, resolvedIps: [], error: `DNS lookup failed for hostname '${hostname}'` };
    }

    const resolvedIps = lookups.map(l => l.address);
    for (const record of lookups) {
      if (record.family === 4) {
        const check = isBlockedIpv4(record.address);
        if (check.blocked) {
          return {
            safe: false,
            resolvedIps,
            error: `Resolved IP ${record.address} is blocked: ${check.reason}`,
          };
        }
      } else if (record.family === 6) {
        const check = isBlockedIpv6(record.address);
        if (check.blocked) {
          return {
            safe: false,
            resolvedIps,
            error: `Resolved IPv6 ${record.address} is blocked: ${check.reason}`,
          };
        }
      }
    }

    return { safe: true, resolvedIps };
  } catch (err) {
    return {
      safe: false,
      resolvedIps: [],
      error: `DNS resolution error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Creates a DNS lookup function for Node.js http.Agent / https.Agent to prevent
 * TOCTOU DNS rebinding at socket connection time.
 */
export function createSsrfSafeLookup() {
  return function ssrfSafeLookup(
    hostname: string,
    optionsOrCallback: any,
    maybeCallback?: any
  ): void {
    let options: dnsCallback.LookupOptions = {};
    let callback: (err: NodeJS.ErrnoException | null, address: any, family?: number) => void;

    if (typeof optionsOrCallback === 'function') {
      callback = optionsOrCallback;
      options = {};
    } else if (typeof optionsOrCallback === 'number') {
      options = { family: optionsOrCallback };
      callback = maybeCallback;
    } else {
      options = optionsOrCallback || {};
      callback = maybeCallback;
    }

    dnsCallback.lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, '', 0);
      if (!addresses || addresses.length === 0) {
        return callback(new Error(`No DNS records found for '${hostname}'`), '', 0);
      }

      for (const record of addresses) {
        const addr = typeof record === 'string' ? record : record.address;
        const fam = typeof record === 'string' ? 4 : record.family;
        if (fam === 4) {
          const check = isBlockedIpv4(addr);
          if (check.blocked) {
            return callback(new Error(`SSRF Blocked: IP ${addr} is blocked: ${check.reason}`), '', 0);
          }
        } else if (fam === 6) {
          const check = isBlockedIpv6(addr);
          if (check.blocked) {
            return callback(new Error(`SSRF Blocked: IPv6 ${addr} is blocked: ${check.reason}`), '', 0);
          }
        }
      }

      if (options && options.all) {
        return callback(null, addresses);
      }
      const first = addresses[0]!;
      if (typeof first === 'string') {
        return callback(null, first, 4);
      }
      return callback(null, first.address, first.family);
    });
  };
}
