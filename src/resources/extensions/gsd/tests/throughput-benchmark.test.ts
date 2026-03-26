/**
 * Throughput benchmark — measures wall-clock time for the hot paths optimized
 * in the throughput & parallelism performance pass.
 *
 * Benchmarked paths:
 *   1. State derivation (deriveStateFromDb) — batch queries vs N+1
 *   2. Prompt building (buildExecuteTaskPrompt, buildCompleteSlicePrompt) — parallel I/O
 *   3. Cache behavior (invalidateAllCachesIfDirty) — dirty-flag vs unconditional
 *   4. computeBudgets memoization
 *
 * Run:
 *   node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs \
 *     --experimental-strip-types --test \
 *     src/resources/extensions/gsd/tests/throughput-benchmark.test.ts
 *
 * The test creates a realistic .gsd/ tree with 8 milestones, 5 slices each,
 * 4 tasks per slice (160 tasks total) backed by an in-memory SQLite DB.
 */

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";

import { deriveState, deriveStateFromDb, invalidateStateCache } from "../state.ts";
import {
  openDatabase,
  closeDatabase,
  insertMilestone,
  insertSlice,
  insertTask,
  getAllMilestones,
  getMilestoneSlices,
  getAllSlicesGrouped,
} from "../gsd-db.ts";
import { invalidateAllCaches, invalidateAllCachesIfDirty, markCachesDirty } from "../cache.ts";
import { computeBudgets } from "../context-budget.ts";

// ─── Constants ────────────────────────────────────────────────────────────

const MILESTONE_COUNT = 8;
const SLICES_PER_MILESTONE = 5;
const TASKS_PER_SLICE = 4;
const ITERATIONS = 50; // number of times to run each benchmark for stable averages

// ─── Fixture Setup ────────────────────────────────────────────────────────

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

let fixtureBase: string;

function createFixture(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-throughput-bench-"));
  const gsd = join(base, ".gsd");
  mkdirSync(join(gsd, "milestones"), { recursive: true });

  // Write REQUIREMENTS.md
  writeFileSync(
    join(gsd, "REQUIREMENTS.md"),
    "# Requirements\n\n## Active\n\n### R001 — Benchmark requirement\n- Status: active\n- Description: Benchmark test.\n",
  );

  // Write KNOWLEDGE.md
  writeFileSync(
    join(gsd, "knowledge.md"),
    "# Project Knowledge\n\nThis is a test project for benchmarking.\n",
  );

  for (let m = 1; m <= MILESTONE_COUNT; m++) {
    const mid = `M${pad3(m)}`;
    const isComplete = m <= 2; // first 2 milestones are complete
    const isActive = m === 3; // 3rd is active

    const milestoneDir = join(gsd, "milestones", mid);
    mkdirSync(milestoneDir, { recursive: true });

    // Write CONTEXT.md
    writeFileSync(
      join(milestoneDir, `${mid}-CONTEXT.md`),
      `# ${mid}: Benchmark Milestone ${m}\n\n**Vision:** Performance testing milestone.\n`,
    );

    // Build roadmap content
    const sliceLines: string[] = [];
    for (let s = 1; s <= SLICES_PER_MILESTONE; s++) {
      const sid = `S${pad3(s)}`;
      const done = isComplete ? "[x]" : "[ ]";
      sliceLines.push(`- ${done} **${sid}: Slice ${s}** \`risk:low\` \`depends:[]\`\n  > Slice ${s} work.`);
    }
    writeFileSync(
      join(milestoneDir, `${mid}-ROADMAP.md`),
      `# ${mid} Roadmap\n\n## Slices\n\n${sliceLines.join("\n\n")}\n`,
    );

    if (isComplete) {
      writeFileSync(
        join(milestoneDir, `${mid}-SUMMARY.md`),
        `# ${mid} Summary\n\nMilestone ${m} completed successfully.\n`,
      );
    }

    // Create slices
    for (let s = 1; s <= SLICES_PER_MILESTONE; s++) {
      const sid = `S${pad3(s)}`;
      const sliceDir = join(milestoneDir, "slices", sid);
      mkdirSync(sliceDir, { recursive: true });

      // Build task lines for plan
      const taskLines: string[] = [];
      for (let t = 1; t <= TASKS_PER_SLICE; t++) {
        const tid = `T${pad3(t)}`;
        const done = isComplete ? "[x]" : "[ ]";
        taskLines.push(`- ${done} **${tid}: Task ${t}** \`est:10m\`\n  Task ${t} description for ${sid}.`);
      }

      writeFileSync(
        join(sliceDir, `${sid}-PLAN.md`),
        `# ${sid}: Slice ${s}\n\n**Goal:** Benchmark slice.\n**Demo:** Tests pass.\n\n## Tasks\n\n${taskLines.join("\n\n")}\n`,
      );

      if (isComplete) {
        writeFileSync(
          join(sliceDir, `${sid}-SUMMARY.md`),
          `# ${sid} Summary\n\nSlice ${s} completed.\n`,
        );
      }

      // Create tasks
      const tasksDir = join(sliceDir, "tasks");
      mkdirSync(tasksDir, { recursive: true });

      for (let t = 1; t <= TASKS_PER_SLICE; t++) {
        const tid = `T${pad3(t)}`;

        writeFileSync(
          join(tasksDir, `${tid}-PLAN.md`),
          [
            "---",
            `id: ${tid}`,
            `title: "Task ${t}"`,
            `estimate: "10m"`,
            `inputs: ["src/foo.ts"]`,
            `expected_output: ["src/bar.ts"]`,
            "---",
            "",
            `# ${tid}: Task ${t}`,
            "",
            `Implement task ${t} for slice ${sid} in milestone ${mid}.`,
            "",
            "## Verification",
            "```bash",
            `echo "pass"`,
            "```",
            "",
          ].join("\n"),
        );

        if (isComplete) {
          writeFileSync(
            join(tasksDir, `${tid}-SUMMARY.md`),
            [
              "---",
              `id: ${tid}`,
              `title: "Task ${t}"`,
              `status: complete`,
              `one_liner: "Completed task ${t}"`,
              "blocker_discovered: false",
              "key_files: [src/bar.ts]",
              "---",
              "",
              `# ${tid}: Task ${t}`,
              "",
              `Task ${t} completed successfully.`,
              "",
            ].join("\n"),
          );
        }
      }
    }
  }

  return base;
}

function populateDb(): void {
  openDatabase(":memory:");
  for (let m = 1; m <= MILESTONE_COUNT; m++) {
    const mid = `M${pad3(m)}`;
    const isComplete = m <= 2;
    insertMilestone({
      id: mid,
      title: `Benchmark Milestone ${m}`,
      status: isComplete ? "complete" : (m === 3 ? "active" : "pending"),
    });

    for (let s = 1; s <= SLICES_PER_MILESTONE; s++) {
      const sid = `S${pad3(s)}`;
      insertSlice({
        id: sid,
        milestoneId: mid,
        title: `Slice ${s}`,
        status: isComplete ? "complete" : (m === 3 && s === 1 ? "active" : "pending"),
        risk: "low",
        sequence: s,
      });

      for (let t = 1; t <= TASKS_PER_SLICE; t++) {
        const tid = `T${pad3(t)}`;
        insertTask({
          id: tid,
          sliceId: sid,
          milestoneId: mid,
          title: `Task ${t}`,
          status: isComplete ? "complete" : "pending",
          sequence: t,
          planning: {
            description: `Task ${t} for ${sid}`,
            estimate: "10m",
            files: ["src/foo.ts"],
            verify: 'echo "pass"',
            inputs: ["src/foo.ts"],
            expectedOutput: ["src/bar.ts"],
            observabilityImpact: "",
          },
        });
      }
    }
  }
}

// ─── Timing Utility ──────────────────────────────────────────────────────

interface BenchResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
}

async function bench(name: string, fn: () => Promise<void> | void, iterations = ITERATIONS): Promise<BenchResult> {
  const times: number[] = [];

  // Warmup (2 iterations)
  for (let i = 0; i < 2; i++) await fn();

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  times.sort((a, b) => a - b);
  const totalMs = times.reduce((a, b) => a + b, 0);
  return {
    name,
    iterations,
    totalMs,
    avgMs: totalMs / iterations,
    minMs: times[0],
    maxMs: times[times.length - 1],
    p50Ms: times[Math.floor(iterations * 0.5)],
    p95Ms: times[Math.floor(iterations * 0.95)],
  };
}

function formatResult(r: BenchResult): string {
  return `  ${r.name}: avg=${r.avgMs.toFixed(2)}ms  p50=${r.p50Ms.toFixed(2)}ms  p95=${r.p95Ms.toFixed(2)}ms  min=${r.minMs.toFixed(2)}ms  max=${r.maxMs.toFixed(2)}ms  (${r.iterations} iterations)`;
}

// ─── Benchmarks ──────────────────────────────────────────────────────────

describe("throughput-benchmark", () => {
  before(() => {
    fixtureBase = createFixture();
    populateDb();
  });

  after(() => {
    closeDatabase();
    rmSync(fixtureBase, { recursive: true, force: true });
  });

  test("1. State derivation: batch getAllSlicesGrouped vs N×getMilestoneSlices", async () => {
    const milestones = getAllMilestones();
    assert.ok(milestones.length === MILESTONE_COUNT, `Expected ${MILESTONE_COUNT} milestones, got ${milestones.length}`);

    // Benchmark: N per-milestone calls (old path)
    const perMilestone = await bench("N×getMilestoneSlices", () => {
      for (const m of milestones) {
        getMilestoneSlices(m.id);
      }
    });

    // Benchmark: single batch call (new path)
    const batched = await bench("getAllSlicesGrouped", () => {
      getAllSlicesGrouped();
    });

    console.log("\n  === State Derivation: DB Query Strategy ===");
    console.log(formatResult(perMilestone));
    console.log(formatResult(batched));
    const speedup = perMilestone.avgMs / batched.avgMs;
    console.log(`  Speedup: ${speedup.toFixed(2)}x (batch vs N×per-milestone)\n`);

    // Verify batch returns same data
    const batchMap = getAllSlicesGrouped();
    for (const m of milestones) {
      const perM = getMilestoneSlices(m.id);
      const fromBatch = batchMap.get(m.id) ?? [];
      assert.equal(perM.length, fromBatch.length, `Slice count mismatch for ${m.id}`);
    }
  });

  test("2. State derivation: full deriveStateFromDb with cache", async () => {
    // Benchmark: deriveState with cold cache (invalidate each time)
    const coldCache = await bench("deriveStateFromDb (cold)", async () => {
      invalidateStateCache();
      await deriveStateFromDb(fixtureBase);
    });

    // Benchmark: deriveState with warm cache (no invalidation — hits TTL cache)
    // First call primes the cache
    invalidateStateCache();
    await deriveState(fixtureBase);
    const warmCache = await bench("deriveState (warm cache)", async () => {
      await deriveState(fixtureBase);
    });

    console.log("\n  === State Derivation: Cache Effectiveness ===");
    console.log(formatResult(coldCache));
    console.log(formatResult(warmCache));
    const speedup = coldCache.avgMs / warmCache.avgMs;
    console.log(`  Cache speedup: ${speedup.toFixed(1)}x (warm vs cold)\n`);
  });

  test("3. Cache invalidation: dirty-flag vs unconditional", async () => {
    // Benchmark: unconditional invalidation (old path — always clears)
    const unconditional = await bench("invalidateAllCaches (unconditional)", () => {
      invalidateAllCaches();
    });

    // Benchmark: conditional invalidation when NOT dirty (new path — should be near-zero)
    // First, clear the dirty flag
    invalidateAllCaches(); // sets _dirty = false
    const conditionalClean = await bench("invalidateAllCachesIfDirty (clean)", () => {
      invalidateAllCachesIfDirty();
    });

    // Benchmark: conditional invalidation when dirty
    const conditionalDirty = await bench("invalidateAllCachesIfDirty (dirty)", () => {
      markCachesDirty();
      invalidateAllCachesIfDirty();
    });

    console.log("\n  === Cache Invalidation: Dirty-Flag Overhead ===");
    console.log(formatResult(unconditional));
    console.log(formatResult(conditionalClean));
    console.log(formatResult(conditionalDirty));
    const skipSpeedup = unconditional.avgMs / Math.max(conditionalClean.avgMs, 0.001);
    console.log(`  Skip speedup (clean): ${skipSpeedup.toFixed(1)}x (no-op vs full invalidation)`);
    console.log(`  Note: clean path should be ~0ms (dirty flag check only)\n`);
  });

  test("4. computeBudgets memoization", async () => {
    // Benchmark: first call (cache miss)
    const windows = [128_000, 200_000, 500_000, 1_000_000];
    const coldResults: number[] = [];
    const warmResults: number[] = [];

    for (const w of windows) {
      // Cold: unique window values to avoid memo hits
      const coldR = await bench(`computeBudgets(${w}) cold`, () => {
        computeBudgets(w + Math.random()); // unique key each time
      }, 200);
      coldResults.push(coldR.avgMs);

      // Warm: same window value to hit memo cache
      computeBudgets(w); // prime
      const warmR = await bench(`computeBudgets(${w}) warm`, () => {
        computeBudgets(w);
      }, 200);
      warmResults.push(warmR.avgMs);
    }

    const avgCold = coldResults.reduce((a, b) => a + b, 0) / coldResults.length;
    const avgWarm = warmResults.reduce((a, b) => a + b, 0) / warmResults.length;

    console.log("\n  === computeBudgets Memoization ===");
    console.log(`  Cold (cache miss):  avg=${(avgCold * 1000).toFixed(1)}µs`);
    console.log(`  Warm (cache hit):   avg=${(avgWarm * 1000).toFixed(1)}µs`);
    if (avgWarm > 0) {
      console.log(`  Memo speedup: ${(avgCold / avgWarm).toFixed(1)}x\n`);
    }
  });

  test("5. Prompt building: parallel vs sequential file reads", async () => {
    // This benchmarks the actual buildExecuteTaskPrompt function which
    // now uses Promise.all for parallel file I/O.
    // We measure how long it takes to build a prompt for the active slice's first task.
    const mid = "M003"; // active milestone
    const sid = "S001";
    const tid = "T001";

    let buildExecuteTaskPrompt: typeof import("../auto-prompts.ts").buildExecuteTaskPrompt;
    let buildCompleteSlicePrompt: typeof import("../auto-prompts.ts").buildCompleteSlicePrompt;
    try {
      const prompts = await import("../auto-prompts.ts");
      buildExecuteTaskPrompt = prompts.buildExecuteTaskPrompt;
      buildCompleteSlicePrompt = prompts.buildCompleteSlicePrompt;
    } catch (e) {
      console.log(`  Skipped: prompt builder import failed (${(e as Error).message})`);
      return;
    }

    const executeTask = await bench("buildExecuteTaskPrompt", async () => {
      await buildExecuteTaskPrompt(mid, sid, "Slice 1", tid, "Task 1", fixtureBase);
    }, 20);

    const completeSlice = await bench("buildCompleteSlicePrompt", async () => {
      await buildCompleteSlicePrompt(mid, "Benchmark Milestone 3", sid, "Slice 1", fixtureBase);
    }, 20);

    console.log("\n  === Prompt Building (with parallel file I/O) ===");
    console.log(formatResult(executeTask));
    console.log(formatResult(completeSlice));
    console.log(`  Note: these timings include the parallel Promise.all I/O path.\n`);
    console.log(`  To compare with sequential, revert the Promise.all changes in`);
    console.log(`  auto-prompts.ts and re-run this benchmark.\n`);
  });

  test("6. End-to-end: simulated dispatch iteration overhead", async () => {
    // Simulates the per-iteration overhead: cache check + state derivation + prompt build.
    // This is the hot path that runs once per auto-loop iteration.
    const mid = "M003";
    const sid = "S001";
    const tid = "T001";

    let buildExecuteTaskPrompt: typeof import("../auto-prompts.ts").buildExecuteTaskPrompt | null = null;
    try {
      const prompts = await import("../auto-prompts.ts");
      buildExecuteTaskPrompt = prompts.buildExecuteTaskPrompt;
    } catch {
      // prompt builder may not be available in all environments
    }

    // Simulate: cold iteration (after a write — cache is dirty)
    const coldIteration = await bench("iteration (cold: dirty cache)", async () => {
      markCachesDirty();
      invalidateAllCachesIfDirty();
      await deriveStateFromDb(fixtureBase);
      if (buildExecuteTaskPrompt) {
        await buildExecuteTaskPrompt(mid, sid, "Slice 1", tid, "Task 1", fixtureBase);
      }
    }, 20);

    // Simulate: warm iteration (no writes since last iteration — cache clean)
    invalidateAllCaches();
    await deriveState(fixtureBase); // prime cache
    const warmIteration = await bench("iteration (warm: clean cache)", async () => {
      invalidateAllCachesIfDirty(); // no-op — cache is clean
      await deriveState(fixtureBase); // cache hit
      if (buildExecuteTaskPrompt) {
        await buildExecuteTaskPrompt(mid, sid, "Slice 1", tid, "Task 1", fixtureBase);
      }
    }, 20);

    console.log("\n  === End-to-End: Simulated Dispatch Iteration Overhead ===");
    console.log(formatResult(coldIteration));
    console.log(formatResult(warmIteration));
    const savings = coldIteration.avgMs - warmIteration.avgMs;
    const pctSavings = (savings / coldIteration.avgMs) * 100;
    console.log(`  Per-iteration savings (warm vs cold): ${savings.toFixed(2)}ms (${pctSavings.toFixed(1)}%)`);
    console.log(`  Over 100 iterations: ~${(savings * 100 / 1000).toFixed(1)}s saved\n`);
  });
});
