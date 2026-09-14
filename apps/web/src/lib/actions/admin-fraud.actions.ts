'use server';

import crypto from 'node:crypto';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { reviewCases, payments, auditLogs } from '@denaneya/database';
import { requireAdmin } from '@/lib/auth/rbac-guard';
import { DualControlViolationError } from '@denaneya/payment-core';
import { settlePaymentAtomic } from '@denaneya/ledger';
import { revalidatePath } from 'next/cache';

export async function adminMakerReviewAction(params: {
  caseId: string;
  recommendation: 'APPROVE' | 'REJECT';
  notes?: string;
}) {
  const admin = await requireAdmin('platform:fraud_review_maker_checker');

  if (!db) return { success: true };

  const [existingCase] = await db
    .select()
    .from(reviewCases)
    .where(eq(reviewCases.id, params.caseId));

  if (!existingCase) throw new Error('Review case not found');
  if (existingCase.status !== 'OPEN') {
    throw new Error(`Case cannot be reviewed by maker in state '${existingCase.status}'`);
  }

  await db
    .update(reviewCases)
    .set({
      makerId: admin.id,
      makerRecommendation: params.recommendation,
      makerNotes: params.notes || null,
      makerDecidedAt: new Date(),
      status: 'MAKER_RECOMMENDED',
      updatedAt: new Date(),
    })
    .where(eq(reviewCases.id, params.caseId));

  revalidatePath('/admin/fraud');
  return { success: true };
}

export async function adminCheckerReviewAction(params: {
  caseId: string;
  decision: 'APPROVE' | 'REJECT';
  notes?: string;
}) {
  const checker = await requireAdmin('platform:fraud_review_maker_checker');

  if (!db) return { success: true };

  const [existingCase] = await db
    .select()
    .from(reviewCases)
    .where(eq(reviewCases.id, params.caseId));

  if (!existingCase) throw new Error('Review case not found');

  // CRITICAL ENFORCEMENT: Dual-Control Maker-Checker Separation of Duties!
  if (existingCase.makerId && existingCase.makerId === checker.id) {
    throw new DualControlViolationError(
      'DualControlViolationError: Checker cannot be the same administrator as the Maker. Separation of duties violation.'
    );
  }

  const newStatus = params.decision === 'APPROVE' ? 'CHECKER_APPROVED' : 'CHECKER_REJECTED';

  await db.transaction(async (tx) => {
    // 1. Update review case
    await tx
      .update(reviewCases)
      .set({
        checkerId: checker.id,
        checkerDecision: params.decision,
        checkerNotes: params.notes || null,
        checkerDecidedAt: new Date(),
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(reviewCases.id, params.caseId));

    // 2. Resolve Payment
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, existingCase.paymentId));

    if (payment) {
      if (params.decision === 'APPROVE') {
        // Settle payment atomically
        await settlePaymentAtomic(tx, {
          paymentId: payment.id,
          providerTrxId: payment.providerTrxId || 'APPROVED_BY_CHECKER',
          provider: payment.provider || 'SANDBOX',
          amountPaisa: payment.amountPaisa,
          feePaisa: payment.feePaisa,
        });
      } else {
        await tx
          .update(payments)
          .set({
            status: 'CANCELLED',
            updatedAt: new Date(),
          })
          .where(eq(payments.id, payment.id));
      }
    }

    // 3. Append to Audit Log
    const auditId = 'aud_' + crypto.randomBytes(12).toString('hex');
    const prevLog = await tx.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(1);
    const prevHash = prevLog[0]?.currentHash || '0000000000000000000000000000000000000000000000000000000000000000';
    const now = new Date();
    const payloadStr = JSON.stringify({ caseId: params.caseId, decision: params.decision, makerId: existingCase.makerId, checkerId: checker.id });
    const currentHash = crypto.createHash('sha256').update(auditId + now.toISOString() + checker.id + 'fraud.checker_decided' + payloadStr + prevHash).digest('hex');

    await tx.insert(auditLogs).values({
      id: auditId,
      merchantId: existingCase.merchantId,
      actorId: checker.id,
      actorType: 'USER',
      action: 'fraud.checker_decided',
      resourceType: 'review_case',
      resourceId: params.caseId,
      previousHash: prevHash,
      currentHash,
      payload: { decision: params.decision, makerId: existingCase.makerId, checkerId: checker.id },
      timestamp: now,
    });
  });

  revalidatePath('/admin/fraud');
  return { success: true };
}
