export interface TestExecutionSummary {
  tier?: number;
  milestone?: string;
  feature?: string;
  totalFiles: number;
  passedFiles: number;
  failedFiles: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  durationMs: number;
  exitCode: number;
}

export class SummaryReporter {
  public static formatTerminal(summary: TestExecutionSummary): string {
    const lines: string[] = [];
    lines.push('');
    lines.push('=================================================================');
    lines.push('           DenaNeya E2E Test Suite Execution Summary            ');
    lines.push('=================================================================');
    if (summary.tier) lines.push(`Tier:       Tier ${summary.tier}`);
    if (summary.milestone) lines.push(`Milestone:  ${summary.milestone}`);
    if (summary.feature) lines.push(`Feature:    ${summary.feature}`);
    lines.push(`Test Files: ${summary.passedFiles} passed, ${summary.failedFiles} failed, ${summary.totalFiles} total`);
    lines.push(`Tests:      ${summary.passedTests} passed, ${summary.failedTests} failed, ${summary.skippedTests} skipped, ${summary.totalTests} total`);
    lines.push(`Duration:   ${(summary.durationMs / 1000).toFixed(2)}s`);
    lines.push(`Exit Code:  ${summary.exitCode} (${summary.exitCode === 0 ? 'SUCCESS' : 'FAILURE'})`);
    lines.push('=================================================================');
    lines.push('');
    return lines.join('\n');
  }

  public static formatJson(summary: TestExecutionSummary): string {
    return JSON.stringify(summary, null, 2);
  }
}
