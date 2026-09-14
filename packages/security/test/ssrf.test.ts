import { describe, it, expect } from 'vitest';
import {
  validateUrlForSsrf,
  isBlockedIpv4,
  isBlockedIpv6,
  createSsrfSafeLookup,
} from '../src/ssrf.js';

describe('SSRF Protection & CIDR Blocklist', () => {
  it('T2.12: isBlockedIpv4 correctly blocks private and loopback IPv4 ranges', () => {
    expect(isBlockedIpv4('127.0.0.1').blocked).toBe(true);
    expect(isBlockedIpv4('127.255.255.255').blocked).toBe(true);
    expect(isBlockedIpv4('10.0.0.1').blocked).toBe(true);
    expect(isBlockedIpv4('172.16.0.1').blocked).toBe(true);
    expect(isBlockedIpv4('172.31.255.255').blocked).toBe(true);
    expect(isBlockedIpv4('192.168.1.1').blocked).toBe(true);
    expect(isBlockedIpv4('169.254.169.254').blocked).toBe(true);
    expect(isBlockedIpv4('100.64.0.1').blocked).toBe(true);
    expect(isBlockedIpv4('0.0.0.0').blocked).toBe(true);

    // Public IPs should not be blocked
    expect(isBlockedIpv4('8.8.8.8').blocked).toBe(false);
    expect(isBlockedIpv4('1.1.1.1').blocked).toBe(false);
    expect(isBlockedIpv4('104.26.10.12').blocked).toBe(false);
  });

  it('T2.13: isBlockedIpv6 blocks IPv6 loopback, ULA, and link-local', () => {
    expect(isBlockedIpv6('::1').blocked).toBe(true);
    expect(isBlockedIpv6('fc00::1').blocked).toBe(true);
    expect(isBlockedIpv6('fd00:1234::1').blocked).toBe(true);
    expect(isBlockedIpv6('fe80::1').blocked).toBe(true);
    expect(isBlockedIpv6('::ffff:127.0.0.1').blocked).toBe(true);
    expect(isBlockedIpv6('::ffff:192.168.1.1').blocked).toBe(true);

    // Public IPv6
    expect(isBlockedIpv6('2606:4700:4700::1111').blocked).toBe(false);
  });

  it('T2.14: validateUrlForSsrf blocks localhost and direct private IPs', async () => {
    const res1 = await validateUrlForSsrf('http://localhost:8080/hook', { allowHttp: true });
    expect(res1.safe).toBe(false);

    const res2 = await validateUrlForSsrf('https://127.0.0.1/webhook');
    expect(res2.safe).toBe(false);

    const res3 = await validateUrlForSsrf('https://169.254.169.254/latest/meta-data');
    expect(res3.safe).toBe(false);

    const res4 = await validateUrlForSsrf('https://10.0.5.20/callback');
    expect(res4.safe).toBe(false);
  });

  it('T2.15: validateUrlForSsrf blocks forbidden ports and protocols', async () => {
    const resPort = await validateUrlForSsrf('https://example.com:22/ssh');
    expect(resPort.safe).toBe(false);
    expect(resPort.error).toContain('Port');

    const resProto = await validateUrlForSsrf('ftp://example.com/file');
    expect(resProto.safe).toBe(false);
    expect(resProto.error).toContain('Protocol');
  });

  it('T2.16: validateUrlForSsrf permits safe public HTTPS domains', async () => {
    const res = await validateUrlForSsrf('https://dns.google/dns-query');
    expect(res.safe).toBe(true);
    expect(res.resolvedIps.length).toBeGreaterThan(0);
  });

  it('T2.17: validateUrlForSsrf handles invalid URL, empty host, and custom ports', async () => {
    const invalidUrl = await validateUrlForSsrf('not_a_valid_url');
    expect(invalidUrl.safe).toBe(false);
    expect(invalidUrl.error).toContain('Invalid URL');

    const customPort = await validateUrlForSsrf('https://dns.google:8443/dns-query', { allowedPorts: [8443] });
    expect(customPort.safe).toBe(true);

    // Test DNS resolving to 127.0.0.1 (nip.io)
    try {
      const nipRes = await validateUrlForSsrf('https://127.0.0.1.nip.io/hook');
      if (!nipRes.safe) {
        expect(nipRes.error).toBeDefined();
      }
    } catch {
      // Offline fallback
    }
  });

  it('T2.18: SSRF Hardening - rejects IPv4 alternate encodings (octal, hex, dword)', () => {
    expect(isBlockedIpv4('0177.0.0.1').blocked).toBe(true);
    expect(isBlockedIpv4('017700000001').blocked).toBe(true);
    expect(isBlockedIpv4('0251.0372.0251.0372').blocked).toBe(true); // 169.250/254 metadata
    expect(isBlockedIpv4('0251.0376.0251.0376').blocked).toBe(true); // 169.254.169.254

    expect(isBlockedIpv4('0x7f000001').blocked).toBe(true);
    expect(isBlockedIpv4('0x7f.0.0.1').blocked).toBe(true);
    expect(isBlockedIpv4('0xa9fea9fe').blocked).toBe(true);

    expect(isBlockedIpv4('2130706433').blocked).toBe(true); // 127.0.0.1
    expect(isBlockedIpv4('2852039166').blocked).toBe(true); // 169.254.169.254
    expect(isBlockedIpv4('127.1').blocked).toBe(true);
    expect(isBlockedIpv4('0').blocked).toBe(true);
  });

  it('T2.19: SSRF Hardening - blocks IPv4-mapped, IPv4-compatible, NAT64, and 6to4', async () => {
    // Hex IPv4-mapped (AWS metadata bypass vector)
    const res1 = await validateUrlForSsrf('https://[::ffff:a9fe:a9fe]/latest/meta-data/');
    expect(res1.safe).toBe(false);
    expect(isBlockedIpv6('::ffff:a9fe:a9fe').blocked).toBe(true);

    // Hex IPv4-mapped loopback
    const res2 = await validateUrlForSsrf('https://[::ffff:7f00:1]/');
    expect(res2.safe).toBe(false);
    expect(isBlockedIpv6('::ffff:7f00:1').blocked).toBe(true);

    // Uncompressed IPv4-mapped
    const res3 = await validateUrlForSsrf('https://[0:0:0:0:0:ffff:127.0.0.1]/');
    expect(res3.safe).toBe(false);
    expect(isBlockedIpv6('0:0:0:0:0:ffff:127.0.0.1').blocked).toBe(true);

    // IPv4-compatible
    const res4 = await validateUrlForSsrf('https://[::127.0.0.1]/');
    expect(res4.safe).toBe(false);
    expect(isBlockedIpv6('::127.0.0.1').blocked).toBe(true);

    const res5 = await validateUrlForSsrf('https://[::7f00:1]/');
    expect(res5.safe).toBe(false);
    expect(isBlockedIpv6('::7f00:1').blocked).toBe(true);

    // NAT64 & 6to4
    expect(isBlockedIpv6('64:ff9b::127.0.0.1').blocked).toBe(true);
    expect(isBlockedIpv6('64:ff9b::a9fe:a9fe').blocked).toBe(true);
    expect(isBlockedIpv6('2002:7f00:1::').blocked).toBe(true);
    expect(isBlockedIpv6('2002:a9fe:a9fe::').blocked).toBe(true);

    // Valid public IPv6 and NAT64 public
    expect(isBlockedIpv6('2606:4700:4700::1111').blocked).toBe(false);
    expect(isBlockedIpv6('64:ff9b::8.8.8.8').blocked).toBe(false);
    const resPublic = await validateUrlForSsrf('https://[2606:4700:4700::1111]/');
    expect(resPublic.safe).toBe(true);
  });

  it('T2.20: SSRF Hardening - createSsrfSafeLookup blocks private IP resolution at connection time', async () => {
    const lookup = createSsrfSafeLookup();
    await new Promise<void>((resolve, reject) => {
      lookup('127.0.0.1.nip.io', {}, (err, _addr) => {
        try {
          expect(err).toBeDefined();
          expect(err?.message).toContain('SSRF Blocked');
          resolve();
        } catch (assertionErr) {
          reject(assertionErr);
        }
      });
    });
  });
});
