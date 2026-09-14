import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 86400; // 24 hours

let cachedSpec: unknown = null;

function getOpenApiSpec() {
  if (cachedSpec) {
    return cachedSpec;
  }

  const possiblePaths = [
    path.join(process.cwd(), 'docs', 'openapi.json'),
    path.join(process.cwd(), '..', '..', 'docs', 'openapi.json'),
    path.resolve(process.cwd(), '../../docs/openapi.json'),
    path.resolve(__dirname, '../../../../../../../docs/openapi.json'),
  ];

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        cachedSpec = JSON.parse(fileContent);
        return cachedSpec;
      } catch {
        // Continue searching other candidate paths
      }
    }
  }

  return null;
}

export async function GET() {
  const spec = getOpenApiSpec();

  if (!spec) {
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'OpenAPI specification document not found.',
          requestId: `req_${Date.now()}`,
        },
      },
      { status: 500 }
    );
  }

  return NextResponse.json(spec, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}
