import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  assertPermission,
  assertTenantAccess,
  ForbiddenError,
  TenantMismatchError,
  ROLE_PERMISSIONS
} from '../src/rbac.js';
import type { UserAuthContext } from '../src/types.js';

describe('Server-Side RBAC & Multi-Tenant BOLA Guard', () => {
  it('T2.21: PLATFORM_ADMIN role has platform management permissions', () => {
    expect(hasPermission('PLATFORM_ADMIN', 'platform:merchants_manage')).toBe(true);
    expect(hasPermission('PLATFORM_ADMIN', 'platform:fraud_review_maker_checker')).toBe(true);
    expect(hasPermission('PLATFORM_ADMIN', 'payments:refund')).toBe(true);
  });

  it('T2.22: MERCHANT_VIEWER role cannot refund payments or create api keys', () => {
    expect(hasPermission('MERCHANT_VIEWER', 'payments:read')).toBe(true);
    expect(hasPermission('MERCHANT_VIEWER', 'payments:refund')).toBe(false);
    expect(hasPermission('MERCHANT_VIEWER', 'api_keys:create')).toBe(false);
  });

  it('T2.23: MERCHANT_DEVELOPER role can manage API keys but cannot refund or invite team', () => {
    expect(hasPermission('MERCHANT_DEVELOPER', 'api_keys:create')).toBe(true);
    expect(hasPermission('MERCHANT_DEVELOPER', 'api_keys:rotate')).toBe(true);
    expect(hasPermission('MERCHANT_DEVELOPER', 'webhooks:test')).toBe(true);
    expect(hasPermission('MERCHANT_DEVELOPER', 'payments:refund')).toBe(false);
    expect(hasPermission('MERCHANT_DEVELOPER', 'team:invite')).toBe(false);
  });

  it('T2.24: assertPermission throws ForbiddenError when permission is missing', () => {
    expect(() => {
      assertPermission('MERCHANT_FINANCE', 'api_keys:create');
    }).toThrow(ForbiddenError);

    expect(() => {
      assertPermission('MERCHANT_OWNER', 'payments:refund');
    }).not.toThrow();
  });

  it('T2.25: assertTenantAccess blocks cross-tenant access (BOLA mitigation)', () => {
    const userA: UserAuthContext = {
      userId: 'usr_1',
      tenantId: 'mch_acme_corp',
      role: 'MERCHANT_ADMIN',
    };

    // Accessing own tenant passes
    expect(() => {
      assertTenantAccess(userA, 'mch_acme_corp');
    }).not.toThrow();

    // Accessing foreign tenant throws TenantMismatchError
    expect(() => {
      assertTenantAccess(userA, 'mch_hacked_victim');
    }).toThrow(TenantMismatchError);

    // Platform staff admin can access any tenant
    const platformStaff: UserAuthContext = {
      userId: 'usr_staff_1',
      tenantId: 'mch_platform',
      role: 'PLATFORM_ADMIN',
      isPlatformStaff: true,
    };
    expect(() => {
      assertTenantAccess(platformStaff, 'mch_hacked_victim');
    }).not.toThrow();
  });

  it('T2.26: hasAllPermissions and hasAnyPermission behave correctly', () => {
    expect(hasAllPermissions('MERCHANT_OWNER', ['payments:read', 'payments:create'])).toBe(true);
    expect(hasAllPermissions('MERCHANT_VIEWER', ['payments:read', 'payments:refund'])).toBe(false);
    expect(hasAnyPermission('MERCHANT_VIEWER', ['payments:read', 'payments:refund'])).toBe(true);
    expect(hasAnyPermission('MERCHANT_VIEWER', ['payments:refund', 'api_keys:create'])).toBe(false);
  });

  it('T2.27: hasPermission safely returns false for Object.prototype property names', () => {
    const prototypeProperties = [
      'constructor',
      '__proto__',
      'toString',
      'valueOf',
      'hasOwnProperty',
      'isPrototypeOf',
      'propertyIsEnumerable',
      'toLocaleString',
    ];

    for (const prop of prototypeProperties) {
      expect(hasPermission(prop as any, 'payments:read')).toBe(false);
      expect(() => assertPermission(prop as any, 'payments:read')).toThrow(ForbiddenError);
    }
  });

  it('T2.28: hasPermission safely returns false for bogus and non-string role values', () => {
    const bogusValues = ['', 'null', 'undefined', null, undefined, 12345, {}, []];
    for (const bogus of bogusValues) {
      expect(hasPermission(bogus as any, 'payments:read')).toBe(false);
    }
  });

  it('T2.29: ROLE_PERMISSIONS has null prototype and is frozen', () => {
    expect(Object.getPrototypeOf(ROLE_PERMISSIONS)).toBeNull();
    expect(Object.isFrozen(ROLE_PERMISSIONS)).toBe(true);
    expect((ROLE_PERMISSIONS as any)['constructor']).toBeUndefined();
    expect((ROLE_PERMISSIONS as any)['__proto__']).toBeUndefined();
  });
});
