import { neon } from '@neondatabase/serverless';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function runMigrations() {
  const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!directUrl) {
    console.error('Missing DIRECT_URL or DATABASE_URL environment variable');
    throw new Error('Missing DIRECT_URL or DATABASE_URL environment variable');
  }

  console.log('🚀 Running database migrations against Neon PostgreSQL...');
  const sql = neon(directUrl);

  const migrationsDir = join(__dirname, '../migrations');
  const sqlFiles = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of sqlFiles) {
    console.log(`Applying migration: ${file}...`);
    const sqlContent = readFileSync(join(migrationsDir, file), 'utf-8');
    
    try {
      await sql(sqlContent);
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
