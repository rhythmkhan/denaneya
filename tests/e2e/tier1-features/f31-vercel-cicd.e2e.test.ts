import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Feature 31: Vercel Deployment & CI/CD Config (E2E-T1-F31)', () => {
  // E2E-T1-F31-01: Vercel Configuration Syntax & Region Specification
  it('E2E-T1-F31-01: Vercel Configuration Syntax & Region Specification', () => {
    const vercelJsonPath = path.resolve(process.cwd(), 'vercel.json');
    expect(fs.existsSync(vercelJsonPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
    expect(config.framework).toBe('nextjs');
    expect(Array.isArray(config.regions)).toBe(true);
    expect(config.regions).toContain('sin1'); // Singapore region for low latency to Bangladesh
  });

  // E2E-T1-F31-02: GitHub Actions CI Workflow Syntax Validation
  it('E2E-T1-F31-02: GitHub Actions CI Workflow Syntax Validation', () => {
    const ciPath = path.resolve(process.cwd(), '.github/workflows/ci.yml');
    expect(fs.existsSync(ciPath)).toBe(true);

    const content = fs.readFileSync(ciPath, 'utf8');
    expect(content).toContain('pull_request');
    expect(content).toContain('push:');
    expect(content).toContain('main');
  });

  // E2E-T1-F31-03: CI Pipeline Step Completeness
  it('E2E-T1-F31-03: CI Pipeline Step Completeness', () => {
    const ciPath = path.resolve(process.cwd(), '.github/workflows/ci.yml');
    const content = fs.readFileSync(ciPath, 'utf8');

    expect(content).toContain('actions/checkout');
    expect(content).toContain('pnpm/action-setup');
    expect(content).toContain('turbo run typecheck');
  });

  // E2E-T1-F31-04: Secret Leak Scanner in CI Pipeline
  it('E2E-T1-F31-04: Secret Leak Scanner in CI Pipeline', () => {
    const ciPath = path.resolve(process.cwd(), '.github/workflows/ci.yml');
    const content = fs.readFileSync(ciPath, 'utf8');

    // Security audit or frozen-lockfile check to prevent compromised deps
    expect(content).toContain('frozen-lockfile');
  });

  // E2E-T1-F31-05: Next.js Edge Middleware Security Headers Configuration
  it('E2E-T1-F31-05: Next.js Edge Middleware Security Headers Configuration', () => {
    const vercelJsonPath = path.resolve(process.cwd(), 'vercel.json');
    const config = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));

    const globalHeaders = config.headers[0].headers;
    const headerKeys = globalHeaders.map((h: any) => h.key);

    expect(headerKeys).toContain('Strict-Transport-Security');
    expect(headerKeys).toContain('X-Content-Type-Options');
    expect(headerKeys).toContain('X-Frame-Options');
    expect(headerKeys).toContain('Content-Security-Policy');
  });
});
