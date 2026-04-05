import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeUnitRuntimeRecord, readUnitRuntimeRecord } from '../unit-runtime.ts';
import { resolveAutoSupervisorConfig } from '../preferences.ts';
import { startUnitSupervision } from '../auto-timers.ts';

function isolatePreferences(t, preferenceBlock = '') {
  const base = mkdtempSync(join(tmpdir(), 'gsd-auto-supervisor-'));
  const fakeHome = mkdtempSync(join(tmpdir(), 'gsd-auto-supervisor-home-'));
  mkdirSync(join(base, '.gsd'), { recursive: true });
  if (preferenceBlock) {
    writeFileSync(join(base, '.gsd', 'PREFERENCES.md'), `---\nversion: 1\n${preferenceBlock}\n---\n`, 'utf8');
  }

  const savedCwd = process.cwd();
  const savedGsdHome = process.env.GSD_HOME;
  process.chdir(base);
  process.env.GSD_HOME = fakeHome;

  t.after(() => {
    process.chdir(savedCwd);
    if (savedGsdHome === undefined) delete process.env.GSD_HOME;
    else process.env.GSD_HOME = savedGsdHome;
    rmSync(base, { recursive: true, force: true });
    rmSync(fakeHome, { recursive: true, force: true });
  });

  return base;
}

function makeSupervisionContext(base) {
  const s = {
    active: true,
    basePath: base,
    verbose: false,
    currentMilestoneId: null,
    currentUnit: {
      type: 'task',
      id: 'T01',
      startedAt: Date.now(),
    },
    cmdCtx: {
      getContextUsage: () => null,
    },
    continueHereHandle: null,
    wrapupWarningHandle: null,
    idleWatchdogHandle: null,
    unitTimeoutHandle: null,
  };

  const ctx = {
    ui: {
      notify: () => {},
    },
    modelRegistry: {
      getAll: () => [],
    },
    model: {
      contextWindow: 128_000,
    },
  };

  const pi = {
    sendMessage: () => {},
  };

  return {
    s,
    sctx: {
      s,
      ctx,
      pi,
      unitType: 'task',
      unitId: 'T01',
      prefs: undefined,
      buildSnapshotOpts: () => ({}),
      buildRecoveryContext: () => ({}),
      pauseAuto: async () => {},
      taskEstimate: '10m',
    },
  };
}

function clearSupervisionHandles(s) {
  if (s.wrapupWarningHandle) clearTimeout(s.wrapupWarningHandle);
  if (s.idleWatchdogHandle) clearInterval(s.idleWatchdogHandle);
  if (s.unitTimeoutHandle) clearTimeout(s.unitTimeoutHandle);
  if (s.continueHereHandle) clearInterval(s.continueHereHandle);
}

test('resolveAutoSupervisorConfig provides safe timeout defaults', (t) => {
  isolatePreferences(t);

  const supervisor = resolveAutoSupervisorConfig();
  assert.equal(supervisor.soft_timeout_minutes, 20);
  assert.equal(supervisor.idle_timeout_minutes, 10);
  assert.equal(supervisor.hard_timeout_minutes, 30);
  assert.equal(supervisor.disable_context_pressure_wrapup, false);
});

test('resolveAutoSupervisorConfig honors disable_context_pressure_wrapup from project preferences', (t) => {
  isolatePreferences(t, 'auto_supervisor:\n  disable_context_pressure_wrapup: true');

  const supervisor = resolveAutoSupervisorConfig();
  assert.equal(supervisor.disable_context_pressure_wrapup, true);
  assert.equal(supervisor.soft_timeout_minutes, 20);
  assert.equal(supervisor.idle_timeout_minutes, 10);
  assert.equal(supervisor.hard_timeout_minutes, 30);
});

test('startUnitSupervision keeps continue-here enabled by default', (t) => {
  const base = isolatePreferences(t);
  const { s, sctx } = makeSupervisionContext(base);
  t.after(() => clearSupervisionHandles(s));

  startUnitSupervision(sctx);

  assert.notEqual(s.wrapupWarningHandle, null, 'soft timeout handle should be set');
  assert.notEqual(s.idleWatchdogHandle, null, 'idle watchdog handle should be set');
  assert.notEqual(s.unitTimeoutHandle, null, 'hard timeout handle should be set');
  assert.notEqual(s.continueHereHandle, null, 'continue-here monitor should be enabled by default');
});

test('startUnitSupervision disables only continue-here when opt-out is enabled', (t) => {
  const base = isolatePreferences(t, 'auto_supervisor:\n  disable_context_pressure_wrapup: true');
  const { s, sctx } = makeSupervisionContext(base);
  t.after(() => clearSupervisionHandles(s));

  startUnitSupervision(sctx);

  assert.notEqual(s.wrapupWarningHandle, null, 'soft timeout handle should still be set');
  assert.notEqual(s.idleWatchdogHandle, null, 'idle watchdog handle should still be set');
  assert.notEqual(s.unitTimeoutHandle, null, 'hard timeout handle should still be set');
  assert.equal(s.continueHereHandle, null, 'continue-here monitor should be disabled by opt-out');
});

test('writeUnitRuntimeRecord persists progress and recovery metadata defaults', () => {
  const base = mkdtempSync(join(tmpdir(), 'gsd-auto-supervisor-'));
  const startedAt = 1234567890;

  writeUnitRuntimeRecord(base, 'plan-milestone', 'M010', startedAt, {
    phase: 'dispatched',
    lastProgressAt: startedAt,
    progressCount: 1,
    lastProgressKind: 'dispatch',
  });

  const runtime = readUnitRuntimeRecord(base, 'plan-milestone', 'M010');
  assert.ok(runtime);
  assert.equal(runtime.phase, 'dispatched');
  assert.equal(runtime.lastProgressAt, startedAt);
  assert.equal(runtime.progressCount, 1);
  assert.equal(runtime.lastProgressKind, 'dispatch');
  assert.equal(runtime.recoveryAttempts, 0);

  rmSync(base, { recursive: true, force: true });
});

test('writeUnitRuntimeRecord keeps explicit recovery attempt fields', () => {
  const base = mkdtempSync(join(tmpdir(), 'gsd-auto-supervisor-'));
  const startedAt = 2234567890;

  writeUnitRuntimeRecord(base, 'research-milestone', 'M011', startedAt, {
    phase: 'timeout',
    recoveryAttempts: 2,
    lastRecoveryReason: 'idle',
    lastProgressAt: startedAt + 50,
    progressCount: 3,
    lastProgressKind: 'recovery-retry',
  });

  const runtime = JSON.parse(readFileSync(join(base, '.gsd/runtime/units/research-milestone-M011.json'), 'utf8'));
  assert.equal(runtime.recoveryAttempts, 2);
  assert.equal(runtime.lastRecoveryReason, 'idle');
  assert.equal(runtime.lastProgressKind, 'recovery-retry');

  rmSync(base, { recursive: true, force: true });
});
