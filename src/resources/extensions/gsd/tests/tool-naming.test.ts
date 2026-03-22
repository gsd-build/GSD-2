// tool-naming — Verifies canonical + alias tool registration for GSD DB tools.
//
// Each of the 4 DB tools must register under its canonical gsd_concept_action name
// AND under the old gsd_action_concept name as a backward-compatible alias.
// The alias must share the exact same execute function reference as the canonical tool.

import { createTestContext } from './test-helpers.ts';
import { registerDbTools } from '../bootstrap/db-tools.ts';

const { assertEq, assertTrue, report } = createTestContext();

// ─── Mock PI ──────────────────────────────────────────────────────────────────

function makeMockPi() {
  const tools: any[] = [];
  return {
    registerTool: (tool: any) => tools.push(tool),
    tools,
  } as any;
}

// ─── Rename map ───────────────────────────────────────────────────────────────

const RENAME_MAP: Array<{ canonical: string; alias: string }> = [
  { canonical: "gsd_decision_save", alias: "gsd_save_decision" },
  { canonical: "gsd_requirement_update", alias: "gsd_update_requirement" },
  { canonical: "gsd_summary_save", alias: "gsd_save_summary" },
  { canonical: "gsd_milestone_generate_id", alias: "gsd_generate_milestone_id" },
];

// ─── Registration count ──────────────────────────────────────────────────────

console.log('\n── Tool naming: registration count ──');

const pi = makeMockPi();
registerDbTools(pi);

assertEq(pi.tools.length, 8, 'Should register exactly 8 tools (4 canonical + 4 aliases)');

// ─── Both names exist for each pair ──────────────────────────────────────────

console.log('\n── Tool naming: canonical and alias names exist ──');

for (const { canonical, alias } of RENAME_MAP) {
  const canonicalTool = pi.tools.find((t: any) => t.name === canonical);
  const aliasTool = pi.tools.find((t: any) => t.name === alias);

  assertTrue(canonicalTool !== undefined, `Canonical tool "${canonical}" should be registered`);
  assertTrue(aliasTool !== undefined, `Alias tool "${alias}" should be registered`);
}

// ─── Execute function identity ───────────────────────────────────────────────

console.log('\n── Tool naming: execute function identity (===) ──');

for (const { canonical, alias } of RENAME_MAP) {
  const canonicalTool = pi.tools.find((t: any) => t.name === canonical);
  const aliasTool = pi.tools.find((t: any) => t.name === alias);

  if (canonicalTool && aliasTool) {
    assertTrue(
      canonicalTool.execute === aliasTool.execute,
      `"${canonical}" and "${alias}" should share the same execute function reference`,
    );
  }
}

// ─── Alias descriptions include "(alias for ...)" ───────────────────────────

console.log('\n── Tool naming: alias descriptions ──');

for (const { canonical, alias } of RENAME_MAP) {
  const aliasTool = pi.tools.find((t: any) => t.name === alias);

  if (aliasTool) {
    assertTrue(
      aliasTool.description.includes(`alias for ${canonical}`),
      `Alias "${alias}" description should include "alias for ${canonical}"`,
    );
  }
}

// ─── Canonical tools have proper promptGuidelines ────────────────────────────

console.log('\n── Tool naming: canonical promptGuidelines use canonical name ──');

for (const { canonical } of RENAME_MAP) {
  const canonicalTool = pi.tools.find((t: any) => t.name === canonical);

  if (canonicalTool) {
    const guidelinesText = canonicalTool.promptGuidelines.join(' ');
    assertTrue(
      guidelinesText.includes(canonical),
      `Canonical tool "${canonical}" promptGuidelines should reference its own name`,
    );
  }
}

// ─── Alias promptGuidelines direct to canonical ──────────────────────────────

console.log('\n── Tool naming: alias promptGuidelines redirect to canonical ──');

for (const { canonical, alias } of RENAME_MAP) {
  const aliasTool = pi.tools.find((t: any) => t.name === alias);

  if (aliasTool) {
    const guidelinesText = aliasTool.promptGuidelines.join(' ');
    assertTrue(
      guidelinesText.includes(`Alias for ${canonical}`),
      `Alias "${alias}" promptGuidelines should say "Alias for ${canonical}"`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════

report();
