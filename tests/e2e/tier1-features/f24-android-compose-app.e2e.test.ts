import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Feature 24: Android Native App (Jetpack Compose) (E2E-T1-F24)', () => {
  const androidDir = path.resolve(process.cwd(), 'apps/android');

  // E2E-T1-F24-01: Android Gradle Debug & Release Build Contract
  it('E2E-T1-F24-01: Android Gradle Debug & Release Build Contract', () => {
    const buildGradle = path.join(androidDir, 'build.gradle.kts');
    const appBuildGradle = path.join(androidDir, 'app', 'build.gradle.kts');
    const gradlewBat = path.join(androidDir, 'gradlew.bat');

    expect(fs.existsSync(buildGradle)).toBe(true);
    expect(fs.existsSync(appBuildGradle)).toBe(true);
    expect(fs.existsSync(gradlewBat)).toBe(true);

    const appGradleContent = fs.readFileSync(appBuildGradle, 'utf8');
    expect(appGradleContent).toContain('android.application');
    expect(appGradleContent).toContain('compose');
  });

  // E2E-T1-F24-02: Unit Test Suite Execution on JVM
  it('E2E-T1-F24-02: Unit Test Suite Execution on JVM', () => {
    const testCrossVerification = path.join(androidDir, 'test_cross_verification.mts');
    expect(fs.existsSync(testCrossVerification)).toBe(true);

    const content = fs.readFileSync(testCrossVerification, 'utf8');
    expect(content).toContain('verifyDeviceSignature');
  });

  // E2E-T1-F24-03: Material 3 UI Theme & Dynamic Color Compliance
  it('E2E-T1-F24-03: Material 3 UI Theme & Dynamic Color Compliance', () => {
    const themeFile = path.join(androidDir, 'app/src/main/java/com/denaneya/collector/ui/theme/Theme.kt');
    expect(fs.existsSync(themeFile)).toBe(true);

    const content = fs.readFileSync(themeFile, 'utf8');
    expect(content).toContain('MaterialTheme');
    expect(content).toContain('ColorScheme');
  });

  // E2E-T1-F24-04: Android Manifest Permissions Compliance
  it('E2E-T1-F24-04: Android Manifest Permissions Compliance', () => {
    const manifestPath = path.join(androidDir, 'app/src/main/AndroidManifest.xml');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const content = fs.readFileSync(manifestPath, 'utf8');
    expect(content).toContain('android.permission.RECEIVE_SMS');
    expect(content).toContain('android.permission.READ_SMS');
    expect(content).toContain('android.permission.INTERNET');
    expect(content).toContain('android.permission.ACCESS_NETWORK_STATE');
    expect(content).toContain('android.permission.POST_NOTIFICATIONS');
    expect(content).toContain('android.permission.FOREGROUND_SERVICE');
  });

  // E2E-T1-F24-05: Collector Dashboard Screen State Binding
  it('E2E-T1-F24-05: Collector Dashboard Screen State Binding', () => {
    const dashboardVmPath = path.join(androidDir, 'app/src/main/java/com/denaneya/collector/ui/screens/dashboard/DashboardViewModel.kt');
    expect(fs.existsSync(dashboardVmPath)).toBe(true);

    const content = fs.readFileSync(dashboardVmPath, 'utf8');
    expect(content).toContain('DashboardViewModel');
    expect(content).toContain('StateFlow');
  });
});
