// Debug Logger Tests

import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  enableDebug,
  disableDebug,
  isDebugEnabled,
  getDebugLogPath,
  debugLog,
  debugTime,
  debugCount,
  debugPeak,
  writeDebugSummary,
} from '../debug-logger.ts';

function createTempGsdDir(): string {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-debug-test-'));
  mkdirSync(join(tmp, '.gsd'), { recursive: true });
  return tmp;
}

function readLogLines(logPath: string): Record<string, unknown>[] {
  const content = readFileSync(logPath, 'utf-8').trim();
  if (!content) return [];
  return content.split('\n').map(line => JSON.parse(line));
}

test('enableDebug creates log file and sets enabled', () => {
  const tmp = createTempGsdDir();
  enableDebug(tmp);

  assert.strictEqual(isDebugEnabled(), true);
  const logPath = getDebugLogPath();
  assert.ok(logPath, 'log path should be set');
  // Normalize path separators for Windows compatibility
  const normalized = logPath!.replace(/\\/g, '/');
  assert.ok(normalized.includes('.gsd/debug/debug-'), 'log path should be in .gsd/debug/');
  assert.ok(logPath!.endsWith('.log'), 'log path should end with .log');

  disableDebug();
  assert.strictEqual(isDebugEnabled(), false);
});

test('debugLog writes JSONL events', () => {
  const tmp = createTempGsdDir();
  enableDebug(tmp);

  debugLog('test-event', { foo: 'bar', num: 42 });
  debugLog('another-event');

  const logPath = getDebugLogPath()!;
  const lines = readLogLines(logPath);

  assert.strictEqual(lines.length, 2);
  assert.strictEqual(lines[0].event, 'test-event');
  assert.strictEqual((lines[0] as any).foo, 'bar');
  assert.strictEqual((lines[0] as any).num, 42);
  assert.ok(lines[0].ts, 'should have timestamp');
  assert.strictEqual(lines[1].event, 'another-event');

  disableDebug();
});

test('debugLog is no-op when disabled', () => {
  assert.strictEqual(isDebugEnabled(), false);
  // Should not throw
  debugLog('should-not-appear', { data: 'test' });
});

test('debugTime measures elapsed time', async () => {
  const tmp = createTempGsdDir();
  enableDebug(tmp);

  const stop = debugTime('timed-op');
  // Small delay to ensure measurable time
  await new Promise(r => setTimeout(r, 10));
  stop({ extra: 'data' });

  const logPath = getDebugLogPath()!;
  const lines = readLogLines(logPath);

  assert.strictEqual(lines.length, 1);
  assert.strictEqual(lines[0].event, 'timed-op');
  assert.ok((lines[0] as any).elapsed_ms >= 0, 'elapsed_ms should be non-negative');
  assert.strictEqual((lines[0] as any).extra, 'data');

  disableDebug();
});

test('debugTime returns no-op when disabled', () => {
  assert.strictEqual(isDebugEnabled(), false);
  const stop = debugTime('should-not-appear');
  stop({ data: 'test' }); // Should not throw
});

test('debugCount increments counters', () => {
  const tmp = createTempGsdDir();
  enableDebug(tmp);

  debugCount('dispatches');
  debugCount('dispatches');
  debugCount('dispatches', 3);

  // Counters are tested via writeDebugSummary
  const logPath = writeDebugSummary()!;
  const lines = readLogLines(logPath);

  const summary = lines.find(l => l.event === 'debug-summary') as any;
  assert.ok(summary, 'should have debug-summary event');
  assert.strictEqual(summary.dispatches, 5);
});

test('debugPeak tracks max values', () => {
  const tmp = createTempGsdDir();
  enableDebug(tmp);

  debugPeak('ttsrPeakBuffer', 100);
  debugPeak('ttsrPeakBuffer', 500);
  debugPeak('ttsrPeakBuffer', 200); // Should not overwrite 500

  const logPath = writeDebugSummary()!;
  const lines = readLogLines(logPath);

  const summary = lines.find(l => l.event === 'debug-summary') as any;
  assert.strictEqual(summary.ttsrPeakBuffer, 500);
});

test('writeDebugSummary includes all counters and disables debug', () => {
  const tmp = createTempGsdDir();
  enableDebug(tmp);

  debugCount('deriveStateCalls', 10);
  debugCount('deriveStateTotalMs', 80);
  debugCount('ttsrChecks', 50);
  debugCount('parseRoadmapCalls', 3);
  debugCount('dispatches', 2);

  const logPath = writeDebugSummary()!;
  assert.ok(logPath, 'should return log path');
  assert.strictEqual(isDebugEnabled(), false, 'should be disabled after summary');

  const lines = readLogLines(logPath);
  const summary = lines.find(l => l.event === 'debug-summary') as any;
  assert.ok(summary);
  assert.strictEqual(summary.deriveStateCalls, 10);
  assert.strictEqual(summary.avgDeriveState_ms, 8);
  assert.strictEqual(summary.ttsrChecks, 50);
  assert.strictEqual(summary.dispatches, 2);
  assert.ok(summary.totalElapsed_ms >= 0);
});

test('auto-prunes old debug logs', () => {
  const tmp = createTempGsdDir();
  const debugDir = join(tmp, '.gsd', 'debug');
  mkdirSync(debugDir, { recursive: true });

  // Create 6 old log files
  for (let i = 0; i < 6; i++) {
    writeFileSync(join(debugDir, `debug-2026-01-0${i + 1}.log`), 'old');
  }

  enableDebug(tmp);

  const files = readdirSync(debugDir).filter(f => f.startsWith('debug-') && f.endsWith('.log'));
  // MAX_DEBUG_LOGS is 5 — enableDebug prunes to < 5 old and then creates 1 new,
  // so the directory must hold at most 5 files in total. The previous
  // assertion (<= 6) would have passed even with one stale log left behind
  // (Refs #4831).
  assert.ok(files.length <= 5, `should have pruned old logs to <= 5, got ${files.length}`);

  disableDebug();
});

test('disableDebug returns log path', () => {
  const tmp = createTempGsdDir();
  enableDebug(tmp);

  const logPath = getDebugLogPath();
  const returned = disableDebug();
  assert.strictEqual(returned, logPath);
  assert.strictEqual(getDebugLogPath(), null);
});
