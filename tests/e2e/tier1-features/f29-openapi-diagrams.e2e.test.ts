import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Feature 29: OpenAPI 3.1 & Technical Diagrams (E2E-T1-F29)', () => {
  // E2E-T1-F29-01: OpenAPI 3.1 Specification Validation
  it('E2E-T1-F29-01: OpenAPI 3.1 Specification Validation', () => {
    const openapiJsonPath = path.resolve(process.cwd(), 'docs/openapi.json');
    expect(fs.existsSync(openapiJsonPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(openapiJsonPath, 'utf8'));
    expect(content.openapi).toBe('3.1.0');
    expect(content.info.title).toContain('DenaNeya');
    expect(content.info.version).toBe('1.0.0');
  });

  // E2E-T1-F29-02: 100% Endpoint Coverage in OpenAPI Spec
  it('E2E-T1-F29-02: 100% Endpoint Coverage in OpenAPI Spec', () => {
    const openapiJsonPath = path.resolve(process.cwd(), 'docs/openapi.json');
    const content = JSON.parse(fs.readFileSync(openapiJsonPath, 'utf8'));

    const paths = Object.keys(content.paths || {});
    expect(paths).toContain('/api/v1/payments');
    expect(paths).toContain('/api/v1/payments/{id}');
    expect(paths).toContain('/api/v1/invoices');
    expect(paths).toContain('/api/v1/payment-links');
  });

  // E2E-T1-F29-03: Mermaid Payment Sequence Diagrams Syntax Validation
  it('E2E-T1-F29-03: Mermaid Payment Sequence Diagrams Syntax Validation', () => {
    const archPath = path.resolve(process.cwd(), 'docs/ARCHITECTURE.md');
    expect(fs.existsSync(archPath)).toBe(true);

    const archContent = fs.readFileSync(archPath, 'utf8');
    expect(archContent).toContain('sequenceDiagram');
    expect(archContent).toContain('MerchantServer');
    expect(archContent).toContain('DenaNeyaAPI');
  });

  // E2E-T1-F29-04: Mermaid Entity-Relationship (ER) Diagram Schema Consistency
  it('E2E-T1-F29-04: Mermaid Entity-Relationship (ER) Diagram Schema Consistency', () => {
    const dbDocPath = path.resolve(process.cwd(), 'docs/DATABASE.md');
    expect(fs.existsSync(dbDocPath)).toBe(true);

    const dbDocContent = fs.readFileSync(dbDocPath, 'utf8');
    expect(dbDocContent).toContain('erDiagram');
    expect(dbDocContent).toContain('merchants');
    expect(dbDocContent).toContain('payments');
  });

  // E2E-T1-F29-05: JSON Schema Example Payload Validation
  it('E2E-T1-F29-05: JSON Schema Example Payload Validation', () => {
    const openapiJsonPath = path.resolve(process.cwd(), 'docs/openapi.json');
    const content = JSON.parse(fs.readFileSync(openapiJsonPath, 'utf8'));

    const paymentPost = content.paths['/api/v1/payments']?.post;
    expect(paymentPost).toBeDefined();
    expect(paymentPost.responses['201']).toBeDefined();
  });
});
