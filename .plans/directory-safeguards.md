# Directory Safeguards Plan

## Problem
GSD had zero protection against being launched from dangerous directories like `$HOME`, `/`, `/usr`, `/etc`, etc. Running `gsd init` from these locations would create `.gsd/` and write planning files into system directories.

## Solution
Added a `validate-directory.ts` module with layered safeguards:

### Layer 1: Blocked system paths (hard stop)
- Filesystem roots: `/`, `/usr`, `/bin`, `/sbin`, `/etc`, `/var`, `/dev`, `/proc`, `/sys`, `/boot`, `/lib`, `/lib64`
- macOS: `/System`, `/Library`, `/Applications`, `/Volumes`, `/private`
- Windows: `C:\`, `C:\Windows`, `C:\Program Files`
- User's `$HOME` directory itself (subdirs are fine)
- System temp directory root (`os.tmpdir()`)

### Layer 2: High entry count heuristic (warning)
- Directories with >200 top-level entries trigger a confirmation dialog
- User can override if they really want to proceed

### Layer 3: Symlink resolution
- All paths are resolved through `realpathSync()` before checking
- Prevents bypassing via symlinks (e.g., `ln -s / ~/myproject`)

## Integration Points
1. `projectRoot()` in `commands.ts` — gateway for all `/gsd` subcommands (throws on blocked)
2. `showSmartEntry()` in `guided-flow.ts` — smart entry wizard (shows error/confirmation UI)
3. `bootstrapGsdDirectory()` in `init-wizard.ts` — final safety check before writing files (throws on blocked)

## Test Coverage
19 tests covering:
- All blocked path categories (/, /usr, /etc, /var, /usr/local/bin)
- Home directory (with and without trailing slash)
- Temp directory root
- Normal project directories (pass)
- Empty directories (pass)
- 200-entry boundary (pass) vs 210-entry (warning)
- assertSafeDirectory throw behavior
- Trailing slash normalization
