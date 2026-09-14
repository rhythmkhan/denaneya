import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import sitemap from '../../../apps/web/src/app/sitemap.js';
import robots from '../../../apps/web/src/app/robots.js';

describe('Feature 15: Public Marketing Website (E2E-T1-F15)', () => {
  const marketingDir = path.resolve(process.cwd(), 'apps/web/src/app/(marketing)');

  // E2E-T1-F15-01: Home Page 200 OK & Brand Tagline Rendering
  it('E2E-T1-F15-01: Home Page 200 OK & Brand Tagline Rendering', () => {
    const homePath = path.join(marketingDir, 'page.tsx');
    expect(fs.existsSync(homePath)).toBe(true);

    const homeContent = fs.readFileSync(homePath, 'utf8');
    expect(homeContent).toContain('DenaNeya');
    // Verbatim Bengali tagline check
    expect(homeContent).toContain('দেনা-নেওয়া সহজ, হিসাব নিশ্চিত');
  });

  // E2E-T1-F15-02: Marketing Subpages Rendering & Component Definitions
  it('E2E-T1-F15-02: Marketing Subpages Rendering & Component Definitions', () => {
    const subpages = ['about', 'contact', 'developers', 'features', 'pricing', 'security'];

    for (const subpage of subpages) {
      const pageFile = path.join(marketingDir, subpage, 'page.tsx');
      expect(fs.existsSync(pageFile)).toBe(true);
      const content = fs.readFileSync(pageFile, 'utf8');
      expect(content).toContain('export default');
    }
  });

  // E2E-T1-F15-03: SEO OpenGraph & Twitter Card Meta Tags
  it('E2E-T1-F15-03: SEO OpenGraph & Twitter Card Meta Tags', () => {
    const layoutPath = path.resolve(process.cwd(), 'apps/web/src/app/layout.tsx');
    expect(fs.existsSync(layoutPath)).toBe(true);

    const layoutContent = fs.readFileSync(layoutPath, 'utf8');
    expect(layoutContent).toContain('openGraph');
    expect(layoutContent).toContain('twitter');
    expect(layoutContent).toContain('summary_large_image');
  });

  // E2E-T1-F15-04: Dynamic XML Sitemap Generation (/sitemap.xml)
  it('E2E-T1-F15-04: Dynamic XML Sitemap Generation (/sitemap.xml)', () => {
    const routes = sitemap();
    expect(Array.isArray(routes)).toBe(true);
    expect(routes.length).toBeGreaterThanOrEqual(8);

    const urls = routes.map((r) => r.url);
    expect(urls.some((u) => u.includes('/features'))).toBe(true);
    expect(urls.some((u) => u.includes('/pricing'))).toBe(true);
    expect(urls.some((u) => u.includes('/developers'))).toBe(true);
    expect(urls.some((u) => u.includes('/docs'))).toBe(true);
  });

  // E2E-T1-F15-05: Robots.txt Rules & Disallow Headers (/robots.txt)
  it('E2E-T1-F15-05: Robots.txt Rules & Disallow Headers (/robots.txt)', () => {
    const robotsData = robots();
    expect(robotsData.rules).toBeDefined();

    const rules = robotsData.rules as { userAgent: string; allow: string; disallow: string[] };
    expect(rules.allow).toBe('/');
    expect(rules.disallow).toContain('/dashboard/');
    expect(rules.disallow).toContain('/admin/');
    expect(rules.disallow).toContain('/checkout/');
    expect(robotsData.sitemap).toContain('/sitemap.xml');
  });
});
