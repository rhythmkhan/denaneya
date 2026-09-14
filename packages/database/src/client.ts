import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';
import * as schema from './schema/index.js';

export function createDbClient(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    // If not provided at import time, return a lazy proxy or dummy connection handler
    return null;
  }
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

// Lazy or default instance when DATABASE_URL is available
export const db = process.env.DATABASE_URL
  ? drizzle(new Pool({ connectionString: process.env.DATABASE_URL }), { schema })
  : (null as unknown as DbClient);
