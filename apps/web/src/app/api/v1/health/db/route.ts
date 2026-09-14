import { NextRequest } from 'next/server';
import { db, checkDatabaseHealth } from '@/lib/db';
import { jsonResponse } from '@/lib/api/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  const health = await checkDatabaseHealth(db);

  // Return HTTP 503 Service Unavailable when the database is completely down
  const statusCode = health.status === 'DOWN' ? 503 : 200;

  return jsonResponse(
    {
      status: health.status,
      latencyMs: health.latencyMs,
      timestamp: health.timestamp,
      mode: health.mode,
      host: health.host,
      message: health.message,
      ...(health.error ? { error: health.error } : {}),
    },
    { status: statusCode }
  );
}
