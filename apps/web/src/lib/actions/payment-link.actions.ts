'use server';

import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { paymentLinks } from '@denaneya/database';
import { requireMerchant } from '@/lib/auth/rbac-guard';
import { revalidatePath } from 'next/cache';
import { Paisa } from '@denaneya/payment-core';

export async function createPaymentLinkAction(_prevState: any, formData: FormData) {
  const { merchantId } = await requireMerchant('payment_links:write');

  const title = String(formData.get('title') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const slugInput = String(formData.get('slug') || '').trim();
  const amountBDT = formData.get('amountBDT');
  const type = (formData.get('type') || 'SINGLE_USE') as 'SINGLE_USE' | 'MULTI_USE';
  const maxUsesInput = formData.get('maxUses');

  if (!title) {
    return { error: 'Title is required' };
  }

  const slug = slugInput || crypto.randomBytes(6).toString('hex');
  const amountPaisa = amountBDT && String(amountBDT).trim() ? Paisa.fromBDT(String(amountBDT).trim()).toPaisa() : null;
  const maxUses = type === 'SINGLE_USE' ? 1 : maxUsesInput ? Number(maxUsesInput) : null;
  const linkId = 'plk_' + crypto.randomBytes(12).toString('hex');

  if (db) {
    // Check slug uniqueness
    const [existing] = await db
      .select()
      .from(paymentLinks)
      .where(eq(paymentLinks.slug, slug));

    if (existing) {
      return { error: 'This URL slug is already taken. Please choose another.' };
    }

    await db.insert(paymentLinks).values({
      id: linkId,
      merchantId,
      title,
      description: description || null,
      slug,
      amountPaisa,
      currency: 'BDT',
      type,
      status: 'ACTIVE',
      maxUses,
    });
  }

  revalidatePath('/dashboard/payment-links');
  return { success: true, linkId, slug };
}

export async function revokePaymentLinkAction(linkId: string) {
  const { merchantId } = await requireMerchant('payment_links:write');

  if (db) {
    await db
      .update(paymentLinks)
      .set({
        status: 'INACTIVE',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paymentLinks.id, linkId),
          eq(paymentLinks.merchantId, merchantId)
        )
      );
  }

  revalidatePath('/dashboard/payment-links');
  return { success: true };
}
