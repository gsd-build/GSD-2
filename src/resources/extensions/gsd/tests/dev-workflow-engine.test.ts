import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { bridgeDispatchAction } from '../dev-workflow-engine.ts';
import type { DispatchAction } from '../auto-dispatch.ts';

// ═══════════════════════════════════════════════════════════════════════════
// bridgeDispatchAction: maps GSD DispatchAction → EngineDispatchAction
// ═══════════════════════════════════════════════════════════════════════════

describe('bridgeDispatchAction', () => {
  test('maps "dispatch" action correctly', () => {
    const da: DispatchAction = {
      action: 'dispatch',
      unitType: 'execute-task',
      unitId: 'M001/S01/T01',
      prompt: 'do it',
      matchedRule: 'rule',
    };
    const result = bridgeDispatchAction(da);
    assert.equal(result.action, 'dispatch');
    assert.deepEqual((result as any).step, {
      unitType: 'execute-task',
      unitId: 'M001/S01/T01',
      prompt: 'do it',
    });
  });

  test('maps "stop" action correctly', () => {
    const da: DispatchAction = { action: 'stop', reason: 'done', level: 'info' };
    const result = bridgeDispatchAction(da);
    assert.equal(result.action, 'stop');
    assert.equal((result as any).reason, 'done');
    assert.equal((result as any).level, 'info');
  });

  test('maps "skip" action correctly', () => {
    const da: DispatchAction = { action: 'skip' };
    const result = bridgeDispatchAction(da);
    assert.equal(result.action, 'skip');
  });

  test('throws on unknown action', () => {
    assert.throws(
      () => bridgeDispatchAction({ action: 'unknown-future-action' } as any),
      /Unhandled dispatch action/,
    );
  });
});
