import { createDbClient, type DbClient } from '@denaneya/database';

let globalDb: DbClient | null = null;

export function getDb(): DbClient {
  if (globalDb) return globalDb;
  const client = createDbClient(process.env.DATABASE_URL);
  if (client) {
    globalDb = client;
    return client;
  }
  return null as unknown as DbClient;
}

export const db = (process.env.DATABASE_URL ? createDbClient(process.env.DATABASE_URL) : null) as DbClient;
