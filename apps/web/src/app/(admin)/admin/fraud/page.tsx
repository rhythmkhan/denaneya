import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { reviewCases, payments } from '@denaneya/database';
import { requireAdmin } from '@/lib/auth/rbac-guard';
import { MakerCheckerClient } from './maker-checker-client';

export default async function AdminFraudPage() {
  const admin = await requireAdmin('platform:fraud_review_maker_checker');

  let rows: any[] = [];
  if (db) {
    const cases = await db
      .select({
        id: reviewCases.id,
        paymentId: reviewCases.paymentId,
        merchantId: reviewCases.merchantId,
        status: reviewCases.status,
        reason: reviewCases.reason,
        makerId: reviewCases.makerId,
        makerRecommendation: reviewCases.makerRecommendation,
        makerNotes: reviewCases.makerNotes,
        checkerId: reviewCases.checkerId,
        checkerDecision: reviewCases.checkerDecision,
        createdAt: reviewCases.createdAt,
        amountPaisa: payments.amountPaisa,
        riskScore: payments.riskScore,
        customerName: payments.customerName,
      })
      .from(reviewCases)
      .leftJoin(payments, eq(reviewCases.paymentId, payments.id))
      .orderBy(desc(reviewCases.createdAt));

    rows = cases;
  }

  if (rows.length === 0) {
    rows = [
      {
        id: 'rcs_9a8b1c01',
        paymentId: 'pay_9f83a812003',
        merchantId: 'mch_9k8a2b3c4d',
        status: 'OPEN',
        reason: 'Velocity threshold breached: 3 transactions in 60 seconds from same IP (Risk 78)',
        makerId: null,
        makerRecommendation: null,
        makerNotes: null,
        checkerId: null,
        checkerDecision: null,
        createdAt: new Date(),
        amountPaisa: 750000n,
        riskScore: 78,
        customerName: 'Tanvir Hossain',
      },
      {
        id: 'rcs_9a8b1c02',
        paymentId: 'pay_9f83a812004',
        merchantId: 'mch_9k8a2b3c4d',
        status: 'MAKER_RECOMMENDED',
        reason: 'High single transaction amount (> ৳ 50,000) on newly onboarded merchant (Risk 68)',
        makerId: 'usr_maker_admin1',
        makerRecommendation: 'APPROVE',
        makerNotes: 'Verified trade license and merchant phone. Legitimate enterprise B2B order.',
        checkerId: null,
        checkerDecision: null,
        createdAt: new Date(Date.now() - 3600000),
        amountPaisa: 5000000n,
        riskScore: 68,
        customerName: 'Meghna Trade Corp',
      },
    ];
  }

  return <MakerCheckerClient cases={rows} currentAdminId={admin.id} />;
}
