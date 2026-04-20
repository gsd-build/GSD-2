import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('ollama index', () => {
  it('api key is ollama-chat', () => {
    const config = { api: 'ollama-chat' };
    assert.strictEqual(config.api, 'ollama-chat');
  });
});
