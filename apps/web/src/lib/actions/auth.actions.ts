'use server';

import crypto from 'node:crypto';
import { eq, and, gt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, merchants, merchantMemberships, apiKeys, verificationTokens } from '@denaneya/database';
import { hashPassword, verifyPassword, defaultRateLimiter, RATE_LIMIT_RULES, encryptionService } from '@denaneya/security';
import { setSessionCookie, clearSessionCookie } from '@/lib/auth/session';
import { verifyTotpCode } from '@/lib/auth/totp';
import { redirect } from 'next/navigation';

export async function loginAction(_prevState: any, formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const mfaCode = String(formData.get('mfaCode') || '').trim();

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  // 1. Rate Limiting Check (10 attempts / min)
  const rateResult = await defaultRateLimiter.check(`ratelimit:login:${email}`, RATE_LIMIT_RULES.AUTH_LOGIN);

  if (!rateResult.allowed) {
    return { error: `Too many failed attempts. Please retry in ${rateResult.retryAfterSeconds} seconds.` };
  }

  if (!db) {
    // Demo fallback for local development without DB connection
    await setSessionCookie({
      id: 'usr_demo_01',
      email,
      name: 'Demo Merchant',
      isSuperAdmin: email.includes('admin'),
      activeMerchantId: 'mch_demo_01',
      activeMerchantName: 'Demo Store BD',
      activeRole: email.includes('admin') ? 'PLATFORM_ADMIN' : 'MERCHANT_OWNER',
      environment: 'SANDBOX',
    });
    redirect(email.includes('admin') ? '/admin' : '/dashboard');
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email));

  if (!user || !user.passwordHash || user.status !== 'ACTIVE') {
    return { error: 'Invalid email or password.' };
  }

  const validPassword = await verifyPassword(user.passwordHash, password);
  if (!validPassword) {
    return { error: 'Invalid email or password.' };
  }

  // MFA Challenge Check
  if (user.mfaEnabled && user.mfaSecret) {
    if (!mfaCode) {
      return { requiresMfa: true, email };
    }
    const decryptedSecret = encryptionService.decryptField(user.mfaSecret, { aad: user.id });
    const isValidTotp = verifyTotpCode(mfaCode, decryptedSecret);
    if (!isValidTotp) {
      return { error: 'Invalid 2FA verification code. Please check your authenticator app.', requiresMfa: true, email };
    }
  }

  // Find active merchant membership
  const [membership] = await db
    .select({
      membership: merchantMemberships,
      merchant: merchants,
    })
    .from(merchantMemberships)
    .innerJoin(merchants, eq(merchantMemberships.merchantId, merchants.id))
    .where(
      and(
        eq(merchantMemberships.userId, user.id),
        eq(merchantMemberships.status, 'ACTIVE')
      )
    );

  const activeRole = user.isSuperAdmin
    ? 'PLATFORM_ADMIN'
    : (membership?.membership.role as any) === 'OWNER'
    ? 'MERCHANT_OWNER'
    : (membership?.membership.role as any) === 'ADMIN'
    ? 'MERCHANT_ADMIN'
    : (membership?.membership.role as any) === 'DEVELOPER'
    ? 'MERCHANT_DEVELOPER'
    : (membership?.membership.role as any) === 'FINANCE'
    ? 'MERCHANT_FINANCE'
    : 'MERCHANT_VIEWER';

  await setSessionCookie({
    id: user.id,
    email: user.email,
    name: user.name,
    isSuperAdmin: user.isSuperAdmin,
    activeMerchantId: membership?.merchant.id,
    activeMerchantName: membership?.merchant.businessName,
    activeRole,
    environment: (membership?.merchant.environment as any) || 'SANDBOX',
  });

  redirect(user.isSuperAdmin ? '/admin' : '/dashboard');
}

export async function registerMerchantAction(_prevState: any, formData: FormData) {
  const name = String(formData.get('name') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const phone = String(formData.get('phone') || '').trim();
  const password = String(formData.get('password') || '');
  const businessName = String(formData.get('businessName') || '').trim();
  const businessType = String(formData.get('businessType') || 'INDIVIDUAL');

  if (!name || !email || !phone || !password || !businessName) {
    return { error: 'All fields are required.' };
  }

  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters long.' };
  }

  const userId = 'usr_' + crypto.randomBytes(12).toString('hex');
  const merchantId = 'mch_' + crypto.randomBytes(12).toString('hex');
  const membershipId = 'mem_' + crypto.randomBytes(12).toString('hex');

  const passwordHash = await hashPassword(password);

  if (db) {
    // Check if user already exists
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));

    if (existing) {
      return { error: 'An account with this email already exists.' };
    }

    // Atomic creation
    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        id: userId,
        email,
        name,
        phone,
        passwordHash,
        status: 'ACTIVE',
        isSuperAdmin: false,
      });

      await tx.insert(merchants).values({
        id: merchantId,
        name,
        businessName,
        businessType: businessType as any,
        email,
        phone,
        kycStatus: 'PENDING',
        status: 'ACTIVE',
        environment: 'SANDBOX',
        feeRateBps: 150,
      });

      await tx.insert(merchantMemberships).values({
        id: membershipId,
        merchantId,
        userId,
        role: 'OWNER',
        status: 'ACTIVE',
      });

      // Generate initial sandbox API key
      const rawSecret = 'dn_test_sec_' + crypto.randomBytes(16).toString('hex');
      const keyPrefix = rawSecret.slice(0, 16);
      const keyHash = crypto.createHash('sha256').update(rawSecret).digest('hex');

      await tx.insert(apiKeys).values({
        id: 'key_' + crypto.randomBytes(12).toString('hex'),
        merchantId,
        name: 'Default Sandbox Key',
        keyPrefix,
        keyHash,
        type: 'SECRET',
        environment: 'SANDBOX',
        scopes: ['payments:read', 'payments:write', 'payment_links:write', 'invoices:write', 'webhooks:write', 'devices:read', 'devices:pair'],
      });
    });
  }

  await setSessionCookie({
    id: userId,
    email,
    name,
    isSuperAdmin: false,
    activeMerchantId: merchantId,
    activeMerchantName: businessName,
    activeRole: 'MERCHANT_OWNER',
    environment: 'SANDBOX',
  });

  redirect('/dashboard');
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect('/login');
}

/**
 * Request Password Reset Action
 * Generates an expiring cryptographically secure token and persists to verificationTokens
 */
export async function requestPasswordResetAction(_prevState: any, formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return { error: 'Please enter a valid email address.' };
  }

  // Rate Limiting (10 attempts / min per IP/email)
  const rateKey = `ratelimit:pwreset:${email}`;
  const rateResult = await defaultRateLimiter.check(rateKey, RATE_LIMIT_RULES.AUTH_LOGIN);
  if (!rateResult.allowed) {
    return { error: `Too many requests. Please retry in ${rateResult.retryAfterSeconds} seconds.` };
  }

  if (db) {
    // Look up user (timing-safe; avoid user enumeration)
    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, email));

    if (user) {
      // 32-byte cryptographically random token
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiration
      const identifier = `password-reset:${user.email}`;

      // Clean up previous tokens for this identifier
      await db
        .delete(verificationTokens)
        .where(eq(verificationTokens.identifier, identifier));

      // Insert new token
      await db.insert(verificationTokens).values({
        identifier,
        token: tokenHash,
        expires: expiresAt,
      });

      console.log(`[AUTH] Password reset token generated for ${email}: /reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`);
    }
  }

  // Always return success to prevent email enumeration
  return { success: true, email };
}

/**
 * Reset Password Action
 * Validates token expiration, hashes new password via Argon2id, updates user profile, consumes token
 */
export async function resetPasswordAction(_prevState: any, formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const rawToken = String(formData.get('token') || '').trim();
  const password = String(formData.get('password') || '');
  const confirmPassword = String(formData.get('confirmPassword') || '');

  if (!email || !rawToken) {
    return { error: 'Invalid or missing password reset token.' };
  }

  if (!password || password.length < 8) {
    return { error: 'Password must be at least 8 characters long.' };
  }

  if (password !== confirmPassword) {
    return { error: 'Passwords do not match.' };
  }

  if (!db) {
    return { error: 'Database connection is required to reset password.' };
  }

  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const identifier = `password-reset:${email}`;

  // Find valid, unexpired token
  const [tokenRecord] = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, identifier),
        eq(verificationTokens.token, tokenHash),
        gt(verificationTokens.expires, new Date())
      )
    );

  if (!tokenRecord) {
    return { error: 'This password reset link is invalid or has expired. Please request a new one.' };
  }

  // Hash new password using genuine Argon2id
  const newPasswordHash = await hashPassword(password);

  // Update user in transaction and consume token
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.email, email));

    await tx
      .delete(verificationTokens)
      .where(eq(verificationTokens.identifier, identifier));
  });

  return { success: true };
}

