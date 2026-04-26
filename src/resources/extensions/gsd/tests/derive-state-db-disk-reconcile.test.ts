/**
 * derive-state-db-disk-reconcile.test.ts — #2416
 *
 * After migration to DB-backed state, milestones that exist on disk
 * (in .gsd/milestones/) but were never imported into the DB become
 * invisible to deriveStateFromDb(). This test verifies that
 * deriveStateFromDb reconciles disk milestones with DB milestones.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { deriveStateFromDb, invalidateStateCache } from "../state.ts";
import {
  openDatabase,
  closeDatabase,
  insertMilestone,
  insertSlice,
  insertTask,
} from "../gsd-db.ts";
import { createTestContext } from "./test-helpers.ts";

const { assertEq, assertTrue, report } = createTestContext();

function createFixtureBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-disk-reconcile-"));
  mkdirSync(join(base, ".gsd", "milestones"), { recursive: true });
  return base;
}

function writeFile(base: string, relativePath: string, content: string): void {
  const full = join(base, ".gsd", relativePath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

function cleanup(base: string): void {
  rmSync(base, { recursive: true, force: true });
}

const CONTEXT_CONTENT = `# M002: Disk-Only Milestone

This milestone exists on disk but not in the DB.

## Must-Haves
- Something important
`;

const ROADMAP_CONTENT = `# M002: Disk-Only Milestone

**Vision:** Test disk reconciliation.

## Slices

- [ ] **S01: First Slice** \`risk:low\` \`depends:[]\`
  > Do something.
`;

async function main(): Promise<void> {
  console.log("\n=== #2416: deriveStateFromDb reconciles disk milestones ===");

  // Set up: M001 in DB, M002 on disk only
  const base = createFixtureBase();
  const dbPath = join(base, ".gsd", "gsd.db");

  try {
    openDatabase(dbPath);

    // M001 is in the DB with a complete status
    insertMilestone({ id: "M001", title: "M001: DB Milestone", status: "complete", depends_on: [] });
    insertSlice({ id: "S01", milestoneId: "M001", title: "S01: Done Slice", status: "complete", depends: [] });

    // Write M001 summary on disk (marks it complete on filesystem too)
    writeFile(base, "milestones/M001/SUMMARY.md", "# M001: DB Milestone\n\nDone.");

    // M002 exists ONLY on disk, not in DB
    writeFile(base, "milestones/M002/CONTEXT.md", CONTEXT_CONTENT);
    writeFile(base, "milestones/M002/ROADMAP.md", ROADMAP_CONTENT);

    invalidateStateCache();
    const state = await deriveStateFromDb(base);

    // M002 should be visible in the registry
    const m002Entry = state.registry.find((m) => m.id === "M002");
    assertTrue(
      m002Entry !== undefined,
      "M002 (disk-only milestone) should appear in state.registry (#2416)",
    );

    // M001 should still be in the registry
    const m001Entry = state.registry.find((m) => m.id === "M001");
    assertTrue(
      m001Entry !== undefined,
      "M001 (DB milestone) should still appear in state.registry",
    );

    // The active milestone should be M002 (since M001 is complete)
    assertTrue(
      state.activeMilestone !== null,
      "There should be an active milestone",
    );
    if (state.activeMilestone) {
      assertEq(
        state.activeMilestone.id,
        "M002",
        "Active milestone should be M002 (disk-only, not complete) (#2416)",
      );
    }
  } finally {
    closeDatabase();
    cleanup(base);
  }

  console.log("\n=== #4974: summary-only disk milestones keep parsed title ===");

  {
    const summaryOnlyBase = createFixtureBase();
    const summaryOnlyDbPath = join(summaryOnlyBase, ".gsd", "gsd.db");

    try {
      openDatabase(summaryOnlyDbPath);
      insertMilestone({ id: "M001", title: "M001: Existing DB Milestone", status: "complete", depends_on: [] });

      writeFile(
        summaryOnlyBase,
        "milestones/M002/SUMMARY.md",
        `---\nid: M002\nstatus: complete\n---\n\n# M002: Summary-Only Milestone\n\nComplete.`,
      );

      invalidateStateCache();
      const state = await deriveStateFromDb(summaryOnlyBase);
      const m002Entry = state.registry.find((m) => m.id === "M002");

      assertTrue(
        m002Entry !== undefined,
        "M002 summary-only disk milestone should appear in state.registry (#4974)",
      );
      assertEq(
        m002Entry?.title,
        "Summary-Only Milestone",
        "M002 summary-only disk milestone should use parsed SUMMARY title (#4974)",
      );
      assertEq(
        m002Entry?.status,
        "complete",
        "M002 summary-only disk milestone should reconcile as complete (#4974)",
      );
    } finally {
      closeDatabase();
      cleanup(summaryOnlyBase);
    }
  }

  report();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
