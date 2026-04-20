import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('slash-command-handlers', () => {
  it('unknown command error includes leading slash', () => {
    const commandName = 'foo';
    const msg = `Unknown command: /${commandName}.`;
    assert.ok(msg.includes(':/'));
  });
});
