/**
 * Verification Evidence — JSON persistence and markdown table formatting.
 *
 * Two pure-ish functions:
 *   - writeVerificationJSON: persists a machine-readable T##-VERIFY.json artifact
 *   - formatEvidenceTable:   returns a markdown evidence table string
 *
 * JSON schema uses schemaVersion: 1 for forward-compatibility.
 * stdout/stderr are intentionally excluded from the JSON to avoid unbounded file sizes.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { VerificationResult } from "./types.ts";

// ─── JSON Evidence Artifact ──────────────────────────────────────────────────

export interface EvidenceCheckJSON {
  command: string;
  exitCode: number;
  durationMs: number;
  verdict: "pass" | "fail";
}

export interface EvidenceJSON {
  schemaVersion: 1;
  taskId: string;
  unitId: string;
  timestamp: number;
  passed: boolean;
  discoverySource: string;
  checks: EvidenceCheckJSON[];
}

/**
 * Write a T##-VERIFY.json artifact to the tasks directory.
 * Creates the directory with mkdirSync({ recursive: true }) if it doesn't exist.
 *
 * stdout/stderr are excluded from the JSON — the full output lives in VerificationResult
 * in memory and is logged to stderr during the gate run.
 */
export function writeVerificationJSON(
  result: VerificationResult,
  tasksDir: string,
  taskId: string,
  unitId?: string,
): void {
  mkdirSync(tasksDir, { recursive: true });

  const evidence: EvidenceJSON = {
    schemaVersion: 1,
    taskId,
    unitId: unitId ?? taskId,
    timestamp: result.timestamp,
    passed: result.passed,
    discoverySource: result.discoverySource,
    checks: result.checks.map((check) => ({
      command: check.command,
      exitCode: check.exitCode,
      durationMs: check.durationMs,
      verdict: check.exitCode === 0 ? "pass" : "fail",
    })),
  };

  const filePath = join(tasksDir, `${taskId}-VERIFY.json`);
  writeFileSync(filePath, JSON.stringify(evidence, null, 2) + "\n", "utf-8");
}

// ─── Markdown Evidence Table ─────────────────────────────────────────────────

/**
 * Format duration in milliseconds as seconds with 1 decimal place.
 * e.g. 2340 → "2.3s", 150 → "0.2s", 0 → "0.0s"
 */
function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Generate a markdown evidence table from a VerificationResult.
 *
 * Returns a "no checks" note if result.checks is empty.
 * Otherwise returns a 5-column markdown table: #, Command, Exit Code, Verdict, Duration.
 */
export function formatEvidenceTable(result: VerificationResult): string {
  if (result.checks.length === 0) {
    return "_No verification checks discovered._";
  }

  const lines: string[] = [
    "| # | Command | Exit Code | Verdict | Duration |",
    "|---|---------|-----------|---------|----------|",
  ];

  for (let i = 0; i < result.checks.length; i++) {
    const check = result.checks[i];
    const num = i + 1;
    const verdict =
      check.exitCode === 0 ? "✅ pass" : "❌ fail";
    const duration = formatDuration(check.durationMs);

    lines.push(
      `| ${num} | ${check.command} | ${check.exitCode} | ${verdict} | ${duration} |`,
    );
  }

  return lines.join("\n");
}
