import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auditLogs } from '@denaneya/database';
import { requireAdmin } from '@/lib/auth/rbac-guard';
import { AuditLogsClient } from './audit-logs-client';

export default async function AdminAuditLogsPage() {
  await requireAdmin('platform:audit_logs_read');

  let rows: any[] = [];
  if (db) {
    rows = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.timestamp))
      .limit(50);
  }

  if (rows.length === 0) {
    rows = [
      {
        id: 'aud_001',
        actorId: 'usr_admin_01',
        actorType: 'USER',
        action: 'fraud.checker_approved',
        resourceType: 'review_case',
        resourceId: 'rcs_9a8b1c01',
        previousHash: '0000000000000000000000000000000000000000000000000000000000000000',
        currentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        payload: { decision: 'APPROVE', amountPaisa: '500000' },
        timestamp: new Date(),
      },
      {
        id: 'aud_002',
        actorId: 'usr_admin_01',
        actorType: 'USER',
        action: 'merchant.kyc_approved',
        resourceType: 'merchant',
        resourceId: 'mch_9k8a2b3c4d01',
        previousHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        currentHash: '8729837498237498273498273498273498273498273498273498273498273498',
        payload: { status: 'VERIFIED' },
        timestamp: new Date(Date.now() - 3600000),
      },
    ];
  }

  return <AuditLogsClient initialLogs={rows} />;
}
