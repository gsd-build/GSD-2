# Answer Injection

Pre-supply answers to eliminate interactive prompts during headless execution.

## CLI Usage

```bash
gsd headless --answers answers.json auto
gsd headless --answers answers.json new-milestone --context spec.md --auto
```

The `--answers` flag takes a path to a JSON file containing pre-supplied answers and secrets.

## Answer File Schema

```json
{
  "questions": {
    "question_id": "selected_option_label",
    "multi_select_question": ["option_a", "option_b"]
  },
  "secrets": {
    "API_KEY": "sk-...",
    "DATABASE_URL": "postgres://..."
  },
  "defaults": {
    "strategy": "first_option"
  }
}
```

### Fields

- **questions**: Map question ID → answer. String for single-select, string[] for multi-select.
- **secrets**: Map env var name → value. Injected as environment variables into the RPC child process. The child's `checkExistingEnvKeys()` detects them in `process.env` and marks them as "already set" — no interactive prompt needed.
- **defaults.strategy**: Fallback for unmatched questions.
  - `"first_option"` — auto-select first available option (default)
  - `"cancel"` — cancel the request

## Secrets Mechanism

Secrets are injected via the `RpcClient` `env` option, which merges them into the child process's `process.env`. This means:

1. The headless orchestrator reads the answer file
2. Secret values are passed as `env` to `RpcClient`
3. The child process spawns with these env vars set
4. When `secure_env_collect` runs, `checkExistingEnvKeys()` finds the keys already in `process.env`
5. The tool skips the interactive prompt and reports the keys as "already configured"

Secrets are never logged or included in event streams.

## How It Works

Two-phase correlation:
1. **Observe** `tool_execution_start` events for `ask_user_questions` — extracts question metadata (ID, options, allowMultiple)
2. **Match** subsequent `extension_ui_request` events to metadata, respond with pre-supplied answer

Handles out-of-order events (extension_ui_request can arrive before tool_execution_start in RPC mode) via deferred processing queue with 500ms timeout.

## Coexistence with --supervised

Both `--answers` and `--supervised` can be active simultaneously. Priority order:
1. Answer injector tries first
2. If no answer found, supervised mode takes over
3. If no orchestrator response, auto-responder kicks in after timeout

## Without Answer Injection

Headless mode has built-in auto-responders:
- **select** → picks first option
- **confirm** → auto-confirms
- **input** → empty string
- **editor** → returns prefill or empty

Answer injection overrides these defaults with specific answers when precision matters.

## Diagnostics

The injector tracks stats printed in the summary:
- `questionsAnswered` / `questionsDefaulted`
- `secretsProvided`

Unused question IDs and secret keys are warned about at the end.
