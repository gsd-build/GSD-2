<overview>
Remote execution via pluggable operations, spawnHook for bash, and tool override patterns.
</overview>

<pluggable_operations>
Built-in tools support pluggable operations for SSH, containers, etc.:

```typescript
import { createReadTool, createBashTool, createWriteTool } from "@mariozechner/pi-coding-agent";

// Create tool with custom remote operations
const remoteBash = createBashTool(cwd, {
  operations: {
    execute: (cmd) => sshExec(remote, cmd),
  },
});
```

**Operations interfaces:** `ReadOperations`, `WriteOperations`, `EditOperations`, `BashOperations`, `LsOperations`, `GrepOperations`, `FindOperations`
</pluggable_operations>

<spawn_hook>
The bash tool supports a `spawnHook` to modify commands before execution:

```typescript
const bashTool = createBashTool(cwd, {
  spawnHook: ({ command, cwd, env }) => ({
    command: `source ~/.profile\n${command}`,
    cwd: `/mnt/sandbox${cwd}`,
    env: { ...env, CI: "1" },
  }),
});
```
</spawn_hook>

<ssh_pattern>
Full SSH pattern with flag-based switching:

```typescript
import { createBashTool, type ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerFlag("ssh", { description: "SSH target", type: "string" });

  const localBash = createBashTool(process.cwd());

  pi.registerTool({
    ...localBash,
    async execute(id, params, signal, onUpdate, ctx) {
      const sshTarget = pi.getFlag("--ssh");
      if (sshTarget) {
        const remoteBash = createBashTool(process.cwd(), {
          operations: createSSHOperations(sshTarget),
        });
        return remoteBash.execute(id, params, signal, onUpdate);
      }
      return localBash.execute(id, params, signal, onUpdate);
    },
  });
}
```
</ssh_pattern>

<tool_override_pattern>
Override built-in tools for logging/access control — omit renderCall/renderResult to keep built-in rendering:

```typescript
import { createReadTool } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

pi.registerTool({
  name: "read",  // Same name = overrides built-in
  label: "Read (Logged)",
  description: "Read file contents with logging",
  parameters: Type.Object({
    path: Type.String(),
    offset: Type.Optional(Type.Number()),
    limit: Type.Optional(Type.Number()),
  }),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    console.log(`[AUDIT] Reading: ${params.path}`);
    const builtIn = createReadTool(ctx.cwd);
    return builtIn.execute(toolCallId, params, signal, onUpdate);
  },
  // Omit renderCall/renderResult → built-in renderer used automatically
});
```

**Must match exact result shape** including `details` type.
</tool_override_pattern>
