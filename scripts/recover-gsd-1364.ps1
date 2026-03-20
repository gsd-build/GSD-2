# recover-gsd-1364.ps1 - Recovery script for issue #1364 (Windows)
#
# CRITICAL DATA-LOSS BUG: GSD versions 2.30.0-2.35.x unconditionally added
# ".gsd" to .gitignore via ensureGitignore(), causing git to report all
# tracked .gsd/ files as deleted. Fixed in v2.36.0 (PR #1367).
#
# This script:
#   1. Detects whether the repo was affected
#   2. Finds the last clean commit before the damage
#   3. Restores all deleted .gsd/ files from that commit
#   4. Removes the bad ".gsd" line from .gitignore (if .gsd/ is tracked)
#   5. Prints a ready-to-commit summary
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\recover-gsd-1364.ps1 [-DryRun]
#
# Options:
#   -DryRun   Show what would be done without making any changes
#
# Requirements: git >= 2.x, PowerShell >= 5.1, Git for Windows

[CmdletBinding()]
param(
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# ── Helpers ───────────────────────────────────────────────────────────────────

function Write-Info    { param($msg) Write-Host "[info]  $msg" -ForegroundColor Cyan }
function Write-Ok      { param($msg) Write-Host "[ok]    $msg" -ForegroundColor Green }
function Write-Warn    { param($msg) Write-Host "[warn]  $msg" -ForegroundColor Yellow }
function Write-Err     { param($msg) Write-Host "[error] $msg" -ForegroundColor Red }
function Write-Section { param($msg) Write-Host "`n$msg" -ForegroundColor White }

function Exit-Fatal {
    param($msg)
    Write-Err $msg
    exit 1
}

function Invoke-Git {
    param([string[]]$Args, [switch]$AllowFailure)
    try {
        $result = & git @Args 2>&1
        if ($LASTEXITCODE -ne 0) {
            if ($AllowFailure) { return "" }
            throw "git $($Args -join ' ') exited $LASTEXITCODE"
        }
        return ($result -join "`n").Trim()
    } catch {
        if ($AllowFailure) { return "" }
        throw
    }
}

# Run or dry-run a git command
function Invoke-GitOrDryRun {
    param([string[]]$GitArgs, [string]$Display)
    if ($DryRun) {
        Write-Host "  (dry-run) git $Display" -ForegroundColor Yellow
    } else {
        Invoke-Git $GitArgs | Out-Null
    }
}

# Check whether a path is a symlink OR a junction (Windows uses junctions for
# the .gsd external-state migration via symlinkSync(..., "junction"))
function Test-ReparsePoint {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $false }
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if (-not $item) { return $false }
    # LinkType covers: SymbolicLink, Junction, HardLink
    return ($item.LinkType -eq 'SymbolicLink' -or $item.LinkType -eq 'Junction')
}

# ── Preflight ─────────────────────────────────────────────────────────────────

Write-Section "── Preflight ───────────────────────────────────────────────────────"

# Verify git is available
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Exit-Fatal "git not found on PATH. Install Git for Windows from https://git-scm.com"
}

# Must be run from inside a git repo
$gitDirCheck = & git rev-parse --git-dir 2>&1
if ($LASTEXITCODE -ne 0) {
    Exit-Fatal "Not inside a git repository. Run this from your project root."
}

$repoRoot = Invoke-Git @('rev-parse', '--show-toplevel')
Set-Location $repoRoot
Write-Info "Repo root: $repoRoot"

if ($DryRun) {
    Write-Warn "DRY-RUN mode — no changes will be made."
}

# ── Step 1: Detect .gsd/ ─────────────────────────────────────────────────────

Write-Section "── Step 1: Detect .gsd/ directory ─────────────────────────────────"

$gsdDir = Join-Path $repoRoot '.gsd'

if (-not (Test-Path $gsdDir)) {
    Write-Ok ".gsd/ does not exist in this repo — not affected."
    exit 0
}

if (Test-ReparsePoint $gsdDir) {
    Write-Ok ".gsd/ is a symlink/junction (external state) — migration already complete, not affected by #1364."
    exit 0
}

Write-Info ".gsd/ is a real directory."

# ── Step 2: Check .gitignore for .gsd entry ──────────────────────────────────

Write-Section "── Step 2: Check .gitignore for .gsd entry ─────────────────────────"

$gitignorePath = Join-Path $repoRoot '.gitignore'

if (-not (Test-Path $gitignorePath)) {
    Write-Ok ".gitignore does not exist — not affected."
    exit 0
}

$gitignoreLines = Get-Content $gitignorePath -Encoding UTF8
$gsdIgnoreLine  = $gitignoreLines | Where-Object {
    $trimmed = $_.Trim()
    $trimmed -eq '.gsd' -and -not $trimmed.StartsWith('#')
} | Select-Object -First 1

if (-not $gsdIgnoreLine) {
    Write-Ok '".gsd" not found in .gitignore — .gitignore not affected.'
} else {
    Write-Warn '".gsd" found in .gitignore — this is the bad pattern from #1364.'
}

# ── Step 3: Find deleted .gsd/ files ─────────────────────────────────────────

Write-Section "── Step 3: Find deleted .gsd/ files ───────────────────────────────"

# Files deleted in working tree (tracked but missing)
$deletedRaw = Invoke-Git @('ls-files', '--deleted', '--', '.gsd/*') -AllowFailure
$deletedFiles = if ($deletedRaw) { $deletedRaw -split "`n" | Where-Object { $_ } } else { @() }

# Files tracked in HEAD right now
$trackedInHeadRaw = Invoke-Git @('ls-tree', '-r', '--name-only', 'HEAD', '--', '.gsd/') -AllowFailure
$trackedInHead = if ($trackedInHeadRaw) { $trackedInHeadRaw -split "`n" | Where-Object { $_ } } else { @() }

# Files deleted in committed history (post-commit damage scenario)
$deletedHistoryRaw = Invoke-Git @('log', '--all', '--diff-filter=D', '--name-only', '--format=', '--', '.gsd/*') -AllowFailure
$deletedFromHistory = if ($deletedHistoryRaw) {
    $deletedHistoryRaw -split "`n" | Where-Object { $_ -match '^\.gsd' } | Sort-Object -Unique
} else { @() }

# Nothing was ever tracked in any scenario
if ($trackedInHead.Count -eq 0 -and $deletedFiles.Count -eq 0 -and $deletedFromHistory.Count -eq 0) {
    Write-Ok "No .gsd/ files tracked in this repo — not affected by #1364."
    if ($gsdIgnoreLine) {
        Write-Warn '".gsd" is still in .gitignore but there is nothing to restore.'
    }
    exit 0
}

# Determine scenario
if ($trackedInHead.Count -gt 0) {
    Write-Info "Scenario A: $($trackedInHead.Count) .gsd/ files still tracked in HEAD."
} elseif ($deletedFromHistory.Count -gt 0) {
    Write-Warn "Scenario B: $($deletedFromHistory.Count) .gsd/ file(s) were tracked but deleted in a committed change:"
    $deletedFromHistory | Select-Object -First 20 | ForEach-Object { Write-Host "    - $_" }
    if ($deletedFromHistory.Count -gt 20) {
        Write-Host "    ... and $($deletedFromHistory.Count - 20) more"
    }
}

if ($deletedFiles.Count -gt 0) {
    Write-Warn "$($deletedFiles.Count) .gsd/ file(s) are missing from working tree (tracked but deleted/gitignored):"
    $deletedFiles | Select-Object -First 20 | ForEach-Object { Write-Host "    - $_" }
    if ($deletedFiles.Count -gt 20) {
        Write-Host "    ... and $($deletedFiles.Count - 20) more"
    }
}

# HEAD has files and working tree is clean — only .gitignore needs fixing
if ($trackedInHead.Count -gt 0 -and $deletedFiles.Count -eq 0) {
    if (-not $gsdIgnoreLine) {
        Write-Ok "No action needed — .gsd/ is tracked in HEAD and .gitignore is clean."
        exit 0
    }
    Write-Info ".gsd/ is tracked in HEAD and working tree is clean — only .gitignore needs fixing."
}

# ── Step 4: Find last clean commit ───────────────────────────────────────────

Write-Section "── Step 4: Find last clean commit ──────────────────────────────────"

Write-Info "Scanning git log to find when .gsd was added to .gitignore..."

$damageCommit = $null
$cleanCommit  = $null

# Strategy 1: find first commit that added ".gsd" to .gitignore
$gitignoreCommits = Invoke-Git @('log', '--format=%H', '--', '.gitignore') -AllowFailure
if ($gitignoreCommits) {
    foreach ($sha in ($gitignoreCommits -split "`n" | Where-Object { $_ })) {
        $content = Invoke-Git @('show', "${sha}:.gitignore") -AllowFailure
        if ($content -and ($content -split "`n" | Where-Object { $_.Trim() -eq '.gsd' })) {
            $damageCommit = $sha
            break
        }
    }
}

# Strategy 2: find commit that deleted .gsd/ files
if (-not $damageCommit -and $deletedFromHistory.Count -gt 0) {
    Write-Info "Searching for the commit that deleted .gsd/ files from the index..."
    $deleteCommits = Invoke-Git @('log', '--all', '--diff-filter=D', '--format=%H', '--', '.gsd/*') -AllowFailure
    if ($deleteCommits) {
        $damageCommit = ($deleteCommits -split "`n" | Where-Object { $_ } | Select-Object -First 1)
    }
}

if (-not $damageCommit) {
    Write-Warn "Could not pinpoint the damage commit — falling back to HEAD."
    $cleanCommit = 'HEAD'
} else {
    $damageMsg = Invoke-Git @('log', '--format=%s', '-1', $damageCommit) -AllowFailure
    Write-Info "Damage commit: $damageCommit ($damageMsg)"
    $cleanCommit = "${damageCommit}^"
    $cleanMsg = Invoke-Git @('log', '--format=%s', '-1', $cleanCommit) -AllowFailure
    if (-not $cleanMsg) { $cleanMsg = 'unknown' }
    Write-Info "Restoring from: $cleanCommit — $cleanMsg"
}

# Verify restore point has .gsd/ files
$restorable = Invoke-Git @('ls-tree', '-r', '--name-only', $cleanCommit, '--', '.gsd/') -AllowFailure
$restorableFiles = if ($restorable) { $restorable -split "`n" | Where-Object { $_ } } else { @() }

if ($restorableFiles.Count -eq 0) {
    Exit-Fatal "No .gsd/ files found in restore point $cleanCommit — cannot recover. Check git log manually."
}

Write-Ok "Restore point has $($restorableFiles.Count) .gsd/ files available."

# ── Step 5: Restore deleted files ────────────────────────────────────────────

Write-Section "── Step 5: Restore deleted .gsd/ files ────────────────────────────"

$needsRestore = ($deletedFiles.Count -gt 0) -or ($deletedFromHistory.Count -gt 0 -and $trackedInHead.Count -eq 0)

if (-not $needsRestore) {
    Write-Ok "No deleted files to restore — skipping."
} else {
    Write-Info "Restoring .gsd/ files from $cleanCommit..."
    Invoke-GitOrDryRun -GitArgs @('checkout', $cleanCommit, '--', '.gsd/') -Display "checkout $cleanCommit -- .gsd/"

    if (-not $DryRun) {
        $stillMissingRaw = Invoke-Git @('ls-files', '--deleted', '--', '.gsd/*') -AllowFailure
        $stillMissing = if ($stillMissingRaw) { $stillMissingRaw -split "`n" | Where-Object { $_ } } else { @() }
        if ($stillMissing.Count -eq 0) {
            Write-Ok "All .gsd/ files restored successfully."
        } else {
            Write-Warn "$($stillMissing.Count) file(s) still missing after restore — may need manual recovery:"
            $stillMissing | Select-Object -First 10 | ForEach-Object { Write-Host "    - $_" }
        }
    }
}

# ── Step 6: Fix .gitignore ────────────────────────────────────────────────────

Write-Section "── Step 6: Fix .gitignore ──────────────────────────────────────────"

if (-not $gsdIgnoreLine) {
    Write-Ok '".gsd" not in .gitignore — nothing to fix.'
} else {
    Write-Info 'Removing bare ".gsd" line from .gitignore...'
    if ($DryRun) {
        Write-Host "  (dry-run) Would remove line: .gsd" -ForegroundColor Yellow
    } else {
        # Filter out the exact bare ".gsd" line — preserve all other content including
        # sub-path patterns like ".gsd/", ".gsd/activity/" and comments
        $cleaned = $gitignoreLines | Where-Object { $_.Trim() -ne '.gsd' }
        # Write with UTF-8 no BOM to match git's expectations
        [System.IO.File]::WriteAllLines($gitignorePath, $cleaned, [System.Text.UTF8Encoding]::new($false))
        Write-Ok '".gsd" line removed from .gitignore.'
    }
}

# ── Step 7: Stage changes ─────────────────────────────────────────────────────

Write-Section "── Step 7: Stage recovery changes ──────────────────────────────────"

if (-not $DryRun) {
    $changed = Invoke-Git @('status', '--short', '--', '.gsd/', '.gitignore') -AllowFailure
    if (-not $changed) {
        Write-Ok "No staged changes — working tree was already clean."
    } else {
        Invoke-Git @('add', '.gsd/', '.gitignore') -AllowFailure | Out-Null
        $stagedRaw  = Invoke-Git @('diff', '--cached', '--name-only', '--', '.gsd/', '.gitignore') -AllowFailure
        $stagedFiles = if ($stagedRaw) { $stagedRaw -split "`n" | Where-Object { $_ } } else { @() }
        Write-Ok "$($stagedFiles.Count) file(s) staged and ready to commit."
    }
}

# ── Summary ───────────────────────────────────────────────────────────────────

Write-Section "── Summary ──────────────────────────────────────────────────────────"

if ($DryRun) {
    Write-Host "Dry-run complete. Re-run without -DryRun to apply changes." -ForegroundColor Yellow
} else {
    $finalStagedRaw  = Invoke-Git @('diff', '--cached', '--name-only', '--', '.gsd/', '.gitignore') -AllowFailure
    $finalStaged = if ($finalStagedRaw) { $finalStagedRaw -split "`n" | Where-Object { $_ } } else { @() }

    if ($finalStaged.Count -gt 0) {
        Write-Host "Recovery complete. Commit with:" -ForegroundColor Green
        Write-Host ""
        Write-Host '  git commit -m "fix: restore .gsd/ files deleted by #1364 regression"'
        Write-Host ""
        Write-Host "Staged files:"
        $finalStaged | Select-Object -First 20 | ForEach-Object { Write-Host "  + $_" }
        if ($finalStaged.Count -gt 20) {
            Write-Host "  ... and $($finalStaged.Count - 20) more"
        }
    } else {
        Write-Ok "Repo is healthy — no recovery needed."
    }
}
