# Answer Injection

Pre-supply answers to eliminate interactive prompts during headless execution.

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
- **secrets**: Map env var name → value. Used for `secure_env_collect` tool calls. Values are never logged.
- **defaults.strategy**: Fallback for unmatched questions.
  - `"first_option"` — auto-select first available option
  - `"cancel"` — cancel the request

## How It Works

Two-phase correlation:
1. **Observe** `tool_execution_start` events for `ask_user_questions` — extracts question metadata (ID, options, allowMultiple)
2. **Match** subsequent `extension_ui_request` events to metadata, respond with pre-supplied answer

Handles out-of-order events (extension_ui_request can arrive before tool_execution_start in RPC mode) via deferred processing queue.

## Without Answer Injection

Headless mode has built-in auto-responders:
- **select** → picks first option
- **confirm** → auto-confirms
- **input** → empty string
- **editor** → returns prefill or empty

Answer injection overrides these defaults with specific answers when precision matters.

## Diagnostics

The injector tracks stats:
- `questionsAnswered` / `questionsDefaulted`
- `secretsProvided` / `secretsMissing`
- `fireAndForgetConsumed` / `confirmationsHandled`
