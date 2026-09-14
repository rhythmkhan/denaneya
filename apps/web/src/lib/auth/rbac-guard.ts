import {
  hasPermission,
  assertPermission,
  assertTenantAccess,
  ForbiddenError,
  type Role,
  type Permission,
  type UserAuthContext,
} from '@denaneya/security';
import { getSession, type SessionUser } from './session';

export function toUserAuthContext(user: SessionUser): UserAuthContext {
  return {
    userId: user.id,
    tenantId: user.activeMerchantId || '',
    role: user.activeRole,
    isPlatformStaff: user.isSuperAdmin,
  };
}

export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession();
  if (!session || !session.user) {
    throw new ForbiddenError('Authentication required. Please log in.');
  }
  return session.user;
}

export async function requireMerchant(permission?: Permission): Promise<{ user: SessionUser; merchantId: string }> {
  const user = await requireAuth();
  if (!user.activeMerchantId) {
    throw new ForbiddenError('No active merchant context.');
  }
  if (permission) {
    assertPermission(user.activeRole, permission);
  }
  return { user, merchantId: user.activeMerchantId };
}

export async function requireAdmin(permission?: Permission): Promise<SessionUser> {
  const user = await requireAuth();
  if (!user.isSuperAdmin && user.activeRole !== 'PLATFORM_ADMIN') {
    throw new ForbiddenError('Access restricted to platform administrators.');
  }
  if (permission) {
    assertPermission(user.activeRole, permission);
  }
  return user;
}

export { hasPermission, assertPermission, assertTenantAccess, ForbiddenError, type Role, type Permission };
