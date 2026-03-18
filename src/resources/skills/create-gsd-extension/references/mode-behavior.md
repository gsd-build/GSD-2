<overview>
Mode behavior determines which UI methods work. Extensions may run in non-interactive modes where dialogs are unavailable.
</overview>

<mode_table>
| Mode | UI Methods | Notes |
|------|-----------|-------|
| **Interactive** (default) | Full TUI | Normal operation — all UI works |
| **RPC** (`--mode rpc`) | JSON protocol | Host handles UI, dialogs work via sub-protocol |
| **JSON** (`--mode json`) | No-op | Event stream to stdout, no UI |
| **Print** (`-p`) | No-op | Extensions run but can't prompt users |
</mode_table>

<checking_ui>
**Always check `ctx.hasUI`** before calling dialog methods:

```typescript
if (ctx.hasUI) {
  const ok = await ctx.ui.confirm("Delete?", "Sure?");
  if (!ok) return;
} else {
  // Default behavior for non-interactive mode
  // Or just proceed without confirmation
}
```

`ctx.hasUI` is `false` in print mode (`-p`) and JSON mode. `true` in interactive and RPC mode.
</checking_ui>

<fire_and_forget>
Non-blocking methods (`notify`, `setStatus`, `setWidget`, `setTitle`, `setEditorText`) are safe in all modes — they're no-ops when no UI is available.
</fire_and_forget>
