import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import type { Role } from '@denaneya/security';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  activeMerchantId?: string;
  activeMerchantName?: string;
  activeRole: Role;
  environment: 'SANDBOX' | 'PRODUCTION';
}

export interface SessionData {
  user: SessionUser;
  expires: string;
}

const SESSION_COOKIE_NAME = 'dn_session';
const DEFAULT_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function getJwtSecret(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET || process.env.SESSION_SECRET || DEFAULT_SECRET;
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser, expiresIn: string = '8h'): Promise<string> {
  const secret = getJwtSecret();
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret);
    return {
      id: payload.id as string,
      email: payload.email as string,
      name: payload.name as string,
      isSuperAdmin: Boolean(payload.isSuperAdmin),
      activeMerchantId: payload.activeMerchantId as string | undefined,
      activeMerchantName: payload.activeMerchantName as string | undefined,
      activeRole: (payload.activeRole as Role) || 'VIEWER',
      environment: (payload.environment as 'SANDBOX' | 'PRODUCTION') || 'SANDBOX',
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionData | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    const user = await verifySessionToken(token);
    if (!user) return null;

    return {
      user,
      expires: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(user: SessionUser): Promise<string> {
  const token = await createSessionToken(user);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60, // 8 hours
  });
  return token;
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
