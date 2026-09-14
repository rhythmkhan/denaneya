import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { authenticateApiKey } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { jsonResponse } from '@/lib/api/response';
import { ApiError, handleRouteError } from '@/lib/api/errors';
import {
  runReconciliation,
  formatReconciliationResponse,
} from '@denaneya/reconciliation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const runReconciliationBodySchema = z.object({
  batchId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  provider: z.string().optional(),
  merchantId: z.string().optional(),
  autoHeal: z.boolean().optional().default(false),
  content: z.string().optional(),
  batchReference: z.string().optional(),
  feeTolerancePaisa: z.string().optional(),
  expectedMdrBps: z.number().int().nonnegative().optional(),
});

export async function POST(request: NextRequest) {
  let requestId = 'req_' + Date.now();
  try {
    const authCtx = await authenticateApiKey(request, 'reconciliation:write');
    requestId = authCtx.requestId;
    const rateHeaders = await checkRateLimit(request, authCtx.merchant.id);

    const rawBody = await request.json().catch(() => ({}));
    const parseResult = runReconciliationBodySchema.safeParse(rawBody);

    if (!parseResult.success) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'Invalid reconciliation request parameters',
        422,
        requestId,
        { errors: parseResult.error.errors }
      );
    }

    const {
      batchId,
      startDate: startStr,
      endDate: endStr,
      provider,
      merchantId: reqMerchantId,
      autoHeal,
      content,
      batchReference,
      feeTolerancePaisa,
      expectedMdrBps,
    } = parseResult.data;

    // Enforce strict tenant isolation: merchants can only reconcile their own transactions (OWASP API1:2023 BOLA defense)
    if (reqMerchantId && reqMerchantId !== authCtx.merchant.id) {
      throw new ApiError(
        'FORBIDDEN',
        'Cannot execute reconciliation for another merchant',
        403,
        requestId
      );
    }

    const targetMerchantId = authCtx.merchant.id;

    const startDate = startStr ? new Date(startStr) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const endDate = endStr ? new Date(endStr) : new Date();

    const result = await runReconciliation(
      {
        batchId,
        startDate,
        endDate,
        provider,
        merchantId: targetMerchantId,
        autoHeal,
        content,
        batchReference,
        feeTolerancePaisa: feeTolerancePaisa ? BigInt(feeTolerancePaisa) : 0n,
        expectedMdrBps,
        triggeredBy: 'API',
      },
      db
    );

    const formatted = formatReconciliationResponse(result);

    return jsonResponse(
      {
        success: true,
        data: formatted,
      },
      {
        status: 200,
        headers: rateHeaders,
      }
    );
  } catch (err) {
    return handleRouteError(err, requestId);
  }
}
