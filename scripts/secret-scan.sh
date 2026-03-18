#!/usr/bin/env bash
# Secret scanner — detects hardcoded credentials in staged/changed files.
# Usage:
#   scripts/secret-scan.sh              # scan staged files (pre-commit mode)
#   scripts/secret-scan.sh --diff HEAD  # scan diff against HEAD (CI mode)
#   scripts/secret-scan.sh --file path  # scan a specific file
#
# Works on macOS (BSD grep) and Linux (GNU grep) — uses only ERE patterns.

set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

IGNOREFILE=".secretscanignore"
EXIT_CODE=0

# ── Pattern definitions ────────────────────────────────────────────────
# Each entry: "LABEL:::FLAGS:::REGEX"
# FLAGS: "" for default, "i" for case-insensitive (-i flag)
# All patterns use POSIX ERE (grep -E), no PCRE required.
PATTERNS=(
  # AWS
  "AWS Access Key::::::AKIA[0-9A-Z]{16}"

  # Generic API keys / tokens (quoted strings that look like keys)
  "Generic API Key:::i:::(api[_-]?key|apikey|api[_-]?secret)[[:space:]]*[:=][[:space:]]*['\"][0-9a-zA-Z_./-]{20,}['\"]"
  "Generic Secret:::i:::(secret|token|password|passwd|pwd|credential)[[:space:]]*[:=][[:space:]]*['\"][^[:space:]'\"]{8,}['\"]"
  "Authorization Header:::i:::(authorization|bearer)[[:space:]]*[:=][[:space:]]*['\"][^[:space:]'\"]{8,}['\"]"

  # Private keys
  "Private Key::::::-----BEGIN[[:space:]]+(RSA|DSA|EC|OPENSSH|PGP)[[:space:]]+PRIVATE[[:space:]]+KEY-----"

  # Connection strings
  "Database URL:::i:::(mysql|postgres|postgresql|mongodb|redis|amqp|mssql)://[^[:space:]'\"]{8,}"

  # GitHub / GitLab tokens
  "GitHub Token::::::gh[pousr]_[0-9a-zA-Z]{36,}"
  "GitLab Token::::::glpat-[0-9a-zA-Z-]{20,}"

  # Slack
  "Slack Token::::::xox[baprs]-[0-9a-zA-Z-]{10,}"
  "Slack Webhook::::::hooks\.slack\.com/services/T[0-9A-Z]{8,}/B[0-9A-Z]{8,}/[0-9a-zA-Z]{20,}"

  # Google
  "Google API Key::::::AIza[0-9A-Za-z_-]{35}"

  # Stripe
  "Stripe Key::::::[sr]k_(live|test)_[0-9a-zA-Z]{20,}"

  # npm token
  "npm Token::::::npm_[0-9a-zA-Z]{36,}"

  # Hex-encoded secrets (high-entropy, 32+ hex chars assigned to a variable)
  "Hex Secret:::i:::(secret|key|token|password)[[:space:]]*[:=][[:space:]]*['\"]?[0-9a-f]{32,}['\"]?"

  # Hardcoded passwords in config-like files
  "Hardcoded Password:::i:::password[[:space:]]*[:=][[:space:]]*['\"][^'\"]{4,}['\"]"
)

# ── Load ignorefile ────────────────────────────────────────────────────
load_ignore_patterns() {
  local ignore_patterns=()
  if [[ -f "$IGNOREFILE" ]]; then
    while IFS= read -r line; do
      # skip blank lines and comments
      [[ -z "$line" || "$line" =~ ^# ]] && continue
      ignore_patterns+=("$line")
    done < "$IGNOREFILE"
  fi
  echo "${ignore_patterns[@]+"${ignore_patterns[@]}"}"
}

is_ignored() {
  local file="$1" line_content="$2"
  local ignore_patterns
  read -ra ignore_patterns <<< "$(load_ignore_patterns)"

  for pattern in "${ignore_patterns[@]+"${ignore_patterns[@]}"}"; do
    # Pattern can be "filepath:pattern" or just "pattern"
    if [[ "$pattern" == *:* ]]; then
      local ignore_file="${pattern%%:*}"
      local ignore_regex="${pattern#*:}"
      if [[ "$file" == $ignore_file ]] && echo "$line_content" | grep -qiE "$ignore_regex" 2>/dev/null; then
        return 0
      fi
    else
      if echo "$line_content" | grep -qiE "$pattern" 2>/dev/null; then
        return 0
      fi
    fi
  done
  return 1
}

# ── Determine files to scan ───────────────────────────────────────────
get_files() {
  if [[ "${1:-}" == "--diff" ]]; then
    local ref="${2:-HEAD}"
    git diff --name-only --diff-filter=ACMR "$ref" 2>/dev/null || true
  elif [[ "${1:-}" == "--file" ]]; then
    echo "${2:-}"
  else
    # Pre-commit mode: staged files only
    git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true
  fi
}

# ── File-type filter (skip binaries and known safe files) ─────────────
should_scan() {
  local file="$1"
  # Skip binary extensions
  case "$file" in
    *.png|*.jpg|*.jpeg|*.gif|*.ico|*.svg|*.woff|*.woff2|*.ttf|*.eot|\
    *.zip|*.tar|*.gz|*.tgz|*.bz2|*.7z|*.rar|\
    *.exe|*.dll|*.so|*.dylib|*.o|*.a|\
    *.pdf|*.doc|*.docx|*.xls|*.xlsx|\
    *.lock|package-lock.json|pnpm-lock.yaml|bun.lock|\
    *.min.js|*.min.css|*.map|\
    *.node|*.wasm)
      return 1 ;;
  esac
  # Skip known non-secret files
  case "$file" in
    .secretscanignore|.gitignore|.gitattributes|LICENSE*|CHANGELOG*|*.md)
      return 1 ;;
  esac
  # Skip node_modules, dist, coverage
  case "$file" in
    node_modules/*|dist/*|coverage/*|.gsd/*)
      return 1 ;;
  esac
  return 0
}

# ── Get content to scan ───────────────────────────────────────────────
get_content() {
  local file="$1"
  if [[ "${SCAN_MODE:-staged}" == "staged" ]]; then
    # For pre-commit, scan the staged version
    git show ":$file" 2>/dev/null || cat "$file" 2>/dev/null || true
  else
    cat "$file" 2>/dev/null || true
  fi
}

# ── Main scan ─────────────────────────────────────────────────────────
SCAN_MODE="staged"
FILES_ARG=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --diff) SCAN_MODE="diff"; FILES_ARG=("--diff" "${2:-HEAD}"); shift 2 ;;
    --file) SCAN_MODE="file"; FILES_ARG=("--file" "$2"); shift 2 ;;
    *) shift ;;
  esac
done

FILES=$(get_files "${FILES_ARG[@]+"${FILES_ARG[@]}"}")
FINDINGS=0

if [[ -z "$FILES" ]]; then
  echo "secret-scan: no files to scan"
  exit 0
fi

while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  should_scan "$file" || continue

  content=$(get_content "$file")
  [[ -z "$content" ]] && continue

  for entry in "${PATTERNS[@]}"; do
    label="${entry%%:::*}"
    rest="${entry#*:::}"
    flags="${rest%%:::*}"
    regex="${rest#*:::}"

    # Build grep flags
    grep_flags="-nE"
    if [[ "$flags" == *i* ]]; then
      grep_flags="-niE"
    fi

    matches=$(echo "$content" | grep $grep_flags -e "$regex" 2>/dev/null || true)

    if [[ -n "$matches" ]]; then
      while IFS= read -r match_line; do
        [[ -z "$match_line" ]] && continue
        line_num="${match_line%%:*}"
        line_content="${match_line#*:}"

        # Check ignorefile
        if is_ignored "$file" "$line_content"; then
          continue
        fi

        # Mask the actual secret value in output
        echo -e "${RED}[SECRET DETECTED]${NC} ${YELLOW}${label}${NC}"
        echo "  File: $file:$line_num"
        echo "  Line: $(echo "$line_content" | head -c 120)..."
        echo ""
        FINDINGS=$((FINDINGS + 1))
        EXIT_CODE=1
      done <<< "$matches"
    fi
  done
done <<< "$FILES"

if [[ $FINDINGS -gt 0 ]]; then
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${RED}Found $FINDINGS potential secret(s) in staged files.${NC}"
  echo -e "${RED}Commit blocked. Remove the secrets or add exceptions${NC}"
  echo -e "${RED}to .secretscanignore if these are false positives.${NC}"
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
else
  echo "secret-scan: no secrets detected ✓"
fi

exit $EXIT_CODE
