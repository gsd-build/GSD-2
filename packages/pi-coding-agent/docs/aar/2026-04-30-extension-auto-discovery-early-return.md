# AAR — pi-coding-agent extension auto-discovery early-return regression

**Date:** 2026-04-30
**Affected versions:** through `gsd-pi@2.78.1` (verified) — likely all prior versions that ship `collectAutoExtensionEntries` with the early-return shape.
**Author:** Regis-RCR
**Status:** Fix proposed in PR fixing `packages/pi-coding-agent/src/core/package-manager.ts`.

## TL;DR

When `~/.gsd/agent/extensions/` contains both a top-level `index.{ts,js}` (the typical shape of a user-installed extension wrapper) **and** subdirectories (the bundled extensions: `gsd`, `bg-shell`, `browser-tools`, `claude-code-cli`, ...), `collectAutoExtensionEntries(dir)` returned only the top-level entry and silently skipped every bundled subdirectory. Pi loaded the user wrapper but registered zero bundled-extension commands, so `/gsd <subcommand>` and friends fell through to the LLM as raw user text instead of being intercepted by the registered handler.

## Symptom (production behavior observed)

Reproduced during the `rcr-gain` project's M007 milestone pilot.

- Environment: `gsd-pi@2.78.1` with a single top-level user extension installed at `~/.gsd/agent/extensions/index.js` (a wrapper for the EpsilonCode adapter).
- Bundled extension subdirectories present alongside the wrapper: `gsd/`, `bg-shell/`, `browser-tools/`, `claude-code-cli/`, plus 14 others under the same parent.
- Effect: invoking `gsd headless --output-format stream-json next` produced an agent run where:
  - The agent's tool list contained zero `gsd_*` tools (expected: 49+).
  - The first user message in the JSONL transcript was the literal string `/gsd next`, instead of the research-slice prompt that the bundled `gsd` extension is supposed to materialize when its slash command is intercepted.
- Net effect: the slash-command system is silently broken; pi happily delivers the unprocessed slash command to the model as if it were a user utterance.

## Root cause

`packages/pi-coding-agent/src/core/package-manager.ts` — function `collectAutoExtensionEntries`, pre-fix shape:

```ts
function collectAutoExtensionEntries(dir: string): string[] {
    const entries: string[] = [];
    if (!existsSync(dir)) return entries;
    // First check if this directory itself has explicit extension entries (package.json or index)
    const rootEntries = resolveExtensionEntries(dir);
    if (rootEntries) {
        return rootEntries;       // <-- BUG
    }
    // Otherwise, discover extensions from directory contents
    const dirEntries = readdirSync(dir, { withFileTypes: true });
    // ... subdir traversal ...
}
```

When `resolveExtensionEntries(dir)` finds either:
1. a `package.json` declaring `pi.extensions[]` (manifest-driven), or
2. a top-level `index.ts` / `index.js` (auto-detected wrapper),

it returns a non-null array and the early-return fires. For case (1) this is intentional and correct — the manifest is authoritative (this is how a library directory like `cmux` opts out by declaring `"pi": {}` with no extensions, or how a maintainer enumerates a closed list of entries). For case (2), however, the early return is wrong: a top-level `index.{ts,js}` does **not** signal "ignore my siblings" — it simply marks the wrapper itself as one extension entry. Sibling subdirectories (the bundled extensions in the user/global scope) must still be enumerated.

Conflating those two cases was the bug.

## Reproduction steps

Single-machine repro on macOS / Linux:

```bash
# 1. Set up a user-extension layout that mirrors gsd-pi's installed shape.
mkdir -p ~/.gsd/agent/extensions
cat > ~/.gsd/agent/extensions/index.js <<'EOF'
// Minimal user extension wrapper.
module.exports = {
    register(pi) {
        pi.registerCommand("user-stub", { description: "stub" }, async () => ({}));
    },
};
EOF
cat > ~/.gsd/agent/extensions/package.json <<'EOF'
{ "name": "user-extensions", "type": "module" }
EOF

# 2. Drop a bundled-style subdir alongside it.
mkdir -p ~/.gsd/agent/extensions/gsd
cat > ~/.gsd/agent/extensions/gsd/index.js <<'EOF'
module.exports = {
    register(pi) {
        pi.registerCommand("gsd", { description: "bundled stub" }, async () => ({}));
    },
};
EOF

# 3. Run any pi-coding-agent invocation that exercises slash dispatch:
gsd headless --output-format stream-json next
```

Observation pre-fix:

- The agent's tool catalog does not contain `gsd_*` commands.
- The transcript's first user message reads literally `/gsd next`.

Post-fix the bundled subdirectory is enumerated; `pi.registerCommand("gsd", ...)` runs; `/gsd next` is intercepted and resolves to the bundled handler.

## Why the gsd-pi wrapper's `GSD_BUNDLED_EXTENSION_PATHS` env var doesn't help

The outer `gsd-pi` loader (`dist/loader.js` in the published `gsd-pi` package) attempts to compensate by setting `process.env.GSD_BUNDLED_EXTENSION_PATHS` to the list of bundled-extension directories before spawning pi. That env var is intended as a hint that pi should treat as an additional discovery root.

However a search of the `pi-coding-agent` source shows that the env var is never read:

```bash
grep -rln "GSD_BUNDLED_EXTENSION_PATHS" packages/pi-coding-agent/src/   # → no matches
```

So the loader plumbing is dead code on the consumer side. Whatever the original intent, the only working channel for bundled-extension discovery in user/global scope today is `collectAutoExtensionEntries` walking `~/.gsd/agent/extensions/`. The early-return bug therefore has no compensating fallback.

## Verified workaround (no code change)

Adding an explicit `pi.extensions` manifest at `~/.gsd/agent/extensions/package.json` listing every entry — the user wrapper plus every bundled subdir — routes through the **other** branch of `resolveExtensionEntries` (the one that reads `pkg.pi.extensions[]`) and resolves the entries correctly. The manifest branch is authoritative, the listed entries are returned, and pi loads them all.

This was confirmed in the M007 pilot: enumerating 19 entries (1 wrapper + 18 bundled subdirs) restored 49 `gsd_*` tools in the registered tool list, and `/gsd next` was correctly intercepted.

The workaround is brittle — it requires the user to know about the bug, list every bundled extension by hand, and re-edit the manifest whenever pi adds or removes a bundled extension. It is not viable as a long-term solution.

## Proposed fix

Stop conflating "manifest is authoritative" with "top-level index.{ts,js} found". The patch:

1. Splits `resolveExtensionEntries` into a `resolveExtensionEntriesDetailed` that reports the source (`"manifest"` vs `"index"`), keeping the public-style helper as a thin wrapper for callers that only need the entries.
2. In `collectAutoExtensionEntries`:
   - When `source === "manifest"`: keep the early return. The manifest is authoritative; siblings are intentionally excluded. This preserves the opt-out contract for library directories.
   - When `source === "index"`: add the top-level entry to the result, then **also** continue into subdirectory enumeration. Bundled subdirs are now picked up.
   - When no top-level entry exists: behavior unchanged — enumerate subdirs and loose `.ts/.js` files at the root, as before.
   - In the file-scan branch, skip any path that was already added via the top-level index resolution to avoid double-counting.
3. Exports `collectAutoExtensionEntries` for unit testing. Treated as an internal API; no stability guarantee.

Test additions in `packages/pi-coding-agent/src/core/package-manager.test.ts` (new file, 8 tests):

- `returns an empty array when the directory does not exist`
- `loads only the top-level index.js when no subdirs exist`
- `loads only subdirs when no top-level index exists`
- `loads top-level index.js AND bundled subdirs when both exist (regression for early-return bug)` — pinpoints this AAR's bug.
- `does not double-count the top-level index.js when both branches see it`
- `treats a pi.extensions manifest as authoritative — does not scan sibling subdirs` — protects the cmux-style opt-out contract.
- `falls through to subdir discovery when package.json declares an empty pi block`
- `ignores hidden directories and node_modules`

All 8 pass locally with `node --test` against the esbuild-compiled output in `dist-test/`.

## Impact

Affects every `gsd-pi` user who has installed a custom user extension that landed as a top-level `index.{ts,js}` at `~/.gsd/agent/extensions/`. Specifically:

- Anyone using `gsd`'s `--extension <source>` install path that materializes a top-level wrapper.
- The EpsilonCode user extension pattern triggered the discovery in the M007 pilot; same root cause applies to any other wrapper of the same shape.

For users without a top-level entry, the existing subdir enumeration already worked and the patch is a no-op (verified by the `loads only subdirs when no top-level index exists` test).

## References

- Source of bug: `packages/pi-coding-agent/src/core/package-manager.ts`, function `collectAutoExtensionEntries` and helper `resolveExtensionEntries`.
- Companion downstream AAR: `/Users/regis/Development/GitHub/Regis-RCR/Experimental/epsiloncode/docs/aar/2026-04-30-sse-orphan-close-opus-4-7.md` (the EpsilonCode SSE incident that surfaced the bundled-discovery failure as a side-effect during the M007 pilot).
- No upstream issue exists at the time of writing — `gh issue list -R gsd-build/gsd-2 --search "extension auto-discovery"` and `gh issue list -R gsd-build/gsd-2 --search "collectAutoExtensionEntries"` both returned no relevant matches on 2026-04-30.

∵ Regis-RCR ∴
