import { describe, it, expect, vi } from "vitest";
import dns from "node:dns/promises";
import {
  encryptionService,
  hashPassword,
  verifyPassword,
  validateUrlForSsrf,
  MemoryRateLimitStore,
  ProgressiveRateLimiter,
  RATE_LIMIT_RULES,
} from "@denaneya/security";

describe("Feature 02: Security Core (Tier 1)", () => {
  it("E2E-T1-F02-01: AES-256-GCM Envelope Encryption Roundtrip", () => {
    const secret = "sample_test_secret_payload_98124719284";
    const envelope = encryptionService.encrypt(secret);

    expect(envelope.version).toBe(1);
    expect(envelope.algorithm).toBe("AES-256-GCM");
    expect(envelope.iv).toBeDefined();
    expect(envelope.authTag).toBeDefined();
    expect(envelope.encryptedDek).toBeDefined();
    expect(envelope.ciphertext).toBeDefined();

    const decrypted = encryptionService.decrypt(envelope);
    expect(decrypted).toBe(secret);
  });

  it("E2E-T1-F02-02: Argon2id Password Hashing & Verification", async () => {
    const password = "SecureMerchantPass123!";
    const hashed = await hashPassword(password);

    expect(hashed).toContain("$argon2id$v=19$");
    const isValid = await verifyPassword(hashed, password);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPassword(hashed, "WrongPassword123!");
    expect(isInvalid).toBe(false);
  });

  it("E2E-T1-F02-03: Webhook SSRF Guard Private CIDR Rejection", async () => {
    const prohibitedUrls = [
      "http://localhost:3000/webhook",
      "http://127.0.0.1/callback",
      "http://169.254.169.254/metadata",
      "http://10.0.0.5/ipn",
    ];

    for (const url of prohibitedUrls) {
      const result = await validateUrlForSsrf(url);
      expect(result.safe).toBe(false);
      expect(result.error).toBeDefined();
    }
  });

  it("E2E-T1-F02-04: Webhook SSRF Guard Public HTTPS Whitelist Approval", async () => {
    const dnsSpy = vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as any);
    try {
      const publicUrl = "https://api.merchantstore.com.bd/webhooks/denaneya";
      const result = await validateUrlForSsrf(publicUrl);
      expect(result.safe).toBe(true);
      expect(result.resolvedIps).toContain("93.184.216.34");
    } finally {
      dnsSpy.mockRestore();
    }
  });

  it("E2E-T1-F02-05: Progressive Multi-Dimensional Rate Limiting", async () => {
    const store = new MemoryRateLimitStore();
    const limiter = new ProgressiveRateLimiter(store);
    const testKey = "ip_192.168.1.1_" + Date.now();

    for (let i = 0; i < 10; i++) {
      const res = await limiter.check(testKey, RATE_LIMIT_RULES.AUTH_LOGIN);
      expect(res.allowed).toBe(true);
    }

    const blockedRes = await limiter.check(testKey, RATE_LIMIT_RULES.AUTH_LOGIN);
    expect(blockedRes.allowed).toBe(false);
    expect(blockedRes.retryAfterSeconds).toBeGreaterThan(0);
    expect(blockedRes.isLockedOut).toBe(true);
  });
});
