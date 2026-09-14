'use server';

import crypto from 'node:crypto';
import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auditLogs } from '@denaneya/database';
import { requireAdmin } from '@/lib/auth/rbac-guard';
import { revalidatePath } from 'next/cache';

export async function adminToggleFeatureFlagAction(flagKey: string, newValue: boolean) {
  const admin = await requireAdmin('platform:feature_flags_manage');

  if (flagKey === 'REGULATED_FEATURES_ENABLED' && newValue === true) {
    throw new Error(
      'Regulatory Invariant: REGULATED_FEATURES_ENABLED cannot be enabled in Software/Orchestration mode per Bangladesh Bank regulations.'
    );
  }

  if (db) {
    const auditId = 'aud_' + crypto.randomBytes(12).toString('hex');
    const prevLog = await db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(1);
    const prevHash = prevLog[0]?.currentHash || '0000000000000000000000000000000000000000000000000000000000000000';
    const now = new Date();
    const payloadStr = JSON.stringify({ flagKey, newValue });
    const currentHash = crypto.createHash('sha256').update(auditId + now.toISOString() + admin.id + 'feature_flag.toggled' + payloadStr + prevHash).digest('hex');

    await db.insert(auditLogs).values({
      id: auditId,
      actorId: admin.id,
      actorType: 'USER',
      action: 'feature_flag.toggled',
      resourceType: 'feature_flag',
      resourceId: flagKey,
      previousHash: prevHash,
      currentHash,
      payload: { flagKey, newValue },
      timestamp: now,
    });
  }

  revalidatePath('/admin/feature-flags');
  return { success: true };
}
