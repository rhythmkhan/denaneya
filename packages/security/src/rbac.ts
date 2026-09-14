import type { Role, Permission, UserAuthContext } from './types.js';

const RAW_ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  PLATFORM_ADMIN: [
    'payments:read',
    'payments:create',
    'payments:cancel',
    'payments:refund',
    'invoices:read',
    'invoices:write',
    'payment_links:read',
    'payment_links:write',
    'webhooks:read',
    'webhooks:write',
    'webhooks:test',
    'api_keys:read',
    'api_keys:create',
    'api_keys:rotate',
    'api_keys:revoke',
    'devices:read',
    'devices:pair',
    'devices:revoke',
    'ledger:read',
    'reconciliation:read',
    'reconciliation:trigger',
    'team:read',
    'team:invite',
    'team:modify_role',
    'team:remove',
    'merchant:settings_read',
    'merchant:settings_write',
    'merchant:delete',
    'platform:merchants_manage',
    'platform:gateways_manage',
    'platform:fraud_rules_manage',
    'platform:fraud_review_maker_checker',
    'platform:audit_logs_read',
    'platform:feature_flags_manage',
  ],

  MERCHANT_OWNER: [
    'payments:read',
    'payments:create',
    'payments:cancel',
    'payments:refund',
    'invoices:read',
    'invoices:write',
    'payment_links:read',
    'payment_links:write',
    'webhooks:read',
    'webhooks:write',
    'webhooks:test',
    'api_keys:read',
    'api_keys:create',
    'api_keys:rotate',
    'api_keys:revoke',
    'devices:read',
    'devices:pair',
    'devices:revoke',
    'ledger:read',
    'reconciliation:read',
    'reconciliation:trigger',
    'team:read',
    'team:invite',
    'team:modify_role',
    'team:remove',
    'merchant:settings_read',
    'merchant:settings_write',
    'merchant:delete',
  ],

  MERCHANT_ADMIN: [
    'payments:read',
    'payments:create',
    'payments:cancel',
    'payments:refund',
    'invoices:read',
    'invoices:write',
    'payment_links:read',
    'payment_links:write',
    'webhooks:read',
    'webhooks:write',
    'webhooks:test',
    'api_keys:read',
    'devices:read',
    'devices:pair',
    'devices:revoke',
    'ledger:read',
    'reconciliation:read',
    'reconciliation:trigger',
    'team:read',
    'merchant:settings_read',
    'merchant:settings_write',
  ],

  MERCHANT_DEVELOPER: [
    'payments:read',
    'payments:create',
    'payment_links:read',
    'payment_links:write',
    'webhooks:read',
    'webhooks:write',
    'webhooks:test',
    'api_keys:read',
    'api_keys:create',
    'api_keys:rotate',
    'api_keys:revoke',
    'devices:read',
    'devices:pair',
    'merchant:settings_read',
  ],

  MERCHANT_FINANCE: [
    'payments:read',
    'invoices:read',
    'payment_links:read',
    'ledger:read',
    'reconciliation:read',
    'merchant:settings_read',
  ],

  MERCHANT_VIEWER: [
    'payments:read',
    'invoices:read',
    'payment_links:read',
    'devices:read',
    'merchant:settings_read',
  ],
};

/**
 * Immutable role permissions map backed by a null-prototype dictionary.
 * Prevents prototype inheritance lookups (e.g. constructor, toString).
 */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = Object.freeze(
  Object.assign(Object.create(null), RAW_ROLE_PERMISSIONS)
);

export class ForbiddenError extends Error {
  public readonly code = 'FORBIDDEN';
  public readonly statusCode = 403;
  public readonly requiredPermission?: Permission;

  constructor(message = 'Access denied: insufficient permissions', requiredPermission?: Permission) {
    super(message);
    this.name = 'ForbiddenError';
    this.requiredPermission = requiredPermission;
  }
}

export class TenantMismatchError extends Error {
  public readonly code = 'TENANT_MISMATCH';
  public readonly statusCode = 403;

  constructor(message = 'Access denied: resource belongs to a different merchant tenant') {
    super(message);
    this.name = 'TenantMismatchError';
  }
}

export function hasPermission(role: Role, permission: Permission): boolean {
  if (!role || typeof role !== 'string') {
    return false;
  }
  if (!Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role)) {
    return false;
  }
  const allowed = ROLE_PERMISSIONS[role];
  return Array.isArray(allowed) ? allowed.includes(permission) : false;
}

export function hasAllPermissions(role: Role, permissions: Permission[]): boolean {
  return permissions.every(p => hasPermission(role, p));
}

export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(role, p));
}

export function assertPermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new ForbiddenError(
      `Role '${role}' lacks required permission '${permission}'`,
      permission
    );
  }
}

/**
 * Asserts multi-tenant data access boundaries.
 * Guarantees that a merchant user cannot query or mutate data belonging
 * to another merchant (mitigating Broken Object Level Authorization - BOLA).
 */
export function assertTenantAccess(
  userContext: UserAuthContext,
  resourceTenantId: string
): void {
  if (userContext.role === 'PLATFORM_ADMIN' && userContext.isPlatformStaff) {
    return; // Platform admin has cross-tenant oversight
  }
  if (userContext.tenantId !== resourceTenantId) {
    throw new TenantMismatchError(
      `Tenant mismatch: User tenant '${userContext.tenantId}' cannot access resource tenant '${resourceTenantId}'`
    );
  }
}
