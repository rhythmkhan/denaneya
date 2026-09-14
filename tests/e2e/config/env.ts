import { z } from 'zod';

export const e2eEnvSchema = z.object({
  NODE_ENV: z.enum(['test', 'development', 'production']).default('test'),
  DATABASE_URL: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  ENCRYPTION_MASTER_KEY: z
    .string()
    .min(32)
    .default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  JWT_SECRET: z
    .string()
    .min(16)
    .default('test_jwt_secret_key_at_least_32_bytes_long_123456'),
  E2E_BASE_URL: z.string().url().optional(),
  E2E_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  LOG_LEVEL: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'SILENT']).default('ERROR'),
});

export type E2EEnv = z.infer<typeof e2eEnvSchema>;

export function getE2EEnv(): E2EEnv {
  return e2eEnvSchema.parse(process.env);
}

export const env = getE2EEnv();
