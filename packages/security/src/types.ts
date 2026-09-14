// Encryption Types
export interface EncryptedEnvelope {
  version: 1;
  algorithm: 'AES-256-GCM';
  encryptedDek: string; // Base64
  dekIv: string;        // Base64 (12 bytes)
  dekAuthTag: string;   // Base64 (16 bytes)
  iv: string;           // Base64 (12 bytes)
  authTag: string;      // Base64 (16 bytes)
  ciphertext: string;   // Base64
  aad?: string;         // Base64 optional AAD
}

export interface EncryptionOptions {
  masterKey?: Buffer | string;
  aad?: string;
}

// Password Types
export interface PasswordHashOptions {
  memoryCost?: number; // KiB, default: 65536 (64MB)
  timeCost?: number;   // iterations, default: 3
  parallelism?: number;// threads, default: 1
  outputLen?: number;  // bytes, default: 32
}

// SSRF Types
export interface SsrfValidationResult {
  safe: boolean;
  resolvedIps: string[];
  error?: string;
}

export interface SsrfOptions {
  allowHttp?: boolean; // Only true in dev/test
  allowedPorts?: number[]; // Defaults to [443] (or [80, 443] in dev)
  customBlocklistCidrs?: string[];
  customAllowlistDomains?: string[];
}

// Rate Limiter Types
export interface RateLimitRule {
  name: string;
  windowMs: number;
  maxRequests: number;
  penaltyWindowMs?: number;
  baseLockoutSeconds?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
  retryAfterSeconds: number;
  penaltyMultiplier: number;
  isLockedOut: boolean;
}

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }>;
  getPenalty(key: string): Promise<{ violationCount: number; lockedUntil: number } | null>;
  recordViolation(key: string, lockoutMs: number, penaltyWindowMs: number): Promise<number>;
  reset(key: string): Promise<void>;
}

export interface UpstashRedisConfig {
  url?: string;
  token?: string;
  timeoutMs?: number;
}

export interface ResilientRateLimiterOptions {
  redisUrl?: string;
  redisToken?: string;
  timeoutMs?: number;
  fallbackStore?: RateLimitStore;
}

// RBAC Types
export type Role =
  | 'PLATFORM_ADMIN'
  | 'MERCHANT_OWNER'
  | 'MERCHANT_ADMIN'
  | 'MERCHANT_DEVELOPER'
  | 'MERCHANT_FINANCE'
  | 'MERCHANT_VIEWER';

export type Permission =
  // Payments
  | 'payments:read'
  | 'payments:create'
  | 'payments:cancel'
  | 'payments:refund'
  // Invoices & Links
  | 'invoices:read'
  | 'invoices:write'
  | 'payment_links:read'
  | 'payment_links:write'
  // Webhooks
  | 'webhooks:read'
  | 'webhooks:write'
  | 'webhooks:test'
  // API Keys
  | 'api_keys:read'
  | 'api_keys:create'
  | 'api_keys:rotate'
  | 'api_keys:revoke'
  // Devices (Android Collector)
  | 'devices:read'
  | 'devices:pair'
  | 'devices:revoke'
  // Ledger & Financial Reports
  | 'ledger:read'
  | 'reconciliation:read'
  | 'reconciliation:trigger'
  // Team & Organization
  | 'team:read'
  | 'team:invite'
  | 'team:modify_role'
  | 'team:remove'
  | 'merchant:settings_read'
  | 'merchant:settings_write'
  | 'merchant:delete'
  // Platform Super-Admin
  | 'platform:merchants_manage'
  | 'platform:gateways_manage'
  | 'platform:fraud_rules_manage'
  | 'platform:fraud_review_maker_checker'
  | 'platform:audit_logs_read'
  | 'platform:feature_flags_manage';

export interface UserAuthContext {
  userId: string;
  tenantId: string;
  role: Role;
  isPlatformStaff?: boolean;
}
