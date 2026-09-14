import { neon } from '@neondatabase/serverless';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDirectUrl, validateConnectionString, sanitizeConnectionUrl } from '../src/client.js';
import { retryWithBackoff } from '../src/resilience.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function runMigrations() {
  const directUrl = getDirectUrl();
  if (!directUrl || !validateConnectionString(directUrl)) {
    const sanitized = sanitizeConnectionUrl(directUrl);
    console.error(`[MIGRATION] Missing or invalid DIRECT_URL or DATABASE_URL: ${sanitized}`);
    throw new Error(`Missing or invalid DIRECT_URL or DATABASE_URL environment variable: ${sanitized}`);
  }

  console.log(`🚀 Running database migrations against Neon PostgreSQL (${sanitizeConnectionUrl(directUrl)})...`);
  const sql = neon(directUrl);

  const migrationsDir = join(__dirname, '../migrations');
  const sqlFiles = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of sqlFiles) {
    console.log(`Applying migration: ${file}...`);
    const sqlContent = readFileSync(join(migrationsDir, file), 'utf-8');

    try {
      // Execute each migration with exponential backoff retry in case Neon compute is waking up
      await retryWithBackoff(async () => {
        await sql(sqlContent);
      }, {
        maxRetries: 3,
        initialDelayMs: 500,
        maxDelayMs: 4000,
        onRetry: (err: any, attempt: number, delayMs: number) => {
          console.warn(`[MIGRATION] Retrying migration ${file} (attempt ${attempt}) after ${delayMs}ms due to: ${err?.message || err}`);
        }
      });
      console.log(`✓ Migration ${file} applied successfully.`);
    } catch (err: any) {
      console.error(`❌ Migration ${file} failed:`, err.message);
      throw err;
    }
  }

  console.log('🎉 All migrations applied successfully!');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations().catch((err) => {
    console.error('Fatal error during migration:', err);
    process.exit(1);
  });
}
