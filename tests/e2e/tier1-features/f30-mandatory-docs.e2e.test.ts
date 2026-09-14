import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Feature 30: 18+ Mandatory Documentation Files (E2E-T1-F30)', () => {
  const docsDir = path.resolve(process.cwd(), 'docs');
  const mandatoryDocs = [
    'README.md',
    'ARCHITECTURE.md',
    'DATABASE.md',
    'SECURITY.md',
    'THREAT-MODEL.md',
    'API.md',
    'WEBHOOKS.md',
    'ANDROID-SMS-AUTOMATION.md',
    'FRAUD-PREVENTION.md',
    'GATEWAY-INTEGRATIONS.md',
    'DEPLOYMENT.md',
    'VERCEL.md',
    'ENVIRONMENT.md',
    'BACKUP-RECOVERY.md',
    'INCIDENT-RESPONSE.md',
    'TESTING.md',
    'REGULATORY-NOTES.md',
    'CHANGELOG.md',
  ];

  // E2E-T1-F30-01: Existence & Non-Empty Check for All 18 Mandatory Docs
  it('E2E-T1-F30-01: Existence & Non-Empty Check for All 18 Mandatory Docs', () => {
    for (const doc of mandatoryDocs) {
      const filePath = path.join(docsDir, doc);
      expect(fs.existsSync(filePath), `Document ${doc} must exist`).toBe(true);
      const stat = fs.statSync(filePath);
      expect(stat.size).toBeGreaterThan(0);
    }
  });

  // E2E-T1-F30-02: Minimum Substantive Word Count Validation (>= 300 words)
  it('E2E-T1-F30-02: Minimum Substantive Word Count Validation (>= 300 words)', () => {
    for (const doc of mandatoryDocs) {
      const filePath = path.join(docsDir, doc);
      const content = fs.readFileSync(filePath, 'utf8');
      const wordCount = content.trim().split(/\s+/).length;
      expect(wordCount, `Document ${doc} must have at least 300 words (has ${wordCount})`).toBeGreaterThanOrEqual(300);
    }
  });

  // E2E-T1-F30-03: Bangladesh Bank Regulatory Safety Compliance in Docs
  it('E2E-T1-F30-03: Bangladesh Bank Regulatory Safety Compliance in Docs', () => {
    const regNotesPath = path.join(docsDir, 'REGULATORY-NOTES.md');
    const content = fs.readFileSync(regNotesPath, 'utf8');

    expect(content).toContain('Bangladesh Bank');
    expect(content).toContain('Software Orchestration');
    expect(content).toContain('NO CUSTODY OF FUNDS');
  });

  // E2E-T1-F30-04: Environment Variables Completeness in docs/ENVIRONMENT.md
  it('E2E-T1-F30-04: Environment Variables Completeness in docs/ENVIRONMENT.md', () => {
    const envDocPath = path.join(docsDir, 'ENVIRONMENT.md');
    const content = fs.readFileSync(envDocPath, 'utf8');

    expect(content).toContain('DATABASE_URL');
    expect(content).toContain('NEXTAUTH_SECRET');
    expect(content).toContain('BKASH');
  });

  // E2E-T1-F30-05: Threat Model STRIDE Methodology Compliance
  it('E2E-T1-F30-05: Threat Model STRIDE Methodology Compliance', () => {
    const threatModelPath = path.join(docsDir, 'THREAT-MODEL.md');
    const content = fs.readFileSync(threatModelPath, 'utf8');

    expect(content).toContain('STRIDE');
    expect(content).toContain('Spoofing');
    expect(content).toContain('Tampering');
  });
});
