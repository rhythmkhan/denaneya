// Global test harness setup for DenaNeya E2E test suite

process.env.NODE_ENV = 'test';
if (!process.env.ENCRYPTION_MASTER_KEY) {
  process.env.ENCRYPTION_MASTER_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
}
if (!process.env.MASTER_ENCRYPTION_KEY) {
  process.env.MASTER_ENCRYPTION_KEY = process.env.ENCRYPTION_MASTER_KEY;
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test_jwt_secret_key_at_least_32_bytes_long_123456';
}
if (!process.env.NEXT_PUBLIC_APP_URL) {
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
}

export async function setup() {
  // Global initialization hooks (pool warm up, seed fixtures)
}

export async function teardown() {
  // Global cleanup hooks
}
