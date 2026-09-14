'use server';

import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { webhookSubscriptions } from '@denaneya/database';
import { requireMerchant } from '@/lib/auth/rbac-guard';
import { validateUrlForSsrf, EncryptionService } from '@denaneya/security';
import { revalidatePath } from 'next/cache';

export async function registerWebhookAction(url: string, events: string[] = ['payment.completed', 'refund.created']) {
  const { merchantId } = await requireMerchant('webhooks:write');

  const targetUrl = url.trim();
  if (!targetUrl) {
    throw new Error('URL is required');
  }

  // SSRF Protection Guard
  const ssrfCheck = await validateUrlForSsrf(targetUrl, {
    allowHttp: process.env.NODE_ENV !== 'production',
  });

  if (!ssrfCheck.safe) {
    throw new Error(`SSRF Validation Failed: ${ssrfCheck.error}`);
  }

  const rawSecret = 'whsec_' + crypto.randomBytes(24).toString('hex');
  const enc = new EncryptionService();
  const encryptedSecret = JSON.stringify(enc.encrypt(rawSecret, { aad: merchantId }));
  const subscriptionId = 'whs_' + crypto.randomBytes(12).toString('hex');

  if (db) {
    await db.insert(webhookSubscriptions).values({
      id: subscriptionId,
      merchantId,
      url: targetUrl,
      secret: encryptedSecret,
      events,
      status: 'ACTIVE',
    });
  }

  revalidatePath('/dashboard/webhooks');
  return {
    success: true,
    subscriptionId,
    secret: rawSecret, // Return secret ONCE
  };
}

export async function deleteWebhookAction(subscriptionId: string) {
  const { merchantId } = await requireMerchant('webhooks:write');

  if (db) {
    await db
      .delete(webhookSubscriptions)
      .where(
        and(
          eq(webhookSubscriptions.id, subscriptionId),
          eq(webhookSubscriptions.merchantId, merchantId)
        )
      );
  }

  revalidatePath('/dashboard/webhooks');
  return { success: true };
}
