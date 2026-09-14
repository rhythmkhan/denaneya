'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@denaneya/database';
import { getSession } from '@/lib/auth/session';
import { generateTotpSecret, getTotpUri, verifyTotpCode } from '@/lib/auth/totp';
import { encryptionService } from '@denaneya/security';
import { revalidatePath } from 'next/cache';

export async function initiateMfaSetupAction() {
  const session = await getSession();
  if (!session?.user?.id) {
    return { error: 'Unauthorized' };
  }

  const secret = generateTotpSecret(20);
  const uri = getTotpUri(session.user.email, secret, 'DenaNeya');

  return { secret, uri };
}

export async function enableMfaAction(secret: string, totpCode: string) {
  const session = await getSession();
  if (!session?.user?.id) {
    return { error: 'Unauthorized' };
  }

  const isValid = verifyTotpCode(totpCode, secret);
  if (!isValid) {
    return { error: 'Invalid verification code. Please check your authenticator and try again.' };
  }

  if (db) {
    const encryptedSecret = encryptionService.encryptField(secret, { aad: session.user.id });
    await db
      .update(users)
      .set({
        mfaSecret: encryptedSecret,
        mfaEnabled: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.user.id));
  }

  revalidatePath('/dashboard/settings/mfa');
  return { success: true };
}

export async function disableMfaAction(totpCode: string) {
  const session = await getSession();
  if (!session?.user?.id) {
    return { error: 'Unauthorized' };
  }

  if (db) {
    const [user] = await db
      .select({ id: users.id, mfaSecret: users.mfaSecret, mfaEnabled: users.mfaEnabled })
      .from(users)
      .where(eq(users.id, session.user.id));

    if (!user || !user.mfaSecret) {
      return { error: 'MFA is not configured.' };
    }

    const decryptedSecret = encryptionService.decryptField(user.mfaSecret, { aad: session.user.id });
    const isValid = verifyTotpCode(totpCode, decryptedSecret);
    if (!isValid) {
      return { error: 'Invalid verification code.' };
    }

    await db
      .update(users)
      .set({
        mfaSecret: null,
        mfaEnabled: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.user.id));
  }

  revalidatePath('/dashboard/settings/mfa');
  return { success: true };
}

export async function getMfaStatusAction() {
  const session = await getSession();
  if (!session?.user?.id) {
    return { mfaEnabled: false };
  }

  if (db) {
    const [user] = await db
      .select({ mfaEnabled: users.mfaEnabled })
      .from(users)
      .where(eq(users.id, session.user.id));

    return { mfaEnabled: Boolean(user?.mfaEnabled) };
  }

  return { mfaEnabled: false };
}
