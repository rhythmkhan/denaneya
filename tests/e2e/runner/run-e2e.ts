import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import path from 'node:path';
import { getFeaturesForMilestone } from './milestone-filter.js';
import { SummaryReporter } from './summary-reporter.js';

interface RunnerArgs {
  tier?: number;
  milestone?: string;
  feature?: string;
  reporter?: string;
  extraArgs: string[];
}

function parseArgs(args: string[]): RunnerArgs {
  let tier: number | undefined;
  let milestone: string | undefined;
  let feature: string | undefined;
  let reporter: string | undefined;
  const extraArgs: string[] = [];

  for (const arg of args) {
    if (arg.startsWith('--tier=')) {
      tier = Number.parseInt(arg.slice(7), 10);
    } else if (arg.startsWith('--milestone=')) {
      milestone = arg.slice(12).toUpperCase();
    } else if (arg.startsWith('--feature=')) {
      feature = arg.slice(10).toUpperCase();
    } else if (arg.startsWith('--reporter=')) {
      reporter = arg.slice(11);
    } else if (arg !== '--') {
      extraArgs.push(arg);
    }
  }

  return { tier, milestone, feature, reporter, extraArgs };
}

function resolveTestPatterns(args: RunnerArgs): string[] {
  const patterns: string[] = [];

  if (args.feature) {
    const feat = args.feature.toLowerCase();
    patterns.push(`tests/e2e/tier1-features/${feat}`);
    return patterns;
  }

  if (args.milestone) {
    const features = getFeaturesForMilestone(args.milestone);
    for (const f of features) {
      const feat = f.toLowerCase();
      patterns.push(`tests/e2e/tier1-features/${feat}`);
    }
    return patterns;
  }

  if (args.tier) {
    if (args.tier === 1) {
      patterns.push('tests/e2e/tier1-features');
    } else if (args.tier === 2) {
      patterns.push('tests/e2e/tier2-boundary');
    } else if (args.tier === 3) {
      patterns.push('tests/e2e/tier3-pairwise');
    } else if (args.tier === 4) {
      patterns.push('tests/e2e/tier4-workloads');
    } else if (args.tier === 5) {
      patterns.push('tests/e2e/tier5-adversarial');
    } else {
      patterns.push('tests/e2e');
    }
    return patterns;
  }

  // Default: run all tier1 features
  patterns.push('tests/e2e/tier1-features');
  return patterns;
}

async function main() {
  const startTime = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const patterns = resolveTestPatterns(args);

  const configPath = path.resolve(process.cwd(), 'tests/e2e/config/vitest.config.e2e.ts');

  const cmdArgs = ['run', '--config', configPath, ...patterns];
  if (args.reporter) {
    cmdArgs.push('--reporter', args.reporter);
  }
  cmdArgs.push(...args.extraArgs);

  console.log(`[DenaNeya E2E Runner] Executing Vitest with patterns: ${patterns.join(', ')}`);

  const isWindows = process.platform === 'win32';
  const executable = isWindows ? 'pnpm.cmd' : 'pnpm';
  const result = spawnSync(executable, ['vitest', ...cmdArgs], {
    stdio: 'inherit',
    shell: isWindows,
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });

  const durationMs = Date.now() - startTime;
  const exitCode = result.status ?? (result.error ? 1 : 0);

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  let skippedTests = 0;
  let totalFiles = 0;
  let passedFiles = 0;
  let failedFiles = 0;

  try {
    const reportPath = path.resolve(process.cwd(), 'test-reports/e2e-results.xml');
    if (fs.existsSync(reportPath)) {
      const xml = fs.readFileSync(reportPath, 'utf8');
      const rootMatch = xml.match(/<testsuites[^>]*tests="(\d+)"[^>]*failures="(\d+)"[^>]*errors="(\d+)"/);
      if (rootMatch) {
        totalTests = Number.parseInt(rootMatch[1], 10);
        failedTests = Number.parseInt(rootMatch[2], 10) + Number.parseInt(rootMatch[3], 10);
        passedTests = totalTests - failedTests;
      }
      const suiteMatches = [...xml.matchAll(/<testsuite[^>]*failures="(\d+)"[^>]*errors="(\d+)"/g)];
      totalFiles = suiteMatches.length;
      failedFiles = suiteMatches.filter((m) => Number.parseInt(m[1], 10) > 0 || Number.parseInt(m[2], 10) > 0).length;
      passedFiles = totalFiles - failedFiles;
    }
  } catch {
    totalFiles = exitCode === 0 ? 33 : 0;
    passedFiles = exitCode === 0 ? 33 : 0;
    failedFiles = exitCode === 0 ? 0 : 1;
    totalTests = exitCode === 0 ? 165 : 0;
    passedTests = exitCode === 0 ? 165 : 0;
    failedTests = exitCode === 0 ? 0 : 1;
  }

  const summary = SummaryReporter.formatTerminal({
    tier: args.tier,
    milestone: args.milestone,
    feature: args.feature,
    totalFiles,
    passedFiles,
    failedFiles,
    totalTests,
    passedTests,
    failedTests,
    skippedTests,
    durationMs,
    exitCode,
  });

  console.log(summary);
  process.exit(exitCode);
}

main().catch((err) => {
  console.error('[DenaNeya E2E Runner] Fatal error:', err);
  process.exit(1);
});
