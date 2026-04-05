/**
 * Tests for smart test case generation: collectSourceFilePaths() and signal extractors.
 *
 * Uses temp directories with mock task SUMMARY/PLAN artifacts to verify the collector,
 * and inline code snippets to verify each extractor individually.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  collectSourceFilePaths,
  extractApiRoutes,
  extractReactComponents,
  extractValidation,
  extractErrorHandlers,
  extractCliCommands,
  extractExportedFunctions,
  extractSignalsFromFile,
  synthesizeChecks,
  generateSmartChecks,
  gatherChecksForSlice,
} from "../manual-test.ts";
import type { TestableSignal, PlanContext } from "../manual-test.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let tempDir: string;
let cleanupDirs: string[] = [];

function createTempProject(): string {
  const dir = join(tmpdir(), `gsd-smart-gen-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  cleanupDirs.push(dir);
  return dir;
}

function setupGsdStructure(base: string, milestoneId: string, sliceId: string): string {
  const tasksDir = join(base, ".gsd", "milestones", milestoneId, "slices", sliceId, "tasks");
  mkdirSync(tasksDir, { recursive: true });
  return tasksDir;
}

function writeSummaryFile(tasksDir: string, taskId: string, opts: {
  keyFiles?: string[];
  filesModified?: Array<{ path: string; description: string }>;
}): void {
  const keyFilesYaml = (opts.keyFiles ?? []).map(f => `  - ${f}`).join("\n");
  const fmLines = [
    "---",
    `id: ${taskId}`,
    "parent: S01",
    "milestone: M001",
    "provides: []",
    "key_files:",
    keyFilesYaml || "  []",
    "key_decisions: []",
    "patterns_established: []",
    "observability_surfaces: []",
    "duration: 30m",
    "verification_result: passed",
    "completed_at: 2026-01-01T00:00:00Z",
    "blocker_discovered: false",
    "---",
    "",
    `# ${taskId}: Test Task`,
    "",
    "**Did something**",
    "",
    "## What Happened",
    "",
    "Something happened.",
    "",
  ];

  if (opts.filesModified && opts.filesModified.length > 0) {
    fmLines.push("## Files Created/Modified", "");
    for (const fm of opts.filesModified) {
      fmLines.push(`- \`${fm.path}\` — ${fm.description}`);
    }
    fmLines.push("");
  }

  writeFileSync(join(tasksDir, `${taskId}-SUMMARY.md`), fmLines.join("\n"));
}

function writePlanFile(tasksDir: string, taskId: string, opts: {
  outputFiles?: string[];
}): void {
  const outputLines = (opts.outputFiles ?? []).map(f => `- \`${f}\` — output file`);
  const content = [
    "---",
    "estimated_steps: 10",
    "estimated_files: 2",
    "skills_used: []",
    "---",
    "",
    `# ${taskId}: Test Task`,
    "",
    "## Description",
    "",
    "A test task.",
    "",
    "## Inputs",
    "",
    "- `src/input.ts` — input file",
    "",
    "## Expected Output",
    "",
    ...outputLines,
    "",
  ].join("\n");
  writeFileSync(join(tasksDir, `${taskId}-PLAN.md`), content);
}

// ═══════════════════════════════════════════════════════════════════════════════
// collectSourceFilePaths
// ═══════════════════════════════════════════════════════════════════════════════

describe("collectSourceFilePaths", () => {
  afterEach(() => {
    for (const dir of cleanupDirs) {
      try { rmSync(dir, { recursive: true, force: true }); } catch {}
    }
    cleanupDirs = [];
  });

  test("collects key_files from task summaries", () => {
    const base = createTempProject();
    const tasksDir = setupGsdStructure(base, "M001", "S01");

    // Create a source file that the summary references
    const srcDir = join(base, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "app.ts"), "export function main() {}");

    writeSummaryFile(tasksDir, "T01", {
      keyFiles: ["src/app.ts"],
    });

    const result = collectSourceFilePaths(base, "M001", "S01");
    assert.equal(result.length, 1, "should find one file");
    assert.ok(result[0].endsWith("src/app.ts"), "should resolve to src/app.ts");
  });

  test("collects filesModified paths from task summaries", () => {
    const base = createTempProject();
    const tasksDir = setupGsdStructure(base, "M001", "S01");

    const srcDir = join(base, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "handler.ts"), "export function handle() {}");

    writeSummaryFile(tasksDir, "T01", {
      filesModified: [{ path: "src/handler.ts", description: "Added handler" }],
    });

    const result = collectSourceFilePaths(base, "M001", "S01");
    assert.ok(result.some(p => p.endsWith("src/handler.ts")), "should include filesModified path");
  });

  test("collects outputFiles from task plans", () => {
    const base = createTempProject();
    const tasksDir = setupGsdStructure(base, "M001", "S01");

    const srcDir = join(base, "lib");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "output.ts"), "export const x = 1;");

    writePlanFile(tasksDir, "T01", {
      outputFiles: ["lib/output.ts"],
    });

    const result = collectSourceFilePaths(base, "M001", "S01");
    assert.ok(result.some(p => p.endsWith("lib/output.ts")), "should include plan output file");
  });

  test("deduplicates files referenced in multiple summaries", () => {
    const base = createTempProject();
    const tasksDir = setupGsdStructure(base, "M001", "S01");

    const srcDir = join(base, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "shared.ts"), "export const shared = true;");

    // Same file referenced in two different task summaries
    writeSummaryFile(tasksDir, "T01", { keyFiles: ["src/shared.ts"] });
    writeSummaryFile(tasksDir, "T02", { keyFiles: ["src/shared.ts"] });

    const result = collectSourceFilePaths(base, "M001", "S01");
    const sharedMatches = result.filter(p => p.endsWith("src/shared.ts"));
    assert.equal(sharedMatches.length, 1, "should deduplicate — same file appears once");
  });

  test("skips non-existent files", () => {
    const base = createTempProject();
    const tasksDir = setupGsdStructure(base, "M001", "S01");

    writeSummaryFile(tasksDir, "T01", {
      keyFiles: ["src/does-not-exist.ts"],
    });

    const result = collectSourceFilePaths(base, "M001", "S01");
    assert.equal(result.length, 0, "should skip non-existent file");
  });

  test("skips binary file extensions", () => {
    const base = createTempProject();
    const tasksDir = setupGsdStructure(base, "M001", "S01");

    const assetsDir = join(base, "assets");
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(join(assetsDir, "logo.png"), "fake png data");
    writeFileSync(join(assetsDir, "font.woff2"), "fake font data");

    writeSummaryFile(tasksDir, "T01", {
      keyFiles: ["assets/logo.png", "assets/font.woff2"],
    });

    const result = collectSourceFilePaths(base, "M001", "S01");
    assert.equal(result.length, 0, "should skip binary files");
  });

  test("skips files larger than 100KB", () => {
    const base = createTempProject();
    const tasksDir = setupGsdStructure(base, "M001", "S01");

    const srcDir = join(base, "src");
    mkdirSync(srcDir, { recursive: true });
    // Write a file just over 100KB
    writeFileSync(join(srcDir, "huge.ts"), "x".repeat(101 * 1024));

    writeSummaryFile(tasksDir, "T01", {
      keyFiles: ["src/huge.ts"],
    });

    const result = collectSourceFilePaths(base, "M001", "S01");
    assert.equal(result.length, 0, "should skip oversized file");
  });

  test("rejects paths outside basePath", () => {
    const base = createTempProject();
    const tasksDir = setupGsdStructure(base, "M001", "S01");

    // Create a file at an absolute path outside the project
    const outside = createTempProject();
    writeFileSync(join(outside, "secret.ts"), "export const s = 'x';");

    writeSummaryFile(tasksDir, "T01", {
      keyFiles: [join(outside, "secret.ts")],
    });

    const result = collectSourceFilePaths(base, "M001", "S01");
    assert.equal(result.length, 0, "should reject paths outside basePath");
  });

  test("handles empty tasks directory gracefully", () => {
    const base = createTempProject();
    setupGsdStructure(base, "M001", "S01");
    // No summary or plan files created

    const result = collectSourceFilePaths(base, "M001", "S01");
    assert.equal(result.length, 0, "should return empty for no task files");
  });

  test("handles missing tasks directory gracefully", () => {
    const base = createTempProject();
    // Don't create any .gsd structure

    const result = collectSourceFilePaths(base, "M001", "S01");
    assert.equal(result.length, 0, "should return empty when tasks dir doesn't exist");
  });

  test("handles summaries with empty key_files", () => {
    const base = createTempProject();
    const tasksDir = setupGsdStructure(base, "M001", "S01");

    const content = [
      "---",
      "id: T01",
      "parent: S01",
      "milestone: M001",
      "provides: []",
      "key_files: []",
      "key_decisions: []",
      "patterns_established: []",
      "observability_surfaces: []",
      "duration: 10m",
      "verification_result: passed",
      "completed_at: 2026-01-01T00:00:00Z",
      "blocker_discovered: false",
      "---",
      "",
      "# T01: Empty",
      "",
      "**Nothing**",
    ].join("\n");
    writeFileSync(join(tasksDir, "T01-SUMMARY.md"), content);

    const result = collectSourceFilePaths(base, "M001", "S01");
    assert.equal(result.length, 0, "should handle empty key_files gracefully");
  });

  test("handles plan files with no output section", () => {
    const base = createTempProject();
    const tasksDir = setupGsdStructure(base, "M001", "S01");

    const content = [
      "---",
      "estimated_steps: 5",
      "---",
      "",
      "# T01: No Output",
      "",
      "## Description",
      "",
      "A task with no Expected Output section.",
    ].join("\n");
    writeFileSync(join(tasksDir, "T01-PLAN.md"), content);

    const result = collectSourceFilePaths(base, "M001", "S01");
    assert.equal(result.length, 0, "should handle missing output section");
  });

  test("collects from both summaries and plans combined", () => {
    const base = createTempProject();
    const tasksDir = setupGsdStructure(base, "M001", "S01");

    const srcDir = join(base, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "from-summary.ts"), "export const a = 1;");
    writeFileSync(join(srcDir, "from-plan.ts"), "export const b = 2;");

    writeSummaryFile(tasksDir, "T01", { keyFiles: ["src/from-summary.ts"] });
    writePlanFile(tasksDir, "T02", { outputFiles: ["src/from-plan.ts"] });

    const result = collectSourceFilePaths(base, "M001", "S01");
    assert.ok(result.some(p => p.endsWith("from-summary.ts")), "should include summary file");
    assert.ok(result.some(p => p.endsWith("from-plan.ts")), "should include plan file");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// extractApiRoutes
// ═══════════════════════════════════════════════════════════════════════════════

describe("extractApiRoutes", () => {
  test("matches Express app.get/post/put/delete/patch routes", () => {
    const code = `
app.get('/api/users', handler);
app.post('/api/users', createUser);
app.put('/api/users/:id', updateUser);
app.delete('/api/users/:id', deleteUser);
app.patch('/api/users/:id/status', patchStatus);
`;
    const signals = extractApiRoutes(code);
    assert.equal(signals.length, 5, "should find 5 Express routes");
    assert.ok(signals[0].testableAspect.includes("GET /api/users"), "first route is GET /api/users");
    assert.ok(signals[1].testableAspect.includes("POST /api/users"), "second route is POST /api/users");
  });

  test("matches router.get/post patterns", () => {
    const code = `
const router = express.Router();
router.get('/health', (req, res) => res.send('ok'));
router.post('/submit', handleSubmit);
`;
    const signals = extractApiRoutes(code);
    assert.equal(signals.length, 2, "should find 2 router routes");
  });

  test("matches Next.js route handlers", () => {
    const code = `
export async function GET(request: NextRequest) {
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  return NextResponse.json(created, { status: 201 });
}
`;
    const signals = extractApiRoutes(code);
    assert.equal(signals.length, 2, "should find 2 Next.js handlers");
    assert.ok(signals[0].testableAspect.includes("Next.js GET"), "first is GET handler");
    assert.ok(signals[1].testableAspect.includes("Next.js POST"), "second is POST handler");
  });

  test("returns empty for non-route code", () => {
    const code = `
export function helper() {
  return "no routes here";
}
`;
    const signals = extractApiRoutes(code);
    assert.equal(signals.length, 0, "no routes in helper code");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// extractReactComponents
// ═══════════════════════════════════════════════════════════════════════════════

describe("extractReactComponents", () => {
  test("matches named exported components", () => {
    const code = `
export function UserProfile({ name, email }: Props) {
  return <div>{name}</div>;
}

export const DashboardCard = ({ title }: CardProps) => {
  return <div>{title}</div>;
};
`;
    const signals = extractReactComponents(code);
    const compSignals = signals.filter(s => s.testableAspect.includes("component"));
    assert.ok(compSignals.length >= 2, "should find at least 2 components");
    assert.ok(compSignals.some(s => s.testableAspect.includes("UserProfile")));
    assert.ok(compSignals.some(s => s.testableAspect.includes("DashboardCard")));
  });

  test("matches export default function", () => {
    const code = `
export default function HomePage() {
  return <main>Home</main>;
}
`;
    const signals = extractReactComponents(code);
    assert.ok(signals.some(s => s.testableAspect.includes("HomePage")), "should find default export component");
  });

  test("detects useState for interactive state", () => {
    const code = `
export function Counter() {
  const [count, setCount] = useState(0);
  const [name, setName] = useState<string>("");
  return <div>{count}</div>;
}
`;
    const signals = extractReactComponents(code);
    const stateSignals = signals.filter(s => s.testableAspect.includes("State management"));
    assert.ok(stateSignals.length >= 1, "should detect useState hooks");
  });

  test("returns empty for non-React code", () => {
    const code = `
export function calculateTotal(items: Item[]) {
  return items.reduce((sum, item) => sum + item.price, 0);
}
`;
    // calculateTotal is lowercase — should not match as component
    const signals = extractReactComponents(code);
    const compSignals = signals.filter(s => s.type === "react-component");
    assert.equal(compSignals.length, 0, "lowercase functions should not be components");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// extractValidation
// ═══════════════════════════════════════════════════════════════════════════════

describe("extractValidation", () => {
  test("matches Zod schemas", () => {
    const code = `
const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().min(0),
});

export const querySchema = z.string().uuid();
`;
    const signals = extractValidation(code);
    assert.ok(signals.some(s => s.testableAspect.includes("userSchema")), "should find userSchema");
    assert.ok(signals.some(s => s.testableAspect.includes("querySchema")), "should find querySchema");
  });

  test("matches manual validation checks", () => {
    const code = `
if (!name) throw new Error('Name is required');
if (!email) return { error: 'Email is required' };
if (!req.body) throw new BadRequestError('Missing body');
`;
    const signals = extractValidation(code);
    assert.ok(signals.length >= 2, "should find manual validation checks");
    assert.ok(signals.some(s => s.testableAspect.includes("name")), "should detect name check");
    assert.ok(signals.some(s => s.testableAspect.includes("email")), "should detect email check");
  });

  test("returns empty for code without validation", () => {
    const code = `
export function greet(name: string) {
  return \`Hello, \${name}!\`;
}
`;
    const signals = extractValidation(code);
    assert.equal(signals.length, 0, "no validation in simple function");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// extractErrorHandlers
// ═══════════════════════════════════════════════════════════════════════════════

describe("extractErrorHandlers", () => {
  test("matches error response patterns", () => {
    const code = `
res.status(404).json({ error: 'Not Found' });
res.status(500).json({ error: 'Internal Server Error' });
res.status(400).json({ error: 'Bad Request' });
`;
    const signals = extractErrorHandlers(code);
    assert.ok(signals.length >= 3, "should find error response patterns");
    assert.ok(signals.some(s => s.testableAspect.includes("404")), "should find 404");
    assert.ok(signals.some(s => s.testableAspect.includes("500")), "should find 500");
  });

  test("matches catch blocks", () => {
    const code = `
try {
  await doSomething();
} catch (err) {
  console.error(err);
}
`;
    const signals = extractErrorHandlers(code);
    assert.ok(signals.some(s => s.testableAspect.includes("catch err")), "should find catch block");
  });

  test("matches throw new Error", () => {
    const code = `
throw new Error('Connection timeout');
throw new ValidationError('Invalid input format');
`;
    const signals = extractErrorHandlers(code);
    assert.ok(signals.some(s => s.testableAspect.includes("Connection timeout")), "should find thrown Error");
    assert.ok(signals.some(s => s.testableAspect.includes("ValidationError")), "should find thrown ValidationError");
  });

  test("returns empty for code without error handling", () => {
    const code = `
export const add = (a: number, b: number) => a + b;
`;
    const signals = extractErrorHandlers(code);
    assert.equal(signals.length, 0, "no error handling in pure function");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// extractCliCommands
// ═══════════════════════════════════════════════════════════════════════════════

describe("extractCliCommands", () => {
  test("matches .command() registrations", () => {
    const code = `
program
  .command('init')
  .description('Initialize a new project')
  .action(handleInit);

program
  .command('build')
  .description('Build the project')
  .action(handleBuild);
`;
    const signals = extractCliCommands(code);
    assert.equal(signals.length, 2, "should find 2 CLI commands");
    assert.ok(signals[0].testableAspect.includes("init"), "first command is init");
    assert.ok(signals[1].testableAspect.includes("build"), "second command is build");
  });

  test("matches yargs-style commands", () => {
    const code = `
yargs.command('serve', 'Start the server', (yargs) => {
  return yargs.option('port', { type: 'number', default: 3000 });
});
`;
    const signals = extractCliCommands(code);
    assert.ok(signals.some(s => s.testableAspect.includes("serve")), "should find yargs command");
  });

  test("returns empty for non-CLI code", () => {
    const code = `
export function processData(data: any[]) {
  return data.map(item => item.value);
}
`;
    const signals = extractCliCommands(code);
    assert.equal(signals.length, 0, "no CLI commands in utility code");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// extractExportedFunctions
// ═══════════════════════════════════════════════════════════════════════════════

describe("extractExportedFunctions", () => {
  test("matches export function and export const", () => {
    const code = `
export function calculateTotal(items: Item[]) {
  return items.reduce((sum, i) => sum + i.price, 0);
}

export const formatCurrency = (amount: number) => {
  return '$' + amount.toFixed(2);
};

export async function fetchData(url: string) {
  return fetch(url).then(r => r.json());
}
`;
    const signals = extractExportedFunctions(code);
    assert.ok(signals.some(s => s.testableAspect.includes("calculateTotal")), "should find calculateTotal");
    assert.ok(signals.some(s => s.testableAspect.includes("formatCurrency")), "should find formatCurrency");
    assert.ok(signals.some(s => s.testableAspect.includes("fetchData")), "should find fetchData");
  });

  test("skips PascalCase names (those are components)", () => {
    const code = `
export function MyComponent() {
  return <div />;
}
export function helperFunction() {
  return 42;
}
`;
    const signals = extractExportedFunctions(code);
    assert.ok(!signals.some(s => s.testableAspect.includes("MyComponent")), "should skip PascalCase");
    assert.ok(signals.some(s => s.testableAspect.includes("helperFunction")), "should include camelCase");
  });

  test("returns empty for non-exported code", () => {
    const code = `
function internalHelper() {
  return "not exported";
}
const privateFn = () => "also not exported";
`;
    const signals = extractExportedFunctions(code);
    assert.equal(signals.length, 0, "non-exported functions should not match");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// extractSignalsFromFile — combined extraction with cap
// ═══════════════════════════════════════════════════════════════════════════════

describe("extractSignalsFromFile", () => {
  test("combines signals from multiple extractors", () => {
    const code = `
app.get('/api/users', handler);
const userSchema = z.object({ name: z.string() });
export function processUser(user: User) {
  if (!user.name) throw new Error('Name required');
}
`;
    const signals = extractSignalsFromFile("test.ts", code);
    const types = new Set(signals.map(s => s.type));
    assert.ok(types.has("api-route"), "should include route signals");
    assert.ok(types.has("validation"), "should include validation signals");
    assert.ok(types.has("exported-function"), "should include exported function signals");
  });

  test("caps signals at MAX_SIGNALS_PER_FILE (10)", () => {
    // Generate code with many routes to exceed the cap
    const routes = Array.from({ length: 15 }, (_, i) =>
      `app.get('/api/resource${i}', handler${i});`
    ).join("\n");
    const signals = extractSignalsFromFile("many-routes.ts", routes);
    assert.ok(signals.length <= 10, `should cap at 10 but got ${signals.length}`);
  });

  test("returns empty for code with zero signals", () => {
    const code = `
// Just a comment file
const x = 1;
let y = 2;
`;
    const signals = extractSignalsFromFile("empty.ts", code);
    assert.equal(signals.length, 0, "no signals in trivial code");
  });

  test("deduplicates signals with identical context", () => {
    // The same pattern matched by two different extractors shouldn't produce
    // exact duplicates — but within a single extractor, the same regex hit is
    // naturally deduplicated by our Set.
    const code = `
export function processItems(items: Item[]) {
  return items;
}
`;
    const signals = extractSignalsFromFile("dedup.ts", code);
    const contexts = signals.map(s => `${s.type}:${s.context}`);
    const unique = new Set(contexts);
    assert.equal(contexts.length, unique.size, "no duplicate signals");
  });

  test("prioritizes routes over exports (routes come first)", () => {
    const code = `
app.get('/api/data', handler);
export function getData() { return []; }
`;
    const signals = extractSignalsFromFile("priority.ts", code);
    assert.ok(signals.length >= 2, "should have at least 2 signals");
    assert.equal(signals[0].type, "api-route", "routes should come first");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// synthesizeChecks
// ═══════════════════════════════════════════════════════════════════════════════

describe("synthesizeChecks", () => {
  const defaultPlanContext: PlanContext = {
    goal: "Users can create and manage their accounts",
    taskTitles: ["T01: Build user API", "T02: Build user UI"],
    verifyFields: ["POST /api/users returns 201"],
  };

  test("generates smoke check from plan goal", () => {
    const signals: TestableSignal[] = [
      { type: "api-route", context: "app.get('/api/users', handler)", testableAspect: "GET /api/users endpoint — verify request/response" },
    ];
    const checks = synthesizeChecks(signals, "S01", defaultPlanContext);
    assert.ok(checks.length >= 1, "should produce checks");
    const smoke = checks.find(c => c.category === "smoke");
    assert.ok(smoke, "should have a smoke check");
    assert.ok(smoke!.steps[0].includes("Users can create"), "smoke check references goal");
    assert.equal(smoke!.preconditions, "(Auto-generated from code analysis)");
  });

  test("generates route checks with HTTP method and path", () => {
    const signals: TestableSignal[] = [
      { type: "api-route", context: "app.get('/api/users')", testableAspect: "GET /api/users endpoint — verify request/response" },
      { type: "api-route", context: "app.post('/api/users')", testableAspect: "POST /api/users endpoint — verify request/response" },
    ];
    const checks = synthesizeChecks(signals, "S01", defaultPlanContext);
    const routeChecks = checks.filter(c => c.name.includes("/api/users"));
    assert.ok(routeChecks.length >= 2, "should produce checks for each route");
    assert.ok(routeChecks.some(c => c.name.includes("GET")), "should include GET");
    assert.ok(routeChecks.some(c => c.name.includes("POST")), "should include POST");
    assert.ok(routeChecks[0].steps.some(s => s.includes("Send")), "steps should include HTTP action");
  });

  test("generates component checks with component name", () => {
    const signals: TestableSignal[] = [
      { type: "react-component", context: "export function UserProfile", testableAspect: "<UserProfile /> component — verify rendering and interactions" },
    ];
    const checks = synthesizeChecks(signals, "S01", defaultPlanContext);
    const compChecks = checks.filter(c => c.name.includes("UserProfile"));
    assert.ok(compChecks.length >= 1, "should produce component check");
    assert.ok(compChecks[0].steps.some(s => s.includes("<UserProfile />")), "steps reference component name");
  });

  test("generates validation edge-case checks", () => {
    const signals: TestableSignal[] = [
      { type: "validation", context: "const userSchema = z.object(", testableAspect: "Zod schema 'userSchema' — verify valid input passes and invalid input is rejected" },
    ];
    const checks = synthesizeChecks(signals, "S01", defaultPlanContext);
    const edgeCases = checks.filter(c => c.category === "edge-case");
    assert.ok(edgeCases.length >= 1, "should produce edge-case check");
    assert.ok(edgeCases[0].name.includes("userSchema"), "edge case references schema name");
    assert.ok(edgeCases[0].steps.some(s => s.includes("userSchema")), "steps reference schema");
  });

  test("generates error handler edge-case checks", () => {
    const signals: TestableSignal[] = [
      { type: "error-handler", context: "res.status(404)", testableAspect: "Error response 404 — verify correct error status and message" },
      { type: "error-handler", context: "throw new Error('Not found')", testableAspect: 'Throws Error: "Not found" — verify error is thrown under expected conditions' },
    ];
    const checks = synthesizeChecks(signals, "S01", defaultPlanContext);
    const edgeCases = checks.filter(c => c.category === "edge-case");
    assert.ok(edgeCases.length >= 2, "should produce edge cases for each error signal");
    assert.ok(edgeCases.some(c => c.name.includes("404")), "should reference 404 status");
    assert.ok(edgeCases.some(c => c.name.includes("Not found")), "should reference thrown error");
  });

  test("generates CLI command test-case checks", () => {
    const signals: TestableSignal[] = [
      { type: "cli-command", context: ".command('init')", testableAspect: "CLI command 'init' — verify command executes correctly with valid/invalid args" },
    ];
    const checks = synthesizeChecks(signals, "S01", defaultPlanContext);
    const cliChecks = checks.filter(c => c.name.includes("init"));
    assert.ok(cliChecks.length >= 1, "should produce CLI check");
    assert.ok(cliChecks[0].steps.some(s => s.includes("init")), "steps reference command name");
  });

  test("generates exported function checks", () => {
    const signals: TestableSignal[] = [
      { type: "exported-function", context: "export function calculateTotal", testableAspect: "Exported function 'calculateTotal' — verify expected behavior with representative inputs" },
    ];
    const checks = synthesizeChecks(signals, "S01", defaultPlanContext);
    const fnChecks = checks.filter(c => c.name.includes("calculateTotal"));
    assert.ok(fnChecks.length >= 1, "should produce function check");
    assert.ok(fnChecks[0].steps.some(s => s.includes("calculateTotal")), "steps reference function name");
  });

  test("caps total checks at 15", () => {
    // Generate many signals to exceed the cap
    const signals: TestableSignal[] = Array.from({ length: 20 }, (_, i) => ({
      type: "api-route",
      context: `app.get('/api/resource${i}')`,
      testableAspect: `GET /api/resource${i} endpoint — verify request/response`,
    }));
    const checks = synthesizeChecks(signals, "S01", defaultPlanContext);
    assert.ok(checks.length <= 15, `should cap at 15 but got ${checks.length}`);
  });

  test("returns empty for zero signals", () => {
    const checks = synthesizeChecks([], "S01", defaultPlanContext);
    assert.equal(checks.length, 0, "empty signals → empty checks");
  });

  test("handles signals with empty context strings", () => {
    const signals: TestableSignal[] = [
      { type: "api-route", context: "", testableAspect: "GET /api/empty endpoint — verify request/response" },
    ];
    // Should not crash
    const checks = synthesizeChecks(signals, "S01", defaultPlanContext);
    assert.ok(Array.isArray(checks), "should return array");
  });

  test("handles plan context with no goal", () => {
    const signals: TestableSignal[] = [
      { type: "api-route", context: "app.get('/test')", testableAspect: "GET /test endpoint — verify request/response" },
    ];
    const checks = synthesizeChecks(signals, "S01", { goal: "", taskTitles: [], verifyFields: [] });
    // Should still produce route checks, just no smoke check
    const smoke = checks.filter(c => c.category === "smoke");
    assert.equal(smoke.length, 0, "no smoke check without goal");
    assert.ok(checks.length >= 1, "should still produce route checks");
  });

  test("exactly 15 signals → no truncation needed", () => {
    const signals: TestableSignal[] = Array.from({ length: 14 }, (_, i) => ({
      type: "api-route",
      context: `app.get('/api/item${i}')`,
      testableAspect: `GET /api/item${i} endpoint — verify request/response`,
    }));
    // 14 routes + 1 smoke = 15
    const checks = synthesizeChecks(signals, "S01", defaultPlanContext);
    assert.ok(checks.length <= 15, "should be at or under 15");
  });

  test("sets correct categories: route/component as test-case, validation/error as edge-case", () => {
    const signals: TestableSignal[] = [
      { type: "api-route", context: "app.get('/test')", testableAspect: "GET /test endpoint — verify request/response" },
      { type: "react-component", context: "export function App", testableAspect: "<App /> component — verify rendering and interactions" },
      { type: "validation", context: "const s = z.object(", testableAspect: "Zod schema 's' — verify valid input passes and invalid input is rejected" },
      { type: "error-handler", context: "res.status(500)", testableAspect: "Error response 500 — verify correct error status and message" },
    ];
    const checks = synthesizeChecks(signals, "S01", defaultPlanContext);
    const routeCheck = checks.find(c => c.name.includes("GET /test"));
    const compCheck = checks.find(c => c.name.includes("App"));
    const valCheck = checks.find(c => c.category === "edge-case" && c.name.includes("s"));
    const errCheck = checks.find(c => c.name.includes("500"));

    assert.equal(routeCheck?.category, "test-case", "route is test-case");
    assert.equal(compCheck?.category, "test-case", "component is test-case");
    assert.equal(valCheck?.category, "edge-case", "validation is edge-case");
    assert.equal(errCheck?.category, "edge-case", "error is edge-case");
  });

  test("generates Next.js handler checks", () => {
    const signals: TestableSignal[] = [
      { type: "api-route", context: "export async function POST(", testableAspect: "Next.js POST handler — verify request handling and response" },
    ];
    const checks = synthesizeChecks(signals, "S01", defaultPlanContext);
    const nextChecks = checks.filter(c => c.name.includes("Next.js"));
    assert.ok(nextChecks.length >= 1, "should produce Next.js handler check");
  });

  test("skips useState detail signals for components", () => {
    const signals: TestableSignal[] = [
      { type: "react-component", context: "export function Counter", testableAspect: "<Counter /> component — verify rendering and interactions" },
      { type: "react-component", context: "useState(0)", testableAspect: "State management — verify state transitions with initial value: 0" },
    ];
    const checks = synthesizeChecks(signals, "S01", defaultPlanContext);
    const compChecks = checks.filter(c => c.category === "test-case" && c.name.includes("Counter"));
    assert.equal(compChecks.length, 1, "should produce 1 component check, not 2");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// generateSmartChecks — end-to-end pipeline
// ═══════════════════════════════════════════════════════════════════════════════

describe("generateSmartChecks", () => {
  afterEach(() => {
    for (const dir of cleanupDirs) {
      try { rmSync(dir, { recursive: true, force: true }); } catch {}
    }
    cleanupDirs = [];
  });

  test("end-to-end: produces enriched checks from source files with Express routes and Zod schemas", () => {
    const base = createTempProject();
    const tasksDir = setupGsdStructure(base, "M001", "S01");

    // Create source files with known patterns
    const srcDir = join(base, "src");
    mkdirSync(srcDir, { recursive: true });

    writeFileSync(join(srcDir, "api.ts"), `
import express from 'express';
const app = express();
app.get('/api/users', (req, res) => res.json([]));
app.post('/api/users', (req, res) => res.status(201).json(req.body));
`);

    writeFileSync(join(srcDir, "schema.ts"), `
import { z } from 'zod';
const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});
`);

    // Create task summary referencing these files
    writeSummaryFile(tasksDir, "T01", {
      keyFiles: ["src/api.ts", "src/schema.ts"],
    });

    // Create a minimal slice plan
    const sliceDir = join(base, ".gsd", "milestones", "M001", "slices", "S01");
    writeFileSync(join(sliceDir, "S01-PLAN.md"), `---
type: slice-plan
---

# S01: User Management

**Goal:** Users can create and list user accounts via REST API

## Tasks

- [ ] **T01: Build user API** \`est:1h\`
  - Verify: POST /api/users returns 201
`);

    const checks = generateSmartChecks(base, "M001", "S01");
    assert.ok(checks.length >= 3, `should produce at least 3 checks (smoke + routes + validation) but got ${checks.length}`);

    // Verify checks contain concrete code-derived details
    const routeChecks = checks.filter(c => c.name.includes("/api/users"));
    assert.ok(routeChecks.length >= 1, "should have route checks with /api/users path");

    const smokeCheck = checks.find(c => c.category === "smoke");
    assert.ok(smokeCheck, "should have a smoke check");
    assert.ok(smokeCheck!.steps[0].includes("REST API"), "smoke check references plan goal");

    // Should have auto-generated preconditions note
    assert.ok(checks[0].preconditions.includes("Auto-generated"), "first check notes auto-generation");
  });

  test("returns empty array when no source files exist", () => {
    const base = createTempProject();
    const tasksDir = setupGsdStructure(base, "M001", "S01");

    // Summary references non-existent file
    writeSummaryFile(tasksDir, "T01", {
      keyFiles: ["src/does-not-exist.ts"],
    });

    const checks = generateSmartChecks(base, "M001", "S01");
    assert.equal(checks.length, 0, "no source files → empty checks");
  });

  test("returns empty array when source files have no signals", () => {
    const base = createTempProject();
    const tasksDir = setupGsdStructure(base, "M001", "S01");

    const srcDir = join(base, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "empty.ts"), "// just a comment\nconst x = 1;\n");

    writeSummaryFile(tasksDir, "T01", { keyFiles: ["src/empty.ts"] });

    const checks = generateSmartChecks(base, "M001", "S01");
    assert.equal(checks.length, 0, "no signals → empty checks");
  });

  test("handles unreadable source file mid-pipeline gracefully", () => {
    const base = createTempProject();
    const tasksDir = setupGsdStructure(base, "M001", "S01");

    const srcDir = join(base, "src");
    mkdirSync(srcDir, { recursive: true });
    // One good file, one directory (unreadable as file)
    writeFileSync(join(srcDir, "good.ts"), "app.get('/api/health', handler);");
    mkdirSync(join(srcDir, "bad.ts"), { recursive: true }); // directory, not file

    writeSummaryFile(tasksDir, "T01", { keyFiles: ["src/good.ts", "src/bad.ts"] });

    // Should still produce checks from the good file — statSync filters directories
    // but collectSourceFilePaths checks isFile(), so bad.ts is filtered out
    const checks = generateSmartChecks(base, "M001", "S01");
    // Only "good.ts" is a real file, so we get at least one route check from it
    assert.ok(checks.length >= 1, "should still produce checks from readable file");
  });

  test("reads plan context when slice plan exists", () => {
    const base = createTempProject();
    const tasksDir = setupGsdStructure(base, "M001", "S01");

    const srcDir = join(base, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "app.ts"), "app.get('/api/items', handler);");

    writeSummaryFile(tasksDir, "T01", { keyFiles: ["src/app.ts"] });

    const sliceDir = join(base, ".gsd", "milestones", "M001", "slices", "S01");
    writeFileSync(join(sliceDir, "S01-PLAN.md"), `---
type: slice-plan
---

# S01: Item Management

**Goal:** Items can be listed and searched

## Tasks

- [ ] **T01: Build item API** \`est:1h\`
  - Verify: GET /api/items returns 200
`);

    const checks = generateSmartChecks(base, "M001", "S01");
    const smoke = checks.find(c => c.category === "smoke");
    assert.ok(smoke, "should have smoke check from plan goal");
    assert.ok(smoke!.steps[0].includes("Items can be listed"), "smoke check uses plan goal");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// gatherChecksForSlice — fallback chain regression
// ═══════════════════════════════════════════════════════════════════════════════

describe("gatherChecksForSlice fallback chain", () => {
  afterEach(() => {
    for (const dir of cleanupDirs) {
      try { rmSync(dir, { recursive: true, force: true }); } catch {}
    }
    cleanupDirs = [];
  });

  test("returns UAT checks when UAT file exists (regression)", () => {
    const base = createTempProject();
    const tasksDir = setupGsdStructure(base, "M001", "S01");

    // Create UAT file
    const sliceDir = join(base, ".gsd", "milestones", "M001", "slices", "S01");
    writeFileSync(join(sliceDir, "S01-UAT.md"), `# UAT — S01

## Smoke Test

1. Open the app
2. Verify the dashboard loads

**Expected:** Dashboard renders with user data

## Test Cases

### 1. Login Flow

1. Navigate to /login
2. Enter valid credentials
3. Click submit

**Expected:** User is redirected to dashboard
`);

    // Also create source files (should be ignored because UAT exists)
    const srcDir = join(base, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "api.ts"), "app.get('/api/users', handler);");
    writeSummaryFile(tasksDir, "T01", { keyFiles: ["src/api.ts"] });

    const checks = gatherChecksForSlice(base, "M001", "S01");
    assert.ok(checks.length >= 2, "should return UAT checks");
    assert.ok(checks.some(c => c.name === "Smoke Test"), "should include smoke test from UAT");
    assert.ok(checks.some(c => c.name === "Login Flow"), "should include test case from UAT");
    // Should NOT have auto-generated note (these are from UAT)
    assert.ok(!checks[0].preconditions.includes("Auto-generated from code analysis"), "UAT checks don't have auto-generated note");
  });

  test("returns smart checks when no UAT but source files exist", () => {
    const base = createTempProject();
    const tasksDir = setupGsdStructure(base, "M001", "S01");

    // No UAT file — but create source files with signals
    const srcDir = join(base, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "api.ts"), `
app.get('/api/products', handler);
app.post('/api/products', createHandler);
`);
    writeSummaryFile(tasksDir, "T01", { keyFiles: ["src/api.ts"] });

    // Create plan file
    const sliceDir = join(base, ".gsd", "milestones", "M001", "slices", "S01");
    writeFileSync(join(sliceDir, "S01-PLAN.md"), `---
type: slice-plan
---

# S01: Product API

**Goal:** Products can be created and listed

## Tasks

- [ ] **T01: Build product API** \`est:1h\`
  - Verify: GET /api/products returns 200
`);

    const checks = gatherChecksForSlice(base, "M001", "S01");
    assert.ok(checks.length >= 2, `should return smart checks but got ${checks.length}`);
    // Should contain route-derived checks with specific paths
    assert.ok(checks.some(c => c.name.includes("/api/products")), "should have route-specific checks");
    assert.ok(checks[0].preconditions.includes("Auto-generated from code analysis"), "first check notes code analysis");
  });

  test("falls through to plan-text when no UAT and no source files with signals", () => {
    const base = createTempProject();
    const tasksDir = setupGsdStructure(base, "M001", "S01");

    // No UAT, no source files — only a plan
    const sliceDir = join(base, ".gsd", "milestones", "M001", "slices", "S01");
    writeFileSync(join(sliceDir, "S01-PLAN.md"), `---
type: slice-plan
---

# S01: Documentation Update

**Goal:** All README files are up to date

## Verification

- All links in README.md are valid
- API docs match current endpoints

## Tasks

- [ ] **T01: Update README** \`est:30m\`
  - Verify: README contains current API endpoints
`);

    const checks = gatherChecksForSlice(base, "M001", "S01");
    assert.ok(checks.length >= 1, "should return plan-text checks");
    // Plan-text checks have different preconditions note
    assert.ok(
      checks[0].preconditions.includes("Auto-generated from slice plan"),
      "plan-text checks note they're from plan"
    );
  });

  test("falls through to plan-text when source files exist but have no signals", () => {
    const base = createTempProject();
    const tasksDir = setupGsdStructure(base, "M001", "S01");

    // Source file with no testable signals
    const srcDir = join(base, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "config.ts"), "// just config\nconst x = 1;\nlet y = 2;\n");
    writeSummaryFile(tasksDir, "T01", { keyFiles: ["src/config.ts"] });

    const sliceDir = join(base, ".gsd", "milestones", "M001", "slices", "S01");
    writeFileSync(join(sliceDir, "S01-PLAN.md"), `---
type: slice-plan
---

# S01: Config Setup

**Goal:** Configuration is centralized

## Tasks

- [ ] **T01: Setup config** \`est:15m\`
  - Verify: Config loads without errors
`);

    const checks = gatherChecksForSlice(base, "M001", "S01");
    assert.ok(checks.length >= 1, "should fall through to plan-text checks");
    assert.ok(
      checks[0].preconditions.includes("Auto-generated from slice plan"),
      "should have plan-text preconditions note"
    );
  });
});
