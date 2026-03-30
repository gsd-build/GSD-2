/**
 * GSD / Token Minimization Regression Tests
 *
 * Regression tests ensuring that token-minimization changes to tool
 * descriptions, agent prompts, preferences rendering, workflow dispatch,
 * and prompt cache optimizer integration remain correct:
 *   - descriptions are compressed but retain essential keywords
 *   - promptGuidelines arrays are shorter than the originals
 *   - agent .md files no longer contain removed boilerplate
 *   - renderPreferencesForSystemPrompt emits the new flat format
 *   - GSD-WORKFLOW-DISPATCH.md is compact and retains essential protocol
 *   - prompt-cache-optimizer is wired into system-context assembly
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { renderPreferencesForSystemPrompt } from "../preferences.ts";
import type { GSDPreferences } from "../preferences.ts";
import { section, optimizeForCaching, checkBlockInvalidation, resetBlockHashes, _getBlockHashCount } from "../prompt-cache-optimizer.ts";

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

// From the compiled location (dist-test/src/resources/extensions/gsd/tests/)
// going up 3 levels reaches dist-test/src/resources/, which mirrors the
// src/resources/ tree.  The compile step copies both .ts source files and
// compiled .js files to dist-test, so .ts files are readable there too.
const RESOURCES_DIR = join(import.meta.dirname, "../../../");
const AGENTS_DIR = join(RESOURCES_DIR, "agents");
const BG_SHELL_TOOL = join(
  RESOURCES_DIR,
  "extensions/bg-shell/bg-shell-tool.ts",
);
const BROWSER_NAVIGATION = join(
  RESOURCES_DIR,
  "extensions/browser-tools/tools/navigation.ts",
);
const BROWSER_INTERACTION = join(
  RESOURCES_DIR,
  "extensions/browser-tools/tools/interaction.ts",
);
const BROWSER_FORMS = join(
  RESOURCES_DIR,
  "extensions/browser-tools/tools/forms.ts",
);
const BROWSER_INTENT = join(
  RESOURCES_DIR,
  "extensions/browser-tools/tools/intent.ts",
);
const TOOL_SEARCH = join(
  RESOURCES_DIR,
  "extensions/search-the-web/tool-search.ts",
);
const TOOL_FETCH_PAGE = join(
  RESOURCES_DIR,
  "extensions/search-the-web/tool-fetch-page.ts",
);
const TOOL_LLM_CONTEXT = join(
  RESOURCES_DIR,
  "extensions/search-the-web/tool-llm-context.ts",
);

/** Read a source file as a string, throwing a clear error if missing. */
function readSource(filePath: string): string {
  return readFileSync(filePath, "utf-8");
}

/** Extract the value of the first `description:` string literal in a source chunk. */
function extractFirstDescription(src: string, toolName: string): string {
  // Match `description:\n      "..."` or `description: "..."` (possibly multi-line with +)
  // Strategy: find the description for the named tool registration block.
  const toolIdx = src.indexOf(`name: "${toolName}"`);
  assert.ok(toolIdx >= 0, `tool "${toolName}" not found in source`);

  // From after the name declaration, find the next `description:` assignment
  const fromTool = src.slice(toolIdx);
  const descIdx = fromTool.indexOf("description:");
  assert.ok(descIdx >= 0, `description: not found for "${toolName}"`);

  const fromDesc = fromTool.slice(descIdx);

  // Collect the string value — handles both single-line and concatenated (+) strings.
  // We read until a line that doesn't start with whitespace + quote/+.
  const lines = fromDesc.split("\n");
  const strLines: string[] = [];
  let inString = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inString) {
      if (trimmed.startsWith("description:")) {
        // grab everything after `description:`
        const after = trimmed.slice("description:".length).trim();
        if (after.startsWith('"') || after.startsWith("'")) {
          strLines.push(after);
          inString = true;
          // If the line is a complete string (ends with quote), stop
          if (/^["'][^]*["'],?\s*$/.test(after) && after.length > 2) {
            break;
          }
        }
      }
    } else {
      strLines.push(trimmed);
      if (trimmed.endsWith('",') || trimmed.endsWith('"') || trimmed.endsWith("',") || trimmed.endsWith("'")) {
        break;
      }
    }
  }

  return strLines
    .join(" ")
    .replace(/^["']/, "")
    .replace(/["'],?\s*$/, "")
    .replace(/"\s*\+\s*"/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Count occurrences of a string in source (used for promptGuidelines entry counting). */
function countOccurrences(src: string, needle: string): number {
  let count = 0;
  let idx = 0;
  while ((idx = src.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

// ===========================================================================
// Preferences Rendering Tests
// ===========================================================================

describe("renderPreferencesForSystemPrompt: token-minimization format", () => {
  it("always_use_skills renders 'Always:' prefix on a single line", () => {
    const prefs: GSDPreferences = {
      always_use_skills: ["typescript-pro", "jest-runner"],
    };
    const output = renderPreferencesForSystemPrompt(prefs);
    assert.ok(
      output.includes("Always: typescript-pro, jest-runner"),
      `expected 'Always: ...' line, got:\n${output}`,
    );
  });

  it("prefer_skills renders 'Prefer:' prefix on a single line", () => {
    const prefs: GSDPreferences = {
      prefer_skills: ["eslint-fixer"],
    };
    const output = renderPreferencesForSystemPrompt(prefs);
    assert.ok(
      output.includes("Prefer: eslint-fixer"),
      `expected 'Prefer: ...' line, got:\n${output}`,
    );
  });

  it("avoid_skills renders 'Avoid:' prefix on a single line", () => {
    const prefs: GSDPreferences = {
      avoid_skills: ["legacy-tool"],
    };
    const output = renderPreferencesForSystemPrompt(prefs);
    assert.ok(
      output.includes("Avoid: legacy-tool"),
      `expected 'Avoid: ...' line, got:\n${output}`,
    );
  });

  it("skill_rules renders inline format 'When X: use Y; prefer Z'", () => {
    const prefs: GSDPreferences = {
      skill_rules: [
        {
          when: "writing tests",
          use: ["jest-runner"],
          prefer: ["snapshot-testing"],
        },
      ],
    };
    const output = renderPreferencesForSystemPrompt(prefs);
    assert.ok(
      output.includes("When writing tests:"),
      `expected 'When writing tests:' in output:\n${output}`,
    );
    assert.ok(
      output.includes("use jest-runner"),
      `expected 'use jest-runner' in output:\n${output}`,
    );
    assert.ok(
      output.includes("prefer snapshot-testing"),
      `expected 'prefer snapshot-testing' in output:\n${output}`,
    );
    // inline: parts joined with semicolons on one line
    const rulesLine = output
      .split("\n")
      .find((l) => l.includes("When writing tests:"));
    assert.ok(rulesLine, "rule line should exist");
    assert.ok(
      rulesLine!.includes(";"),
      `expected semicolons joining rule parts, got: ${rulesLine}`,
    );
  });

  it("custom_instructions renders each instruction as a '- ...' bullet", () => {
    const prefs: GSDPreferences = {
      custom_instructions: ["always use async/await", "prefer named exports"],
    };
    const output = renderPreferencesForSystemPrompt(prefs);
    assert.ok(
      output.includes("- always use async/await"),
      `expected '- always use async/await', got:\n${output}`,
    );
    assert.ok(
      output.includes("- prefer named exports"),
      `expected '- prefer named exports', got:\n${output}`,
    );
  });

  it("output still starts with '## GSD Skill Preferences' heading", () => {
    const prefs: GSDPreferences = { always_use_skills: ["typescript-pro"] };
    const output = renderPreferencesForSystemPrompt(prefs);
    assert.ok(
      output.startsWith("## GSD Skill Preferences"),
      `expected heading at start, got:\n${output.slice(0, 80)}`,
    );
  });

  it("empty preferences still includes the policy guidance line", () => {
    const prefs: GSDPreferences = {};
    const output = renderPreferencesForSystemPrompt(prefs);
    assert.ok(
      output.includes("Load listed skills when relevant"),
      `expected policy line, got:\n${output}`,
    );
  });

  it("output fits within a compact character budget (token savings regression guard)", () => {
    // Construct prefs that would previously have generated verbose nested sections
    const prefs: GSDPreferences = {
      always_use_skills: ["typescript-pro", "jest-runner", "eslint-fixer"],
      prefer_skills: ["snapshot-testing"],
      avoid_skills: ["legacy-tool"],
      skill_rules: [
        { when: "writing tests", use: ["jest-runner"], prefer: ["snapshot-testing"] },
        { when: "refactoring", avoid: ["legacy-tool"] },
      ],
      custom_instructions: ["always use async/await", "prefer named exports"],
    };

    const output = renderPreferencesForSystemPrompt(prefs);

    // The flat format should keep the total output under 500 characters for this
    // set of prefs.  If this fails, the rendering has likely regressed to a more
    // verbose multi-section format.
    assert.ok(
      output.length < 500,
      `expected compact output <500 chars, got ${output.length}:\n${output}`,
    );
  });
});

// ===========================================================================
// Agent Prompt Tests
// ===========================================================================

describe("javascript-pro.md: compression regression", () => {
  const src = readSource(join(AGENTS_DIR, "javascript-pro.md"));

  it("does NOT contain 'Persistent Agent Memory' section", () => {
    assert.ok(
      !src.includes("Persistent Agent Memory"),
      "removed boilerplate 'Persistent Agent Memory' should not be present",
    );
  });

  it("does NOT contain hardcoded path '/home/ubuntulinuxqa2'", () => {
    assert.ok(
      !src.includes("/home/ubuntulinuxqa2"),
      "hardcoded path '/home/ubuntulinuxqa2' should not be present",
    );
  });

  it("still contains 'ES2023' keyword", () => {
    assert.ok(src.includes("ES2023"), "expected 'ES2023' keyword");
  });

  it("still contains 'async' keyword", () => {
    assert.ok(src.includes("async"), "expected 'async' keyword");
  });

  it("still contains 'Promise' keyword", () => {
    assert.ok(src.includes("Promise"), "expected 'Promise' keyword");
  });

  it("still contains 'ESLint' keyword", () => {
    assert.ok(src.includes("ESLint"), "expected 'ESLint' keyword");
  });

  it("is under 4000 characters (compression regression guard)", () => {
    assert.ok(
      src.length < 4000,
      `expected <4000 chars, got ${src.length}`,
    );
  });

  it("has valid YAML frontmatter with name, description, model fields", () => {
    assert.ok(src.startsWith("---\n"), "expected frontmatter start '---'");
    const endIdx = src.indexOf("\n---", 4);
    assert.ok(endIdx > 0, "expected closing frontmatter '---'");
    const frontmatter = src.slice(4, endIdx);
    assert.ok(frontmatter.includes("name:"), "expected 'name:' in frontmatter");
    assert.ok(frontmatter.includes("description:"), "expected 'description:' in frontmatter");
    assert.ok(frontmatter.includes("model:"), "expected 'model:' in frontmatter");
  });
});

describe("typescript-pro.md: compression regression", () => {
  const src = readSource(join(AGENTS_DIR, "typescript-pro.md"));

  it("does NOT contain 'Persistent Agent Memory' section", () => {
    assert.ok(
      !src.includes("Persistent Agent Memory"),
      "removed boilerplate 'Persistent Agent Memory' should not be present",
    );
  });

  it("does NOT contain hardcoded path '/home/ubuntulinuxqa2'", () => {
    assert.ok(
      !src.includes("/home/ubuntulinuxqa2"),
      "hardcoded path '/home/ubuntulinuxqa2' should not be present",
    );
  });

  it("still contains 'strict mode' keyword", () => {
    assert.ok(
      src.toLowerCase().includes("strict mode") || src.includes("strict mode") || src.includes("Strict mode"),
      "expected 'strict mode' keyword",
    );
  });

  it("still contains 'discriminated union' keyword", () => {
    assert.ok(
      src.includes("discriminated union") || src.includes("Discriminated union") || src.includes("discriminated unions"),
      "expected 'discriminated union' keyword",
    );
  });

  it("still contains 'generic' keyword", () => {
    assert.ok(
      src.toLowerCase().includes("generic"),
      "expected 'generic' keyword",
    );
  });

  it("still contains 'tsconfig' keyword", () => {
    assert.ok(
      src.includes("tsconfig"),
      "expected 'tsconfig' keyword",
    );
  });

  it("is under 4000 characters (compression regression guard)", () => {
    assert.ok(
      src.length < 4000,
      `expected <4000 chars, got ${src.length}`,
    );
  });

  it("has valid YAML frontmatter with name, description, model fields", () => {
    assert.ok(src.startsWith("---\n"), "expected frontmatter start '---'");
    const endIdx = src.indexOf("\n---", 4);
    assert.ok(endIdx > 0, "expected closing frontmatter '---'");
    const frontmatter = src.slice(4, endIdx);
    assert.ok(frontmatter.includes("name:"), "expected 'name:' in frontmatter");
    assert.ok(frontmatter.includes("description:"), "expected 'description:' in frontmatter");
    assert.ok(frontmatter.includes("model:"), "expected 'model:' in frontmatter");
  });
});

// ===========================================================================
// Tool Description Length Tests
// (Read source .ts files and check description string lengths and
// promptGuidelines entry counts — avoids importing files with complex deps.)
// ===========================================================================

describe("bg-shell-tool.ts: description compression", () => {
  const src = readSource(BG_SHELL_TOOL);

  it("bg_shell description is under 300 characters", () => {
    // Extract the description string for bg_shell registration
    const nameIdx = src.indexOf('name: "bg_shell"');
    assert.ok(nameIdx >= 0, "bg_shell tool name not found");
    const fromTool = src.slice(nameIdx);
    const descMatch = fromTool.match(/description:\s*\n?\s*(["'])([\s\S]*?)\1/);
    assert.ok(descMatch, "description string not found for bg_shell");
    // Also handle multi-line concatenated descriptions
    const descStart = fromTool.indexOf("description:");
    const descEnd = fromTool.indexOf("promptGuidelines:");
    const descBlock = fromTool.slice(descStart, descEnd);
    // Strip TS syntax and measure actual text
    const textOnly = descBlock
      .replace(/description:\s*/g, "")
      .replace(/["']\s*\+\s*["']/g, "")
      .replace(/[+,\n\t]/g, "")
      .replace(/^["']|["']$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    assert.ok(
      textOnly.length < 300,
      `expected bg_shell description <300 chars, got ${textOnly.length}: ${textOnly.slice(0, 100)}`,
    );
  });

  it("bg_shell promptGuidelines has at most 7 entries (was 17)", () => {
    const nameIdx = src.indexOf('name: "bg_shell"');
    assert.ok(nameIdx >= 0, "bg_shell tool name not found");
    const fromTool = src.slice(nameIdx);
    const guidelinesStart = fromTool.indexOf("promptGuidelines:");
    const guidelinesEnd = fromTool.indexOf("],", guidelinesStart);
    assert.ok(guidelinesStart >= 0, "promptGuidelines not found for bg_shell");
    const guidelinesBlock = fromTool.slice(guidelinesStart, guidelinesEnd + 2);
    // Count quoted string entries (each guideline is a quoted string item)
    const entries = (guidelinesBlock.match(/"[^"]{10,}"/g) ?? []).length;
    assert.ok(
      entries <= 7,
      `expected at most 7 promptGuidelines entries, found ${entries}`,
    );
  });
});

describe("browser navigation.ts: description compression", () => {
  const src = readSource(BROWSER_NAVIGATION);

  it("browser_navigate description is under 200 characters", () => {
    const nameIdx = src.indexOf('name: "browser_navigate"');
    assert.ok(nameIdx >= 0, "browser_navigate not found in source");
    const fromTool = src.slice(nameIdx);
    // Find description value between description: and the next non-string token
    const descMatch = fromTool.match(/description:\s*\n?\s*["']([\s\S]*?)["'],/);
    assert.ok(descMatch, "description string not extractable for browser_navigate");
    const desc = descMatch[1].replace(/["']\s*\+\s*["']/g, "").replace(/\s{2,}/g, " ").trim();
    assert.ok(
      desc.length < 200,
      `expected browser_navigate description <200 chars, got ${desc.length}: "${desc}"`,
    );
  });
});

describe("browser interaction.ts: description compression", () => {
  const src = readSource(BROWSER_INTERACTION);

  it("browser_click description is under 200 characters", () => {
    const nameIdx = src.indexOf('name: "browser_click"');
    assert.ok(nameIdx >= 0, "browser_click not found in source");
    const fromTool = src.slice(nameIdx);
    const descMatch = fromTool.match(/description:\s*\n?\s*["']([\s\S]*?)["'],/);
    assert.ok(descMatch, "description string not extractable for browser_click");
    const desc = descMatch[1].replace(/["']\s*\+\s*["']/g, "").replace(/\s{2,}/g, " ").trim();
    assert.ok(
      desc.length < 200,
      `expected browser_click description <200 chars, got ${desc.length}: "${desc}"`,
    );
  });
});

describe("browser forms.ts: description compression", () => {
  const src = readSource(BROWSER_FORMS);

  it("browser_analyze_form description is under 200 characters", () => {
    const nameIdx = src.indexOf('name: "browser_analyze_form"');
    assert.ok(nameIdx >= 0, "browser_analyze_form not found in source");
    const fromTool = src.slice(nameIdx);
    const descMatch = fromTool.match(/description:\s*\n?\s*["']([\s\S]*?)["'],/);
    assert.ok(descMatch, "description string not extractable for browser_analyze_form");
    const desc = descMatch[1].replace(/["']\s*\+\s*["']/g, "").replace(/\s{2,}/g, " ").trim();
    assert.ok(
      desc.length < 200,
      `expected browser_analyze_form description <200 chars, got ${desc.length}: "${desc}"`,
    );
  });
});

describe("browser intent.ts (browser_find_best): description compression", () => {
  const src = readSource(BROWSER_INTENT);

  it("browser_find_best description is under 200 characters", () => {
    const nameIdx = src.indexOf('name: "browser_find_best"');
    assert.ok(nameIdx >= 0, "browser_find_best not found in source");
    const fromTool = src.slice(nameIdx);
    const descMatch = fromTool.match(/description:\s*\n?\s*["']([\s\S]*?)["'],/);
    assert.ok(descMatch, "description string not extractable for browser_find_best");
    const desc = descMatch[1].replace(/["']\s*\+\s*["']/g, "").replace(/\s{2,}/g, " ").trim();
    assert.ok(
      desc.length < 200,
      `expected browser_find_best description <200 chars, got ${desc.length}: "${desc}"`,
    );
  });
});

describe("tool-search.ts: description compression", () => {
  const src = readSource(TOOL_SEARCH);

  it("search-the-web description is under 200 characters", () => {
    const nameIdx = src.indexOf('name: "search-the-web"');
    assert.ok(nameIdx >= 0, "search-the-web not found in source");
    const fromTool = src.slice(nameIdx);
    const descMatch = fromTool.match(/description:\s*\n?\s*["']([\s\S]*?)["'],/);
    assert.ok(descMatch, "description string not extractable for search-the-web");
    const desc = descMatch[1].replace(/["']\s*\+\s*["']/g, "").replace(/\s{2,}/g, " ").trim();
    assert.ok(
      desc.length < 200,
      `expected search-the-web description <200 chars, got ${desc.length}: "${desc}"`,
    );
  });

  it("search-the-web promptGuidelines has at most 2 entries (was 5)", () => {
    const nameIdx = src.indexOf('name: "search-the-web"');
    assert.ok(nameIdx >= 0, "search-the-web not found in source");
    const fromTool = src.slice(nameIdx);
    const guidelinesStart = fromTool.indexOf("promptGuidelines:");
    assert.ok(guidelinesStart >= 0, "promptGuidelines not found for search-the-web");
    const guidelinesEnd = fromTool.indexOf("],", guidelinesStart);
    const guidelinesBlock = fromTool.slice(guidelinesStart, guidelinesEnd + 2);
    const entries = (guidelinesBlock.match(/"[^"]{10,}"/g) ?? []).length;
    assert.ok(
      entries <= 2,
      `expected at most 2 promptGuidelines entries for search-the-web, found ${entries}`,
    );
  });
});

describe("tool-fetch-page.ts: description compression", () => {
  const src = readSource(TOOL_FETCH_PAGE);

  it("fetch_page description is under 200 characters", () => {
    const nameIdx = src.indexOf('name: "fetch_page"');
    assert.ok(nameIdx >= 0, "fetch_page not found in source");
    const fromTool = src.slice(nameIdx);
    const descMatch = fromTool.match(/description:\s*\n?\s*["']([\s\S]*?)["'],/);
    assert.ok(descMatch, "description string not extractable for fetch_page");
    const desc = descMatch[1].replace(/["']\s*\+\s*["']/g, "").replace(/\s{2,}/g, " ").trim();
    assert.ok(
      desc.length < 200,
      `expected fetch_page description <200 chars, got ${desc.length}: "${desc}"`,
    );
  });
});

describe("tool-llm-context.ts (search_and_read): description compression", () => {
  const src = readSource(TOOL_LLM_CONTEXT);

  it("search_and_read description is under 200 characters", () => {
    const nameIdx = src.indexOf('name: "search_and_read"');
    assert.ok(nameIdx >= 0, "search_and_read not found in source");
    const fromTool = src.slice(nameIdx);
    const descMatch = fromTool.match(/description:\s*\n?\s*["']([\s\S]*?)["'],/);
    assert.ok(descMatch, "description string not extractable for search_and_read");
    const desc = descMatch[1].replace(/["']\s*\+\s*["']/g, "").replace(/\s{2,}/g, " ").trim();
    assert.ok(
      desc.length < 200,
      `expected search_and_read description <200 chars, got ${desc.length}: "${desc}"`,
    );
  });
});

// ===========================================================================
// GSD-WORKFLOW-DISPATCH.md: condensed dispatch protocol
// ===========================================================================

const DISPATCH_WORKFLOW = join(RESOURCES_DIR, "GSD-WORKFLOW-DISPATCH.md");
const FULL_WORKFLOW = join(RESOURCES_DIR, "GSD-WORKFLOW.md");

describe("GSD-WORKFLOW-DISPATCH.md: condensed dispatch protocol", () => {
  it("dispatch file exists", () => {
    assert.ok(existsSync(DISPATCH_WORKFLOW), "GSD-WORKFLOW-DISPATCH.md should exist in resources");
  });

  it("is significantly shorter than the full workflow", () => {
    const dispatchContent = readFileSync(DISPATCH_WORKFLOW, "utf-8");
    const fullContent = readFileSync(FULL_WORKFLOW, "utf-8");
    // Dispatch should be less than 30% of the full workflow
    assert.ok(
      dispatchContent.length < fullContent.length * 0.3,
      `dispatch (${dispatchContent.length} chars) should be <30% of full (${fullContent.length} chars)`,
    );
  });

  it("under 100 lines (compression regression guard)", () => {
    const lines = readFileSync(DISPATCH_WORKFLOW, "utf-8").split("\n").length;
    assert.ok(lines < 100, `expected <100 lines, got ${lines}`);
  });

  it("retains Quick Start section", () => {
    const content = readFileSync(DISPATCH_WORKFLOW, "utf-8");
    assert.ok(content.includes("Quick Start"), "should contain Quick Start section");
  });

  it("retains Hierarchy concept", () => {
    const content = readFileSync(DISPATCH_WORKFLOW, "utf-8");
    assert.ok(content.includes("Milestone") && content.includes("Slice") && content.includes("Task"),
      "should describe Milestone → Slice → Task hierarchy");
  });

  it("retains all 7 phase names", () => {
    const content = readFileSync(DISPATCH_WORKFLOW, "utf-8");
    for (const phase of ["Discuss", "Research", "Plan", "Execute", "Verify", "Summarize", "Advance"]) {
      assert.ok(content.includes(phase), `should mention phase: ${phase}`);
    }
  });

  it("retains Continue-Here protocol", () => {
    const content = readFileSync(DISPATCH_WORKFLOW, "utf-8");
    assert.ok(content.includes("continue.md"), "should reference continue.md");
  });

  it("does NOT contain verbose template examples from full version", () => {
    const content = readFileSync(DISPATCH_WORKFLOW, "utf-8");
    // Full version has detailed markdown code block templates for file formats
    assert.ok(!content.includes("```markdown\n# M001:"), "should not contain verbose milestone template");
    assert.ok(!content.includes("```markdown\n# S01:"), "should not contain verbose slice template");
  });
});

// ===========================================================================
// prompt-cache-optimizer: system-context integration
// ===========================================================================

describe("prompt-cache-optimizer: system-context integration pattern", () => {
  it("section() auto-classifies system-prompt as static", () => {
    const s = section("system-prompt", "test content");
    assert.equal(s.role, "static");
  });

  it("section() auto-classifies base-instructions as static", () => {
    const s = section("base-instructions", "test content");
    assert.equal(s.role, "static");
  });

  it("section() allows explicit role override", () => {
    const s = section("unknown-label", "test content", "semi-static");
    assert.equal(s.role, "semi-static");
  });

  it("optimizeForCaching places static before dynamic", () => {
    const sections = [
      section("memories", "dynamic content", "dynamic"),
      section("system-prompt", "static content", "static"),
      section("preferences", "semi-static content", "semi-static"),
    ];
    const result = optimizeForCaching(sections);
    const idx = {
      static: result.prompt.indexOf("static content"),
      semi: result.prompt.indexOf("semi-static content"),
      dynamic: result.prompt.indexOf("dynamic content"),
    };
    assert.ok(idx.static < idx.semi, "static should come before semi-static");
    assert.ok(idx.semi < idx.dynamic, "semi-static should come before dynamic");
  });

  it("optimizeForCaching reports >0 cache efficiency for mixed sections", () => {
    const sections = [
      section("system-prompt", "A".repeat(1000), "static"),
      section("preferences", "B".repeat(500), "semi-static"),
      section("memories", "C".repeat(200), "dynamic"),
    ];
    const result = optimizeForCaching(sections);
    assert.ok(result.cacheEfficiency > 0.5, `expected >50% efficiency, got ${(result.cacheEfficiency * 100).toFixed(1)}%`);
  });

  it("system-context.ts imports and uses prompt-cache-optimizer", () => {
    const ctxSrc = readFileSync(
      join(RESOURCES_DIR, "extensions/gsd/bootstrap/system-context.ts"),
      "utf-8",
    );
    assert.ok(ctxSrc.includes("optimizeForCaching"), "system-context.ts should use optimizeForCaching");
    assert.ok(ctxSrc.includes("prompt-cache-optimizer"), "system-context.ts should import from prompt-cache-optimizer");
    assert.ok(ctxSrc.includes("prompt-cache-stats"), "system-context.ts should log cache stats");
  });
});

// ===========================================================================
// guided-flow.ts: uses dispatch version
// ===========================================================================

describe("guided-flow.ts: uses condensed dispatch workflow", () => {
  it("references GSD_WORKFLOW_DISPATCH_PATH", () => {
    const src = readFileSync(
      join(RESOURCES_DIR, "extensions/gsd/guided-flow.ts"),
      "utf-8",
    );
    assert.ok(src.includes("GSD_WORKFLOW_DISPATCH_PATH"), "guided-flow.ts should reference dispatch path env var");
    assert.ok(src.includes("GSD-WORKFLOW-DISPATCH.md"), "guided-flow.ts should reference dispatch filename");
  });

  it("falls back to full workflow if dispatch unavailable", () => {
    const src = readFileSync(
      join(RESOURCES_DIR, "extensions/gsd/guided-flow.ts"),
      "utf-8",
    );
    assert.ok(src.includes("GSD_WORKFLOW_PATH"), "guided-flow.ts should still reference full workflow as fallback");
  });
});

// ===========================================================================
// Hash-based block invalidation
// ===========================================================================

describe("checkBlockInvalidation: hash-based block caching", () => {
  it("first call reports all blocks as invalidated (cold cache)", () => {
    resetBlockHashes();
    const sections = [
      section("test-static", "content A", "static"),
      section("test-dynamic", "content B", "dynamic"),
    ];
    const result = checkBlockInvalidation(sections);
    assert.equal(result.invalidated.length, 2, "all blocks should be invalidated on first call");
    assert.equal(result.stable.length, 0, "no stable blocks on first call");
    assert.equal(result.stabilityRate, 0);
  });

  it("second call with same content reports all blocks as stable", () => {
    resetBlockHashes();
    const sections = [
      section("hash-a", "unchanged content", "static"),
      section("hash-b", "also unchanged", "semi-static"),
    ];
    checkBlockInvalidation(sections); // warm the cache
    const result = checkBlockInvalidation(sections); // same content
    assert.equal(result.stable.length, 2, "all blocks should be stable on repeat");
    assert.equal(result.invalidated.length, 0);
    assert.equal(result.stabilityRate, 1.0);
  });

  it("detects when a single block changes", () => {
    resetBlockHashes();
    const sections1 = [
      section("block-x", "version 1", "static"),
      section("block-y", "stays same", "semi-static"),
    ];
    checkBlockInvalidation(sections1);

    const sections2 = [
      section("block-x", "version 2", "static"), // changed
      section("block-y", "stays same", "semi-static"), // same
    ];
    const result = checkBlockInvalidation(sections2);
    assert.deepEqual(result.invalidated, ["block-x"]);
    assert.deepEqual(result.stable, ["block-y"]);
    assert.equal(result.stabilityRate, 0.5);
  });

  it("resetBlockHashes clears all cached hashes", () => {
    resetBlockHashes();
    checkBlockInvalidation([section("cached", "data", "static")]);
    assert.ok(_getBlockHashCount() > 0, "should have cached hashes");
    resetBlockHashes();
    assert.equal(_getBlockHashCount(), 0, "reset should clear all hashes");
  });

  it("system-context.ts uses checkBlockInvalidation", () => {
    const ctxSrc = readFileSync(
      join(RESOURCES_DIR, "extensions/gsd/bootstrap/system-context.ts"),
      "utf-8",
    );
    assert.ok(ctxSrc.includes("checkBlockInvalidation"), "should call checkBlockInvalidation");
    assert.ok(ctxSrc.includes("blockStability"), "should log blockStability metric");
  });
});
