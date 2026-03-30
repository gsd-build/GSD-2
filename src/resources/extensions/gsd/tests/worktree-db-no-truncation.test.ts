/**
 * worktree-db-no-truncation.test.ts — Regression test for #2815.
 *
 * Verifies that syncProjectRootToWorktree does NOT delete or truncate
 * the worktree's gsd.db file. Under the shared-WAL design (R012),
 * workers resolve to the project root DB via resolveProjectRootDbPath().
 * Deleting the worktree DB races with session startup, creating a 0-byte
 * file that traps workers in an infinite evaluating-gates skip loop.
 */

import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { syncProjectRootToWorktree } from "../auto-worktree.ts";
import { createTestContext } from "./test-helpers.ts";

const { assertTrue, assertEq, report } = createTestContext();

function createBase(name: string): string {
  const base = mkdtempSync(join(tmpdir(), `gsd-wt-2815-${name}-`));
  mkdirSync(join(base, ".gsd", "milestones"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  rmSync(base, { recursive: true, force: true });
}

async function main(): Promise<void> {
  // ─── 1. Worktree gsd.db must NOT be deleted by sync ─────────────────────
  console.log(
    "\n=== 1. #2815: worktree gsd.db preserved after syncProjectRootToWorktree ===",
  );
  {
    const mainBase = createBase("main");
    const wtBase = createBase("wt");

    try {
      // Both have milestone dirs (required for sync to run)
      const prM013 = join(mainBase, ".gsd", "milestones", "M013");
      mkdirSync(prM013, { recursive: true });
      writeFileSync(join(prM013, "M013-ROADMAP.md"), "# roadmap");

      const wtM013 = join(wtBase, ".gsd", "milestones", "M013");
      mkdirSync(wtM013, { recursive: true });

      // Simulate a worktree DB (stale or otherwise)
      const wtDbPath = join(wtBase, ".gsd", "gsd.db");
      writeFileSync(wtDbPath, "FAKE_SQLITE_DATA_FOR_TEST");

      syncProjectRootToWorktree(mainBase, wtBase, "M013");

      // gsd.db must still exist and retain its content
      assertTrue(
        existsSync(wtDbPath),
        "#2815: worktree gsd.db still exists after sync",
      );
      assertEq(
        readFileSync(wtDbPath, "utf-8"),
        "FAKE_SQLITE_DATA_FOR_TEST",
        "#2815: worktree gsd.db content not truncated",
      );
    } finally {
      cleanup(mainBase);
      cleanup(wtBase);
    }
  }

  // ─── 2. Sync still works when worktree has no gsd.db ───────────────────
  console.log(
    "\n=== 2. #2815: sync succeeds when worktree has no gsd.db ===",
  );
  {
    const mainBase = createBase("main");
    const wtBase = createBase("wt");

    try {
      const prM013 = join(mainBase, ".gsd", "milestones", "M013");
      mkdirSync(prM013, { recursive: true });
      writeFileSync(join(prM013, "M013-ROADMAP.md"), "# roadmap");

      // No gsd.db in worktree — should not be created by sync
      syncProjectRootToWorktree(mainBase, wtBase, "M013");

      // gsd.db should NOT be created by sync
      assertTrue(
        !existsSync(join(wtBase, ".gsd", "gsd.db")),
        "#2815: sync does not create gsd.db in worktree",
      );

      // But the milestone files should still be synced
      assertTrue(
        existsSync(join(wtBase, ".gsd", "milestones", "M013", "M013-ROADMAP.md")),
        "#2815: milestone files still synced correctly",
      );
    } finally {
      cleanup(mainBase);
      cleanup(wtBase);
    }
  }

  report();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
