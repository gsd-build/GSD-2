// Shared assertion helpers for GSD test files.
//
// Usage:
//   import { createTestContext } from './test-helpers.ts';
//   const { assertEq, assertTrue, assertMatch, assertNoMatch, report } = createTestContext();

/**
 * Create an isolated set of assertion helpers with their own pass/fail counters.
 * Each test file gets its own context to avoid shared state across vitest workers.
 */
export function createTestContext() {
  let passed = 0;
  let failed = 0;

  function assertEq<T>(actual: T, expected: T, message: string): void {
    if (JSON.stringify(actual) === JSON.stringify(expected)) {
      passed++;
    } else {
      failed++;
      console.error(`  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }

  function assertTrue(condition: boolean, message: string): void {
    if (condition) {
      passed++;
    } else {
      failed++;
      console.error(`  FAIL: ${message}`);
    }
  }

  function assertMatch(value: string, pattern: RegExp, message: string): void {
    if (pattern.test(value)) {
      passed++;
    } else {
      failed++;
      console.error(`  FAIL: ${message} — "${value}" did not match ${pattern}`);
    }
  }

  function assertNoMatch(value: string, pattern: RegExp, message: string): void {
    if (!pattern.test(value)) {
      passed++;
    } else {
      failed++;
      console.error(`  FAIL: ${message} — "${value}" should not have matched ${pattern}`);
    }
  }

  function report(): void {
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
      process.exit(1);
    } else {
      console.log('All tests passed');
    }
  }

  return { assertEq, assertTrue, assertMatch, assertNoMatch, report };
}
