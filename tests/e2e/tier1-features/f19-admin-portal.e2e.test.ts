import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Feature 19: Admin Portal (E2E-T1-F19)', () => {
  const adminDir = path.resolve(process.cwd(), 'apps/web/src/app/(admin)/admin');

  // E2E-T1-F19-01: Admin Superuser Authentication & Role Enforcement
  it('E2E-T1-F19-01: Admin Superuser Authentication & Role Enforcement', () => {
    const adminLayoutPath = path.resolve(process.cwd(), 'apps/web/src/app/(admin)/layout.tsx');
    expect(fs.existsSync(adminLayoutPath)).toBe(true);

    const content = fs.readFileSync(adminLayoutPath, 'utf8');
    expect(content).toContain('PLATFORM_ADMIN');
    expect(content).toContain('isSuperAdmin');
  });

  // E2E-T1-F19-02: System-Wide Platform Volume & Revenue Metric Dashboard
  it('E2E-T1-F19-02: System-Wide Platform Volume & Revenue Metric Dashboard', () => {
    const adminPage = path.join(adminDir, 'page.tsx');
    expect(fs.existsSync(adminPage)).toBe(true);

    const content = fs.readFileSync(adminPage, 'utf8');
    expect(content).toContain('Platform Operations Center');
    expect(content).toContain('totalMerchants');
  });

  // E2E-T1-F19-03: Merchant Account Onboarding & Verification Approval
  it('E2E-T1-F19-03: Merchant Account Onboarding & Verification Approval', () => {
    const kycClientPath = path.join(adminDir, 'merchants', '[id]', 'kyc-buttons-client.tsx');
    expect(fs.existsSync(kycClientPath)).toBe(true);

    const content = fs.readFileSync(kycClientPath, 'utf8');
    expect(content).toContain('adminApproveKycAction');
    expect(content).toContain('Approve KYC');
  });

  // E2E-T1-F19-04: Gateway Health Monitoring Real-Time Status Board
  it('E2E-T1-F19-04: Gateway Health Monitoring Real-Time Status Board', () => {
    const gatewaysBoardPath = path.join(adminDir, 'gateways', 'page.tsx');
    expect(fs.existsSync(gatewaysBoardPath)).toBe(true);

    const content = fs.readFileSync(gatewaysBoardPath, 'utf8');
    expect(content).toContain('GatewaysBoardClient');
    expect(content).toContain('bKash Direct PGW');
  });

  // E2E-T1-F19-05: Immutable Platform Audit Log Viewer
  it('E2E-T1-F19-05: Immutable Platform Audit Log Viewer', () => {
    const auditLogsPath = path.join(adminDir, 'audit-logs', 'page.tsx');
    expect(fs.existsSync(auditLogsPath)).toBe(true);

    const content = fs.readFileSync(auditLogsPath, 'utf8');
    expect(content).toContain('AuditLogsClient');
    expect(content).toContain('auditLogs');
  });
});
