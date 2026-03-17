import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { getSuggestedNextCommands, indexWorkspace, listDoctorScopeSuggestions } from "../workspace-index.ts";
import { createTestContext } from './test-helpers.ts';

const { assertEq, assertTrue, report } = createTestContext();
const base = mkdtempSync(join(tmpdir(), "gsd-workspace-index-test-"));
const gsd = join(base, ".gsd");
const mDir = join(gsd, "milestones", "M001");
const sDir = join(mDir, "slices", "S01");
const tDir = join(sDir, "tasks");
mkdirSync(tDir, { recursive: true });

writeFileSync(join(mDir, "M001-ROADMAP.md"), `# M001: Demo Milestone

## Slices
- [ ] **S01: Demo Slice** \`risk:low\` \`depends:[]\`
  > After this: demo works
`);

writeFileSync(join(sDir, "S01-PLAN.md"), `# S01: Demo Slice

**Goal:** Demo
**Demo:** Demo

## Must-Haves
- done

## Tasks
- [ ] **T01: Implement thing** \`est:10m\`
  Task is in progress.
`);

writeFileSync(join(tDir, "T01-PLAN.md"), `# T01: Implement thing

## Steps
- do it
`);

async function main(): Promise<void> {
  console.log("\n=== workspace index ===");
  {
    const index = await indexWorkspace(base);
    assertEq(index.active.milestoneId, "M001", "active milestone indexed");
    assertEq(index.active.sliceId, "S01", "active slice indexed");
    assertEq(index.active.taskId, "T01", "active task indexed");
    assertTrue(index.scopes.some(scope => scope.scope === "M001/S01"), "slice scope listed");
    assertTrue(index.scopes.some(scope => scope.scope === "M001/S01/T01"), "task scope listed");
  }

  console.log("\n=== doctor scope suggestions ===");
  {
    const suggestions = await listDoctorScopeSuggestions(base);
    assertEq(suggestions[0].value, "M001/S01", "active slice suggested first");
    assertTrue(suggestions.some(item => item.value === "M001/S01/T01"), "task scope suggested");
  }

  console.log("\n=== next command suggestions ===");
  {
    const commands = await getSuggestedNextCommands(base);
    assertTrue(commands.includes("/run"), "suggests auto during execution");
    assertTrue(commands.includes("/gsd doctor M001/S01"), "suggests scoped doctor");
    assertTrue(commands.includes("/gsd status"), "suggests status");
  }

  rmSync(base, { recursive: true, force: true });
  report();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
