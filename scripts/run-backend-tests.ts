import { runPlatformTestSuiteAsync } from '@/lib/testing/suite';

async function main() {
  console.log('\n======================================================');
  console.log('  AGUKA AI — BACKEND FOUNDATION AUTOMATED TEST SUITE');
  console.log('======================================================\n');

  const startTime = Date.now();
  const suite = await runPlatformTestSuiteAsync();

  for (const test of suite.results) {
    const symbol = test.passed ? '✓' : '✗';
    const status = test.passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(` ${symbol} [${status}] ${test.category} ➔ ${test.name} (${test.durationMs}ms)`);
    if (!test.passed) {
      console.log(`     Expected: ${test.expected}`);
      console.log(`     Actual:   ${test.actual}`);
    }
  }

  const duration = Date.now() - startTime;
  console.log('\n------------------------------------------------------');
  console.log(`Total: ${suite.total} | Passed: ${suite.passedCount} | Failed: ${suite.failedCount} | Duration: ${duration}ms`);
  console.log('------------------------------------------------------\n');

  if (!suite.allPassed) {
    console.error('Test suite failed!');
    process.exit(1);
  } else {
    console.log('\x1b[32mAll backend foundation tests PASSED successfully!\x1b[0m\n');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
