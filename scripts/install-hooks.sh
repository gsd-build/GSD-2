#!/usr/bin/env bash
# Installs git hooks for secret scanning and commit message validation.
# Safe to run multiple times — only installs if not already present.

set -euo pipefail

HOOK_DIR="$(git rev-parse --git-dir)/hooks"
mkdir -p "$HOOK_DIR"

# ── Pre-commit: secret scanning ───────────────────────────────────────
PRE_COMMIT="$HOOK_DIR/pre-commit"
MARKER_PRE="# gsd-secret-scan"

if [[ -f "$PRE_COMMIT" ]] && grep -q "$MARKER_PRE" "$PRE_COMMIT" 2>/dev/null; then
  echo "secret-scan pre-commit hook already installed."
else
  if [[ -f "$PRE_COMMIT" ]]; then
    echo "" >> "$PRE_COMMIT"
    echo "$MARKER_PRE" >> "$PRE_COMMIT"
    echo 'bash "$(git rev-parse --show-toplevel)/scripts/secret-scan.sh"' >> "$PRE_COMMIT"
    echo "secret-scan appended to existing pre-commit hook."
  else
    cat > "$PRE_COMMIT" << 'EOF'
#!/usr/bin/env bash
# gsd-secret-scan
# Pre-commit hook: scan staged files for hardcoded secrets
bash "$(git rev-parse --show-toplevel)/scripts/secret-scan.sh"
EOF
    chmod +x "$PRE_COMMIT"
    echo "secret-scan pre-commit hook installed."
  fi
fi

# ── Commit-msg: conventional commit format ───────────────────────────
COMMIT_MSG="$HOOK_DIR/commit-msg"
MARKER_MSG="# gsd-commit-msg"

if [[ -f "$COMMIT_MSG" ]] && grep -q "$MARKER_MSG" "$COMMIT_MSG" 2>/dev/null; then
  echo "commit-msg hook already installed."
else
  cat > "$COMMIT_MSG" << 'HOOKEOF'
#!/usr/bin/env bash
# gsd-commit-msg
# Validates commit messages follow Conventional Commits format.
# https://www.conventionalcommits.org/

COMMIT_MSG_FILE="$1"
COMMIT_MSG=$(cat "$COMMIT_MSG_FILE")

# Allow merge commits, revert commits, and fixup/squash
if echo "$COMMIT_MSG" | grep -qE "^(Merge|Revert|fixup!|squash!)"; then
  exit 0
fi

# Pattern: type(optional-scope): description
# Types must match the project's defined list
PATTERN="^(feat|fix|docs|chore|refactor|test|infra|ci|perf|build|revert)(\(.+\))?: .{1,72}$"

if ! echo "$COMMIT_MSG" | head -1 | grep -qE "$PATTERN"; then
  echo ""
  echo "  Invalid commit message format."
  echo ""
  echo "  Expected:  type(scope): short description"
  echo "  Got:       $(echo "$COMMIT_MSG" | head -1)"
  echo ""
  echo "  Valid types: feat fix docs chore refactor test infra ci perf build revert"
  echo "  Examples:"
  echo "    feat(pi-ai): add streaming output for long-running tasks"
  echo "    fix(auth): resolve token refresh failure on idle sessions"
  echo "    chore(deps): bump typescript from 5.3.0 to 5.4.2"
  echo ""
  exit 1
fi
HOOKEOF
  chmod +x "$COMMIT_MSG"
  echo "commit-msg hook installed."
fi

echo ""
echo "All hooks installed. Run 'npm run secret-scan:install-hook' to reinstall."
