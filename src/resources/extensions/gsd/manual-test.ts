/**
 * manual-test.ts — Core logic for `/gsd test` interactive manual testing.
 *
 * Responsibilities:
 * - Parse UAT files into structured test cases
 * - Manage manual test sessions (DB + artifact persistence)
 * - Build prompts for agent-driven fix flow
 *
 * Leaf-ish in the import DAG: depends on files, paths, gsd-db, state.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative, extname } from "node:path";

import { extractSection, extractAllSections, parseBullets, parseSummary, parseTaskPlanIO } from "./files.js";
import { resolveSliceFile, resolveMilestoneFile, resolveTasksDir, resolveTaskFiles } from "./paths.js";
import { getMilestoneSlices, isDbAvailable } from "./gsd-db.js";
import type { SliceRow } from "./gsd-db.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TestVerdict = "pass" | "fail" | "skip";

export interface ManualTestCheck {
  /** Stable id like "S01-smoke" or "S01-TC01" or "S01-EC01" */
  id: string;
  /** Human-readable test name */
  name: string;
  /** Which slice this belongs to */
  sliceId: string;
  /** Category: smoke | test-case | edge-case */
  category: "smoke" | "test-case" | "edge-case";
  /** Step-by-step instructions */
  steps: string[];
  /** Expected result */
  expected: string;
  /** Preconditions (from the UAT file header, shared across checks) */
  preconditions: string;
  /** User's verdict after manual execution */
  verdict: TestVerdict | null;
  /** User's failure notes (empty when pass/skip) */
  notes: string;
  /** ISO 8601 timestamp when verdict was recorded */
  timestamp: string;
}

export interface ManualTestSession {
  id?: number;
  milestoneId: string;
  /** NULL for 'all' mode */
  sliceId: string | null;
  status: "in-progress" | "complete" | "abandoned" | "needs-fix";
  startedAt: string;
  completedAt: string | null;
  checks: ManualTestCheck[];
  /** State snapshot at session start */
  snapshot: {
    phase: string;
    milestoneProgress: string;
    slicesComplete: string[];
  };
}

// ─── UAT Parsing ──────────────────────────────────────────────────────────────

/**
 * Parse a UAT markdown file into structured test checks.
 * Handles the standard UAT template format with:
 * - ## Smoke Test
 * - ## Test Cases → ### N. Name
 * - ## Edge Cases → ### Name
 * - ## Preconditions
 */
export function parseUatIntoChecks(content: string, sliceId: string): ManualTestCheck[] {
  const checks: ManualTestCheck[] = [];
  const preconditions = extractSection(content, "Preconditions") ?? "";

  const base = {
    sliceId,
    preconditions,
    verdict: null as TestVerdict | null,
    notes: "",
    timestamp: "",
  };

  // Smoke test
  const smokeSection = extractSection(content, "Smoke Test");
  if (smokeSection) {
    const { steps, expected } = parseStepsAndExpected(smokeSection);
    checks.push({
      ...base,
      id: `${sliceId}-smoke`,
      name: "Smoke Test",
      category: "smoke",
      steps: steps.length > 0 ? steps : [smokeSection.trim()],
      expected: expected || "Basic functionality works",
    });
  }

  // Test Cases (### N. Name format)
  const testCasesSection = extractSection(content, "Test Cases");
  if (testCasesSection) {
    const subSections = extractAllSections(testCasesSection, 3);
    let tcIndex = 1;
    for (const [heading, body] of subSections) {
      const { steps, expected } = parseStepsAndExpected(body);
      // Strip leading number+dot from heading: "1. User Login" → "User Login"
      const name = heading.replace(/^\d+\.\s*/, "").trim();
      checks.push({
        ...base,
        id: `${sliceId}-TC${String(tcIndex).padStart(2, "0")}`,
        name,
        category: "test-case",
        steps,
        expected,
      });
      tcIndex++;
    }
  }

  // Edge Cases (### Name format)
  const edgeCasesSection = extractSection(content, "Edge Cases");
  if (edgeCasesSection) {
    const subSections = extractAllSections(edgeCasesSection, 3);
    let ecIndex = 1;
    for (const [heading, body] of subSections) {
      const { steps, expected } = parseStepsAndExpected(body);
      const name = heading.replace(/^\d+\.\s*/, "").trim();
      checks.push({
        ...base,
        id: `${sliceId}-EC${String(ecIndex).padStart(2, "0")}`,
        name,
        category: "edge-case",
        steps,
        expected,
      });
      ecIndex++;
    }
  }

  return checks;
}

/**
 * Extract numbered steps and the **Expected:** line from a test case body.
 */
function parseStepsAndExpected(body: string): { steps: string[]; expected: string } {
  const lines = body.split("\n").map(l => l.trim()).filter(Boolean);
  const steps: string[] = [];
  let expected = "";

  for (const line of lines) {
    // Match "**Expected:**" in any form
    const expectedMatch = line.match(/^\*?\*?Expected:?\*?\*?\s*(.+)/i);
    if (expectedMatch) {
      expected = expectedMatch[1].trim();
      continue;
    }
    // Match numbered steps: "1. step" or "- step"
    const stepMatch = line.match(/^(?:\d+\.\s*|-\s+)(.+)/);
    if (stepMatch) {
      // If the step itself contains "Expected:", split it
      const innerExpected = stepMatch[1].match(/^\*?\*?Expected:?\*?\*?\s*(.+)/i);
      if (innerExpected) {
        expected = innerExpected[1].trim();
      } else {
        steps.push(stepMatch[1].trim());
      }
    }
  }

  return { steps, expected };
}

// ─── Smart Test Case Generation ───────────────────────────────────────────────

/** A testable signal extracted from source code via heuristic regex matching. */
export interface TestableSignal {
  /** Signal category: api-route, react-component, validation, error-handler, cli-command, exported-function */
  type: string;
  /** Matched code context (the line or pattern that matched) */
  context: string;
  /** Human-readable description of what's testable about this signal */
  testableAspect: string;
}

/** Binary/media file extensions to skip during source file collection. */
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp",
  ".woff", ".woff2", ".ttf", ".eot", ".svg",
  ".mp3", ".mp4", ".wav", ".ogg",
  ".zip", ".tar", ".gz", ".bz2",
  ".pdf", ".doc", ".docx",
  ".exe", ".dll", ".so", ".dylib",
]);

/** Maximum file size in bytes for source file reading (100KB). */
const MAX_SOURCE_FILE_SIZE = 100 * 1024;

/** Maximum signals to return per file to avoid flooding from large files. */
const MAX_SIGNALS_PER_FILE = 10;

/**
 * Collect source file paths referenced in task SUMMARY and PLAN artifacts.
 *
 * Reads task summaries for `frontmatter.key_files` and `filesModified[].path`,
 * and task plans for `outputFiles`. Deduplicates, resolves relative to basePath,
 * and filters out non-existent, binary, oversized, and out-of-basePath files.
 *
 * All I/O is synchronous.
 */
export function collectSourceFilePaths(
  basePath: string, milestoneId: string, sliceId: string,
): string[] {
  const rawPaths: string[] = [];
  const tasksDir = resolveTasksDir(basePath, milestoneId, sliceId);
  if (!tasksDir) return [];

  // Extract paths from task summaries
  const summaryFiles = resolveTaskFiles(tasksDir, "SUMMARY");
  for (const fileName of summaryFiles) {
    try {
      const content = readFileSync(join(tasksDir, fileName), "utf-8");
      const summary = parseSummary(content);
      if (summary.frontmatter.key_files) {
        rawPaths.push(...summary.frontmatter.key_files);
      }
      if (summary.filesModified) {
        for (const fm of summary.filesModified) {
          if (fm.path) rawPaths.push(fm.path);
        }
      }
    } catch {
      // Skip unreadable summaries
    }
  }

  // Extract paths from task plans
  const planFiles = resolveTaskFiles(tasksDir, "PLAN");
  for (const fileName of planFiles) {
    try {
      const content = readFileSync(join(tasksDir, fileName), "utf-8");
      const io = parseTaskPlanIO(content);
      rawPaths.push(...io.outputFiles);
    } catch {
      // Skip unreadable plans
    }
  }

  // Deduplicate and resolve
  const seen = new Set<string>();
  const result: string[] = [];
  const resolvedBase = resolve(basePath);

  for (const rawPath of rawPaths) {
    if (!rawPath || typeof rawPath !== "string") continue;

    const absPath = rawPath.startsWith("/") ? rawPath : resolve(basePath, rawPath);
    const normalized = resolve(absPath); // normalize ../ etc.

    // Skip duplicates
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    // Skip paths outside basePath
    const rel = relative(resolvedBase, normalized);
    if (rel.startsWith("..") || resolve(resolvedBase, rel) !== normalized) continue;

    // Skip binary extensions
    const ext = extname(normalized).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) continue;

    // Skip non-existent files
    if (!existsSync(normalized)) continue;

    // Skip oversized files
    try {
      const stat = statSync(normalized);
      if (!stat.isFile() || stat.size > MAX_SOURCE_FILE_SIZE) continue;
    } catch {
      continue;
    }

    result.push(normalized);
  }

  return result;
}

// ─── Signal Extractors ────────────────────────────────────────────────────────

/**
 * Extract API route signals from source code.
 * Matches Express-style app/router methods, Next.js route handlers, and req.body/params patterns.
 */
export function extractApiRoutes(content: string): TestableSignal[] {
  const signals: TestableSignal[] = [];

  // Express-style: app.get('/path', ...) or router.post('/path', ...)
  const expressPattern = /(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  let match: RegExpExecArray | null;
  while ((match = expressPattern.exec(content)) !== null) {
    signals.push({
      type: "api-route",
      context: match[0],
      testableAspect: `${match[1].toUpperCase()} ${match[2]} endpoint — verify request/response`,
    });
  }

  // Next.js route handlers: export async function GET/POST/PUT/DELETE/PATCH
  const nextPattern = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)\s*\(/gi;
  while ((match = nextPattern.exec(content)) !== null) {
    signals.push({
      type: "api-route",
      context: match[0],
      testableAspect: `Next.js ${match[1]} handler — verify request handling and response`,
    });
  }

  return signals;
}

/**
 * Extract React component signals from source code.
 * Matches exported function/const components, useState, useEffect usage.
 */
export function extractReactComponents(content: string): TestableSignal[] {
  const signals: TestableSignal[] = [];

  // Named component exports: export function ComponentName or export const ComponentName
  const namedPattern = /export\s+(?:default\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9]*)/g;
  let match: RegExpExecArray | null;
  while ((match = namedPattern.exec(content)) !== null) {
    signals.push({
      type: "react-component",
      context: match[0],
      testableAspect: `<${match[1]} /> component — verify rendering and interactions`,
    });
  }

  // export default function (anonymous)
  if (/export\s+default\s+function\s*\(/.test(content) && signals.length === 0) {
    signals.push({
      type: "react-component",
      context: "export default function",
      testableAspect: "Default exported component — verify rendering",
    });
  }

  // useState hooks — indicate interactive state
  const useStatePattern = /useState\s*(?:<[^>]+>)?\s*\(\s*([^)]*)\)/g;
  while ((match = useStatePattern.exec(content)) !== null) {
    signals.push({
      type: "react-component",
      context: match[0],
      testableAspect: `State management — verify state transitions with initial value: ${match[1].slice(0, 40)}`,
    });
  }

  return signals;
}

/**
 * Extract validation-related signals from source code.
 * Matches Zod schemas, manual validation checks, and required field patterns.
 */
export function extractValidation(content: string): TestableSignal[] {
  const signals: TestableSignal[] = [];

  // Zod schemas: z.object, z.string, z.number, etc.
  const zodPattern = /(?:const|let|export\s+(?:const|let))\s+(\w+)\s*=\s*z\.(?:object|string|number|array|enum|union|intersection|literal|boolean)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = zodPattern.exec(content)) !== null) {
    signals.push({
      type: "validation",
      context: match[0],
      testableAspect: `Zod schema '${match[1]}' — verify valid input passes and invalid input is rejected`,
    });
  }

  // Manual validation: if (!x) throw / if (!x) return
  const manualPattern = /if\s*\(\s*!(\w+(?:\.\w+)?)\s*\)\s*(?:throw|return)/g;
  while ((match = manualPattern.exec(content)) !== null) {
    signals.push({
      type: "validation",
      context: match[0],
      testableAspect: `Required field check for '${match[1]}' — verify missing value is handled`,
    });
  }

  return signals;
}

/**
 * Extract error handling signals from source code.
 * Matches catch blocks, .catch(), error response patterns, and throw statements.
 */
export function extractErrorHandlers(content: string): TestableSignal[] {
  const signals: TestableSignal[] = [];

  // Error response patterns: res.status(4xx/5xx)
  const errorResPattern = /res\.status\s*\(\s*(4\d{2}|5\d{2})\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = errorResPattern.exec(content)) !== null) {
    signals.push({
      type: "error-handler",
      context: match[0],
      testableAspect: `Error response ${match[1]} — verify correct error status and message`,
    });
  }

  // try/catch blocks — just note their presence for testability
  const catchPattern = /catch\s*\(\s*(\w+)\s*\)\s*\{/g;
  while ((match = catchPattern.exec(content)) !== null) {
    signals.push({
      type: "error-handler",
      context: match[0],
      testableAspect: `Error handler (catch ${match[1]}) — verify errors are caught and handled gracefully`,
    });
  }

  // throw new Error
  const throwPattern = /throw\s+new\s+(\w*Error)\s*\(\s*['"`]([^'"`]{0,60})/g;
  while ((match = throwPattern.exec(content)) !== null) {
    signals.push({
      type: "error-handler",
      context: match[0],
      testableAspect: `Throws ${match[1]}: "${match[2]}" — verify error is thrown under expected conditions`,
    });
  }

  return signals;
}

/**
 * Extract CLI command signals from source code.
 * Matches commander/yargs command registrations and handler patterns.
 */
export function extractCliCommands(content: string): TestableSignal[] {
  const signals: TestableSignal[] = [];

  // .command('name', ...) — commander, yargs, etc.
  const commandPattern = /\.command\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let match: RegExpExecArray | null;
  while ((match = commandPattern.exec(content)) !== null) {
    signals.push({
      type: "cli-command",
      context: match[0],
      testableAspect: `CLI command '${match[1]}' — verify command executes correctly with valid/invalid args`,
    });
  }

  return signals;
}

/**
 * Extract exported function signals from source code.
 * Serves as a fallback for functions not caught by specific extractors.
 */
export function extractExportedFunctions(content: string): TestableSignal[] {
  const signals: TestableSignal[] = [];

  // export function name or export const name =
  const exportPattern = /export\s+(?:async\s+)?(?:function|const)\s+([a-z_$][\w$]*)/gi;
  let match: RegExpExecArray | null;
  while ((match = exportPattern.exec(content)) !== null) {
    const name = match[1];
    // Skip PascalCase (those are components, handled by extractReactComponents)
    if (/^[A-Z]/.test(name)) continue;
    signals.push({
      type: "exported-function",
      context: match[0],
      testableAspect: `Exported function '${name}' — verify expected behavior with representative inputs`,
    });
  }

  // export default function (lowercase)
  const defaultPattern = /export\s+default\s+(?:async\s+)?function\s+([a-z_$][\w$]*)/gi;
  while ((match = defaultPattern.exec(content)) !== null) {
    signals.push({
      type: "exported-function",
      context: match[0],
      testableAspect: `Default export '${match[1]}' — verify expected behavior`,
    });
  }

  return signals;
}

/**
 * Run all signal extractors on a source file's content and return combined results.
 * Applies a relevance cap: prioritizes routes > validation > error handlers > components > CLI > exports.
 * Returns at most MAX_SIGNALS_PER_FILE signals.
 */
export function extractSignalsFromFile(filePath: string, content: string): TestableSignal[] {
  // Run all extractors
  const routes = extractApiRoutes(content);
  const validation = extractValidation(content);
  const errorHandlers = extractErrorHandlers(content);
  const components = extractReactComponents(content);
  const cliCommands = extractCliCommands(content);
  const exports = extractExportedFunctions(content);

  // Prioritized merge: routes > validation > error handlers > components > CLI > exports
  const all: TestableSignal[] = [
    ...routes,
    ...validation,
    ...errorHandlers,
    ...components,
    ...cliCommands,
    ...exports,
  ];

  // Deduplicate by context (same matched text shouldn't produce duplicate signals)
  const seen = new Set<string>();
  const deduped: TestableSignal[] = [];
  for (const signal of all) {
    const key = `${signal.type}:${signal.context}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(signal);
    }
  }

  return deduped.slice(0, MAX_SIGNALS_PER_FILE);
}

// ─── Check Synthesizer ────────────────────────────────────────────────────────

/** Maximum total checks produced by the smart generation pipeline. */
const MAX_SMART_CHECKS = 15;

/** Plan context used by the synthesizer to ground checks in slice goals. */
export interface PlanContext {
  goal: string;
  taskTitles: string[];
  verifyFields: string[];
}

/**
 * Synthesize ManualTestCheck objects from extracted code signals and plan context.
 *
 * Groups signals by type and generates concrete, code-aware checks:
 * - API routes → HTTP method + path + expected status
 * - React components → component name + UI interaction
 * - Validation → specific invalid-input edge cases
 * - Error handlers → error-path edge cases
 * - Exported functions → smoke-level function calls
 *
 * Prioritizes: smoke (1 goal check) > test-case (routes, components) > edge-case (validation, errors).
 * Caps total at MAX_SMART_CHECKS (~15).
 */
export function synthesizeChecks(
  signals: TestableSignal[],
  sliceId: string,
  planContext: PlanContext,
): ManualTestCheck[] {
  if (signals.length === 0) return [];

  const checks: ManualTestCheck[] = [];
  const base = {
    sliceId,
    preconditions: "",
    verdict: null as TestVerdict | null,
    notes: "",
    timestamp: "",
  };

  // 1. Goal-level smoke check from plan context (always first if goal exists)
  if (planContext.goal) {
    checks.push({
      ...base,
      id: `${sliceId}-smoke`,
      name: "Goal Verification",
      category: "smoke",
      steps: [`Verify: ${planContext.goal}`],
      expected: planContext.goal,
      preconditions: "(Auto-generated from code analysis)",
    });
  }

  // Group signals by type
  const grouped: Record<string, TestableSignal[]> = {};
  for (const sig of signals) {
    if (!grouped[sig.type]) grouped[sig.type] = [];
    grouped[sig.type].push(sig);
  }

  let tcIdx = 1;
  let ecIdx = 1;

  // 2. API route signals → test-case checks with HTTP detail
  for (const sig of grouped["api-route"] ?? []) {
    const methodMatch = sig.testableAspect.match(/^(GET|POST|PUT|DELETE|PATCH)\s+(\S+)/i);
    const nextMatch = sig.testableAspect.match(/Next\.js\s+(GET|POST|PUT|DELETE|PATCH)/i);
    if (methodMatch) {
      const method = methodMatch[1].toUpperCase();
      const path = methodMatch[2];
      checks.push({
        ...base,
        id: `${sliceId}-TC${String(tcIdx).padStart(2, "0")}`,
        name: `${method} ${path}`,
        category: "test-case",
        steps: [
          `Send ${method} request to ${path}`,
          method === "POST" || method === "PUT" || method === "PATCH"
            ? `Include valid JSON body with required fields`
            : `Include any required query parameters`,
          `Verify response status is 2xx`,
        ],
        expected: `${method} ${path} returns a successful response with expected data shape`,
      });
      tcIdx++;
    } else if (nextMatch) {
      const method = nextMatch[1].toUpperCase();
      checks.push({
        ...base,
        id: `${sliceId}-TC${String(tcIdx).padStart(2, "0")}`,
        name: `Next.js ${method} handler`,
        category: "test-case",
        steps: [
          `Send ${method} request to the route handler endpoint`,
          `Verify response status and JSON structure`,
        ],
        expected: `${method} handler returns expected response`,
      });
      tcIdx++;
    }
  }

  // 3. React component signals → test-case checks with component names
  for (const sig of grouped["react-component"] ?? []) {
    if (sig.testableAspect.includes("State management")) continue; // skip useState detail signals
    const compMatch = sig.testableAspect.match(/<(\w+)\s*\/>/);
    const compName = compMatch ? compMatch[1] : "Component";
    checks.push({
      ...base,
      id: `${sliceId}-TC${String(tcIdx).padStart(2, "0")}`,
      name: `${compName} renders correctly`,
      category: "test-case",
      steps: [
        `Navigate to the page containing <${compName} />`,
        `Verify the component renders without errors`,
        `Interact with primary controls (buttons, inputs) if present`,
      ],
      expected: `<${compName} /> renders with expected content and responds to user interaction`,
    });
    tcIdx++;
  }

  // 4. Validation signals → edge-case checks with specific invalid inputs
  for (const sig of grouped["validation"] ?? []) {
    const zodMatch = sig.testableAspect.match(/Zod schema '(\w+)'/);
    const fieldMatch = sig.testableAspect.match(/Required field check for '(\w+(?:\.\w+)?)'/);
    if (zodMatch) {
      checks.push({
        ...base,
        id: `${sliceId}-EC${String(ecIdx).padStart(2, "0")}`,
        name: `${zodMatch[1]} rejects invalid input`,
        category: "edge-case",
        steps: [
          `Submit data that violates the '${zodMatch[1]}' schema (e.g., missing required fields, wrong types)`,
          `Verify a validation error is returned with a descriptive message`,
        ],
        expected: `Invalid input is rejected with a clear validation error`,
      });
      ecIdx++;
    } else if (fieldMatch) {
      checks.push({
        ...base,
        id: `${sliceId}-EC${String(ecIdx).padStart(2, "0")}`,
        name: `Missing '${fieldMatch[1]}' is handled`,
        category: "edge-case",
        steps: [
          `Submit request or call function with '${fieldMatch[1]}' missing or empty`,
          `Verify the error is handled gracefully (error response or thrown error)`,
        ],
        expected: `Missing '${fieldMatch[1]}' produces a clear error, not a crash`,
      });
      ecIdx++;
    }
  }

  // 5. Error handler signals → edge-case checks
  for (const sig of grouped["error-handler"] ?? []) {
    const statusMatch = sig.testableAspect.match(/Error response (\d{3})/);
    const throwMatch = sig.testableAspect.match(/Throws (\w+):\s*"([^"]+)"/);
    if (statusMatch) {
      checks.push({
        ...base,
        id: `${sliceId}-EC${String(ecIdx).padStart(2, "0")}`,
        name: `Triggers ${statusMatch[1]} error response`,
        category: "edge-case",
        steps: [
          `Send a request designed to trigger the ${statusMatch[1]} error path`,
          `Verify response status is ${statusMatch[1]} with an error message body`,
        ],
        expected: `Returns HTTP ${statusMatch[1]} with descriptive error`,
      });
      ecIdx++;
    } else if (throwMatch) {
      checks.push({
        ...base,
        id: `${sliceId}-EC${String(ecIdx).padStart(2, "0")}`,
        name: `${throwMatch[1]}: ${throwMatch[2]}`,
        category: "edge-case",
        steps: [
          `Trigger the condition that causes: ${throwMatch[2]}`,
          `Verify the error is thrown or surfaced to the user`,
        ],
        expected: `${throwMatch[1]} is thrown with message "${throwMatch[2]}"`,
      });
      ecIdx++;
    }
    // Skip generic catch-block signals — not actionable enough
  }

  // 6. CLI command signals → test-case checks
  for (const sig of grouped["cli-command"] ?? []) {
    const cmdMatch = sig.testableAspect.match(/CLI command '([^']+)'/);
    if (cmdMatch) {
      checks.push({
        ...base,
        id: `${sliceId}-TC${String(tcIdx).padStart(2, "0")}`,
        name: `CLI: ${cmdMatch[1]}`,
        category: "test-case",
        steps: [
          `Run the '${cmdMatch[1]}' command with valid arguments`,
          `Verify it completes successfully with expected output`,
        ],
        expected: `'${cmdMatch[1]}' command runs without errors`,
      });
      tcIdx++;
    }
  }

  // 7. Exported function signals → smoke checks (only if we have room)
  for (const sig of grouped["exported-function"] ?? []) {
    const fnMatch = sig.testableAspect.match(/Exported function '(\w+)'/);
    if (fnMatch) {
      checks.push({
        ...base,
        id: `${sliceId}-TC${String(tcIdx).padStart(2, "0")}`,
        name: `${fnMatch[1]}() works`,
        category: "test-case",
        steps: [
          `Call ${fnMatch[1]}() with representative inputs`,
          `Verify it returns expected output without throwing`,
        ],
        expected: `${fnMatch[1]}() returns expected result`,
      });
      tcIdx++;
    }
  }

  // Cap total checks: prioritize smoke > test-case > edge-case
  if (checks.length <= MAX_SMART_CHECKS) return checks;

  const smoke = checks.filter(c => c.category === "smoke");
  const testCases = checks.filter(c => c.category === "test-case");
  const edgeCases = checks.filter(c => c.category === "edge-case");

  const capped: ManualTestCheck[] = [...smoke];
  const remaining = MAX_SMART_CHECKS - capped.length;
  const tcSlots = Math.min(testCases.length, Math.ceil(remaining * 0.6));
  const ecSlots = Math.min(edgeCases.length, remaining - tcSlots);

  capped.push(...testCases.slice(0, tcSlots));
  capped.push(...edgeCases.slice(0, ecSlots));

  // Fill any leftover slots
  if (capped.length < MAX_SMART_CHECKS) {
    const leftover = MAX_SMART_CHECKS - capped.length;
    const usedTc = testCases.slice(tcSlots, tcSlots + leftover);
    capped.push(...usedTc);
  }
  if (capped.length < MAX_SMART_CHECKS) {
    const leftover = MAX_SMART_CHECKS - capped.length;
    capped.push(...edgeCases.slice(ecSlots, ecSlots + leftover));
  }

  return capped.slice(0, MAX_SMART_CHECKS);
}

/**
 * Orchestrate the full smart test generation pipeline:
 *   collectSourceFilePaths → readFileSync → extractSignalsFromFile → synthesizeChecks
 *
 * Reads the slice PLAN to extract goal, task titles, and verify fields for context.
 * Returns enriched ManualTestCheck[], or empty array if nothing useful was extracted.
 */
export function generateSmartChecks(
  basePath: string, milestoneId: string, sliceId: string,
): ManualTestCheck[] {
  // 1. Collect source file paths from task artifacts
  const filePaths = collectSourceFilePaths(basePath, milestoneId, sliceId);

  // 2. Extract signals from each file
  const allSignals: TestableSignal[] = [];
  for (const fp of filePaths) {
    try {
      const content = readFileSync(fp, "utf-8");
      const signals = extractSignalsFromFile(fp, content);
      allSignals.push(...signals);
    } catch {
      // Skip unreadable files — don't break the pipeline
    }
  }

  if (allSignals.length === 0) return [];

  // 3. Read plan context
  const planContext = readPlanContext(basePath, milestoneId, sliceId);

  // 4. Synthesize checks
  return synthesizeChecks(allSignals, sliceId, planContext);
}

/**
 * Read the slice PLAN file to extract goal, task titles, and verify fields
 * for grounding synthesized checks in plan intent.
 */
function readPlanContext(
  basePath: string, milestoneId: string, sliceId: string,
): PlanContext {
  const planFile = resolveSliceFile(basePath, milestoneId, sliceId, "PLAN");
  if (!planFile || !existsSync(planFile)) {
    return { goal: "", taskTitles: [], verifyFields: [] };
  }

  try {
    const content = readFileSync(planFile, "utf-8");

    // Extract goal
    const goalMatch = content.match(/^\*\*Goal:\*\*\s*(.+)$/m);
    const goal = goalMatch ? goalMatch[1].trim() : "";

    // Extract task titles from task list: - [ ] **T01: Title** or - [x] **T01: Title**
    const taskTitles: string[] = [];
    const taskPattern = /- \[[ x]\] \*\*(T\d+):\s*(.+?)\*\*/g;
    let match: RegExpExecArray | null;
    while ((match = taskPattern.exec(content)) !== null) {
      taskTitles.push(`${match[1]}: ${match[2].trim()}`);
    }

    // Extract verify fields from task blocks
    const verifyFields: string[] = [];
    const verifyPattern = /[-•]\s*Verify:\s*(.+)/gi;
    while ((match = verifyPattern.exec(content)) !== null) {
      verifyFields.push(match[1].trim());
    }

    return { goal, taskTitles, verifyFields };
  } catch {
    return { goal: "", taskTitles: [], verifyFields: [] };
  }
}

// ─── Test Case Gathering ──────────────────────────────────────────────────────

/**
 * Gather test checks for a specific slice from its UAT file.
 * Falls back to smart code-aware generation, then to plan-text generation.
 *
 * Fallback chain: UAT file → smart code-aware generation → plan-text generation
 */
export function gatherChecksForSlice(
  basePath: string, milestoneId: string, sliceId: string,
): ManualTestCheck[] {
  // Try UAT file first (highest priority)
  const uatFile = resolveSliceFile(basePath, milestoneId, sliceId, "UAT");
  if (uatFile && existsSync(uatFile)) {
    const content = readFileSync(uatFile, "utf-8");
    const checks = parseUatIntoChecks(content, sliceId);
    if (checks.length > 0) return checks;
  }

  // Try smart code-aware generation (NEW — inserted between UAT and plan-text)
  const smartChecks = generateSmartChecks(basePath, milestoneId, sliceId);
  if (smartChecks.length > 0) return smartChecks;

  // Fallback: generate from PLAN, SUMMARY, and roadmap context
  return generateChecksFromPlan(basePath, milestoneId, sliceId);
}

/**
 * Gather test checks across all completed slices in a milestone.
 * Falls back to plan-based generation per-slice if no UAT exists.
 */
export function gatherChecksForAllSlices(
  basePath: string, milestoneId: string,
): ManualTestCheck[] {
  const completedSliceIds = getCompletedSliceIds(basePath, milestoneId);
  const allChecks: ManualTestCheck[] = [];

  for (const sid of completedSliceIds) {
    allChecks.push(...gatherChecksForSlice(basePath, milestoneId, sid));
  }

  // If still empty, try roadmap-level success criteria as a last resort
  if (allChecks.length === 0) {
    allChecks.push(...generateChecksFromRoadmap(basePath, milestoneId));
  }

  return allChecks;
}

/**
 * Generate test checks from a slice's PLAN file.
 * Extracts: Goal (smoke test), Verification items, Must-Haves,
 * and per-task Verify fields.
 */
function generateChecksFromPlan(
  basePath: string, milestoneId: string, sliceId: string,
): ManualTestCheck[] {
  const checks: ManualTestCheck[] = [];
  const base = {
    sliceId,
    preconditions: "",
    verdict: null as TestVerdict | null,
    notes: "",
    timestamp: "",
  };

  // Read the PLAN file
  const planFile = resolveSliceFile(basePath, milestoneId, sliceId, "PLAN");
  if (!planFile || !existsSync(planFile)) return checks;
  const planContent = readFileSync(planFile, "utf-8");

  // Extract goal for a smoke test
  const goalMatch = planContent.match(/^\*\*Goal:\*\*\s*(.+)$/m);
  if (goalMatch) {
    checks.push({
      ...base,
      id: `${sliceId}-smoke`,
      name: "Goal Verification",
      category: "smoke",
      steps: [`Verify: ${goalMatch[1].trim()}`],
      expected: goalMatch[1].trim(),
    });
  }

  // Extract Verification section items
  const verificationSection = extractSection(planContent, "Verification");
  if (verificationSection) {
    const bullets = parseBullets(verificationSection);
    let vIdx = 1;
    for (const bullet of bullets) {
      if (!bullet || bullet.startsWith("#")) continue;
      checks.push({
        ...base,
        id: `${sliceId}-VER${String(vIdx).padStart(2, "0")}`,
        name: `Verify: ${bullet.slice(0, 80)}`,
        category: "test-case",
        steps: [bullet],
        expected: "Passes successfully",
      });
      vIdx++;
    }
  }

  // Extract per-task Verify fields from the Tasks section
  const tasksSection = extractSection(planContent, "Tasks");
  if (tasksSection) {
    const taskBlocks = tasksSection.split(/^- \[[ x]\] \*\*/m).filter(Boolean);
    let tIdx = 1;
    for (const block of taskBlocks) {
      // Extract task title
      const titleMatch = block.match(/^(T\d+):\s*(.+?)\*\*/);
      const taskTitle = titleMatch ? titleMatch[2].trim() : `Task ${tIdx}`;
      const taskId = titleMatch ? titleMatch[1] : `T${String(tIdx).padStart(2, "0")}`;

      // Extract Verify field
      const verifyMatch = block.match(/[-•]\s*Verify:\s*(.+)/i);
      if (verifyMatch) {
        checks.push({
          ...base,
          id: `${sliceId}-${taskId}`,
          name: `${taskTitle}`,
          category: "test-case",
          steps: [`Run: ${verifyMatch[1].trim()}`],
          expected: "Verification passes",
        });
      }

      // Extract "Done when" field as an additional check
      const doneMatch = block.match(/[-•]\s*Done when:\s*(.+)/i);
      if (doneMatch && !verifyMatch) {
        checks.push({
          ...base,
          id: `${sliceId}-${taskId}`,
          name: `${taskTitle}`,
          category: "test-case",
          steps: [`Confirm: ${doneMatch[1].trim()}`],
          expected: doneMatch[1].trim(),
        });
      }
      tIdx++;
    }
  }

  // If PLAN didn't yield much, try the SUMMARY (if it exists)
  if (checks.length <= 1) {
    const summaryFile = resolveSliceFile(basePath, milestoneId, sliceId, "SUMMARY");
    if (summaryFile && existsSync(summaryFile)) {
      const summaryContent = readFileSync(summaryFile, "utf-8");
      const whatHappened = extractSection(summaryContent, "What Happened");
      if (whatHappened) {
        const bullets = parseBullets(whatHappened);
        let sIdx = 1;
        for (const bullet of bullets.slice(0, 5)) {
          if (!bullet) continue;
          checks.push({
            ...base,
            id: `${sliceId}-SUM${String(sIdx).padStart(2, "0")}`,
            name: `Verify: ${bullet.slice(0, 80)}`,
            category: "test-case",
            steps: [`Confirm that: ${bullet}`],
            expected: "Feature works as described",
          });
          sIdx++;
        }
      }
    }
  }

  // Tag auto-generated checks with a preconditions note
  if (checks.length > 0) {
    checks[0].preconditions = "(Auto-generated from slice plan — no UAT file found)";
  }

  return checks;
}

/**
 * Generate test checks from the milestone roadmap's success criteria.
 * Last-resort fallback when no slice-level context yields checks.
 */
function generateChecksFromRoadmap(
  basePath: string, milestoneId: string,
): ManualTestCheck[] {
  const checks: ManualTestCheck[] = [];
  const roadmapFile = resolveMilestoneFile(basePath, milestoneId, "ROADMAP");
  if (!roadmapFile || !existsSync(roadmapFile)) return checks;

  const content = readFileSync(roadmapFile, "utf-8");
  const successSection = extractSection(content, "Success Criteria");
  if (!successSection) return checks;

  const bullets = parseBullets(successSection);
  let idx = 1;
  for (const bullet of bullets) {
    if (!bullet) continue;
    checks.push({
      sliceId: milestoneId,
      preconditions: idx === 1 ? "(Auto-generated from roadmap success criteria — no UAT files found)" : "",
      verdict: null,
      notes: "",
      timestamp: "",
      id: `${milestoneId}-SC${String(idx).padStart(2, "0")}`,
      name: bullet.slice(0, 100),
      category: "test-case",
      steps: [`Verify: ${bullet}`],
      expected: bullet,
    });
    idx++;
  }

  return checks;
}

/**
 * Get IDs of completed slices for a milestone.
 */
export function getCompletedSliceIds(basePath: string, milestoneId: string): string[] {
  if (isDbAvailable()) {
    return getMilestoneSlices(milestoneId)
      .filter((s: SliceRow) => s.status === "complete")
      .map((s: SliceRow) => s.id);
  }
  return [];
}

// ─── Session Management ───────────────────────────────────────────────────────

/**
 * Compute summary counts from a session's checks.
 */
export function sessionCounts(session: ManualTestSession): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  pending: number;
} {
  const total = session.checks.length;
  let passed = 0, failed = 0, skipped = 0, pending = 0;
  for (const c of session.checks) {
    if (c.verdict === "pass") passed++;
    else if (c.verdict === "fail") failed++;
    else if (c.verdict === "skip") skipped++;
    else pending++;
  }
  return { total, passed, failed, skipped, pending };
}

/**
 * Generate the markdown result artifact for a completed manual test session.
 */
export function renderManualTestResult(session: ManualTestSession): string {
  const counts = sessionCounts(session);
  const verdict = counts.failed > 0 ? "FAIL" : counts.skipped > 0 ? "PARTIAL" : "PASS";

  const lines: string[] = [];

  lines.push("---");
  lines.push(`type: manual-test-result`);
  lines.push(`milestoneId: ${session.milestoneId}`);
  if (session.sliceId) lines.push(`sliceId: ${session.sliceId}`);
  lines.push(`verdict: ${verdict}`);
  lines.push(`date: ${session.completedAt ?? new Date().toISOString()}`);
  lines.push(`totalChecks: ${counts.total}`);
  lines.push(`passed: ${counts.passed}`);
  lines.push(`failed: ${counts.failed}`);
  lines.push(`skipped: ${counts.skipped}`);
  lines.push("---");
  lines.push("");
  lines.push(`# Manual Test Result${session.sliceId ? ` — ${session.sliceId}` : " — All Slices"}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped out of ${counts.total} checks.`);
  lines.push("");

  // Results table
  lines.push("## Results");
  lines.push("");
  lines.push("| # | Slice | Check | Verdict | Notes |");
  lines.push("|---|-------|-------|---------|-------|");

  for (let i = 0; i < session.checks.length; i++) {
    const c = session.checks[i];
    const icon = c.verdict === "pass" ? "✓ PASS" : c.verdict === "fail" ? "✗ FAIL" : c.verdict === "skip" ? "– SKIP" : "○ PENDING";
    const notes = c.notes ? c.notes.replace(/\|/g, "\\|").replace(/\n/g, " ") : "";
    lines.push(`| ${i + 1} | ${c.sliceId} | ${c.name} | ${icon} | ${notes} |`);
  }
  lines.push("");

  // Failed checks detail
  const failed = session.checks.filter(c => c.verdict === "fail");
  if (failed.length > 0) {
    lines.push("## Failed Checks Detail");
    lines.push("");
    for (const c of failed) {
      lines.push(`### ${c.id}: ${c.name}`);
      lines.push(`- **Slice:** ${c.sliceId}`);
      if (c.steps.length > 0) {
        lines.push(`- **Steps:** ${c.steps.join(" → ")}`);
      }
      if (c.expected) {
        lines.push(`- **Expected:** ${c.expected}`);
      }
      lines.push(`- **Actual (user notes):** ${c.notes}`);
      lines.push("");
    }
  }

  // State snapshot
  lines.push("## State Snapshot");
  lines.push("");
  lines.push(`- Phase: ${session.snapshot.phase}`);
  lines.push(`- Milestone: ${session.milestoneId} (${session.snapshot.milestoneProgress})`);
  if (session.snapshot.slicesComplete.length > 0) {
    lines.push(`- Tested after: ${session.snapshot.slicesComplete.join(", ")} complete`);
  }

  return lines.join("\n");
}

/**
 * Build the prompt for the agent to fix manual test failures.
 */
export function buildFixManualTestsPrompt(session: ManualTestSession, basePath: string): string {
  const failed = session.checks.filter(c => c.verdict === "fail");
  if (failed.length === 0) return "";

  const lines: string[] = [];
  lines.push(`You are executing GSD auto-mode.\n`);
  lines.push(`## UNIT: Fix Manual Test Failures — ${session.milestoneId}${session.sliceId ? `/${session.sliceId}` : ""}\n`);
  lines.push(`## Working Directory\n`);
  lines.push(`Your working directory is \`${basePath}\`. All file reads, writes, and shell commands MUST operate relative to this directory.\n`);
  lines.push(`---\n`);
  lines.push(`## Manual Test Failures\n`);
  lines.push(`The user ran manual testing and found ${failed.length} failure(s). Fix each one.\n`);

  for (const c of failed) {
    lines.push(`### ${c.id}: ${c.name}`);
    lines.push(`- **Slice:** ${c.sliceId}`);
    if (c.steps.length > 0) {
      lines.push(`- **Steps to reproduce:** ${c.steps.join(" → ")}`);
    }
    if (c.expected) {
      lines.push(`- **Expected:** ${c.expected}`);
    }
    lines.push(`- **User reported:** ${c.notes}`);
    lines.push("");
  }

  lines.push("## Instructions\n");
  lines.push("For each failure:");
  lines.push("1. Read the relevant source code for the failing feature");
  lines.push("2. Diagnose the root cause based on the user's notes");
  lines.push("3. Fix the code");
  lines.push("4. Verify the fix addresses the specific complaint");
  lines.push("5. Run any existing tests to ensure no regressions\n");
  lines.push("After fixing all failures, summarize what was changed.\n");
  lines.push(`When done, say: "Manual test fixes complete — ${failed.length} issue(s) addressed."`);

  return lines.join("\n");
}
