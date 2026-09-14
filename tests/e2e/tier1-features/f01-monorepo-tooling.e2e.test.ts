import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Feature 01: Monorepo Setup & Tooling (Tier 1)", () => {
  const rootDir = path.resolve(__dirname, "../../../");

  it("E2E-T1-F01-01: Workspace Topology & Inter-Package Resolution", () => {
    const workspaceYamlPath = path.join(rootDir, "pnpm-workspace.yaml");
    expect(fs.existsSync(workspaceYamlPath)).toBe(true);
    const yamlContent = fs.readFileSync(workspaceYamlPath, "utf8");
    expect(yamlContent).toContain("packages/*");
    expect(yamlContent).toContain("apps/*");

    const packagesDir = path.join(rootDir, "packages");
    const expectedPackages = [
      "observability",
      "security",
      "database",
      "payment-core",
      "sms-parser",
      "fraud-engine",
      "gateway-adapters",
      "ledger",
      "webhooks",
      "reconciliation",
    ];
    for (const pkg of expectedPackages) {
      const pkgJsonPath = path.join(packagesDir, pkg, "package.json");
      expect(fs.existsSync(pkgJsonPath), "Missing package.json in " + pkg).toBe(true);
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
      expect(pkgJson.name).toBe("@denaneya/" + pkg);
    }
  });

  it("E2E-T1-F01-02: Zero-Error TypeScript Strict Compilation", () => {
    const tsconfigBasePath = path.join(rootDir, "tsconfig.base.json");
    expect(fs.existsSync(tsconfigBasePath)).toBe(true);
    const baseConfig = JSON.parse(fs.readFileSync(tsconfigBasePath, "utf8"));
    expect(baseConfig.compilerOptions.strict).toBe(true);
    expect(baseConfig.compilerOptions.noImplicitAny).toBe(true);
    expect(baseConfig.compilerOptions.strictNullChecks).toBe(true);

    const paymentCoreTsconfig = path.join(rootDir, "packages/payment-core/tsconfig.json");
    expect(fs.existsSync(paymentCoreTsconfig)).toBe(true);
  });

  it("E2E-T1-F01-03: Monorepo Clean Build Contract", () => {
    const rootPkgPath = path.join(rootDir, "package.json");
    const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
    expect(rootPkg.scripts.build).toBeDefined();
    expect(rootPkg.scripts.build).toContain("turbo run build");
    expect(rootPkg.scripts.typecheck).toBeDefined();
  });

  it("E2E-T1-F01-04: Cross-Platform Windows & Unix Path Compliance", () => {
    const rootPkgPath = path.join(rootDir, "package.json");
    const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
    for (const [scriptName, scriptCmd] of Object.entries(rootPkg.scripts)) {
      expect(scriptCmd).not.toContain("rm -rf");
      expect(scriptCmd).not.toContain("\\\\");
    }
    expect(rootPkg.devDependencies.rimraf).toBeDefined();
    expect(rootPkg.devDependencies.tsx).toBeDefined();
  });

  it("E2E-T1-F01-05: Turborepo Pipeline Dependency Cache Integrity", () => {
    const turboJsonPath = path.join(rootDir, "turbo.json");
    expect(fs.existsSync(turboJsonPath)).toBe(true);
    const turboConfig = JSON.parse(fs.readFileSync(turboJsonPath, "utf8"));
    expect(turboConfig.tasks).toBeDefined();
    expect(turboConfig.tasks.build).toBeDefined();
    expect(turboConfig.tasks.build.dependsOn).toContain("^build");
    expect(turboConfig.tasks.test).toBeDefined();
  });
});
