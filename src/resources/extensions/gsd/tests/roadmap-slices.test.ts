import test from "node:test";
import assert from "node:assert/strict";
import { parseRoadmap } from "../files.ts";
import { parseRoadmapSlices, expandDependencies } from "../roadmap-slices.ts";

const content = `# M003: Current

**Vision:** Build the thing.

## Slices
- [x] **S01: First Slice** \`risk:low\` \`depends:[]\`
  > After this: First demo works.
- [ ] **S02: Second Slice** \`risk:medium\` \`depends:[S01]\`
- [x] **S03: Third Slice** \`depends:[S01, S02]\`
  > After this: Third demo works.

## Boundary Map
### S01 → S02
Produces:
  foo.ts
`;

test("parseRoadmapSlices extracts slices with dependencies and risk", () => {
  const slices = parseRoadmapSlices(content);
  assert.equal(slices.length, 3);
  assert.equal(slices[0]?.id, "S01");
  assert.equal(slices[0]?.done, true);
  assert.equal(slices[0]?.demo, "First demo works.");
  assert.deepEqual(slices[1]?.depends, ["S01"]);
  assert.equal(slices[1]?.risk, "medium");
  assert.equal(slices[2]?.risk, "low");
  assert.deepEqual(slices[2]?.depends, ["S01", "S02"]);
});

test("parseRoadmap integration: uses extracted slice parser", () => {
  const roadmap = parseRoadmap(content);
  assert.equal(roadmap.title, "M003: Current");
  assert.equal(roadmap.vision, "Build the thing.");
  assert.equal(roadmap.slices.length, 3);
  assert.equal(roadmap.boundaryMap.length, 1);
});

test("expandDependencies: plain IDs, ranges, and edge cases", () => {
  assert.deepEqual(expandDependencies([]), []);
  assert.deepEqual(expandDependencies(["S01"]), ["S01"]);
  assert.deepEqual(expandDependencies(["S01", "S03"]), ["S01", "S03"]);
  assert.deepEqual(expandDependencies(["S01-S04"]), ["S01", "S02", "S03", "S04"]);
  assert.deepEqual(expandDependencies(["S01-S01"]), ["S01"]);
  assert.deepEqual(expandDependencies(["S01..S03"]), ["S01", "S02", "S03"]);
  assert.deepEqual(expandDependencies(["S01-S03", "S05"]), ["S01", "S02", "S03", "S05"]);
  assert.deepEqual(expandDependencies(["S04-S01"]), ["S04-S01"]);
  assert.deepEqual(expandDependencies(["S01-T04"]), ["S01-T04"]);
});

test("parseRoadmapSlices: range syntax in depends expanded", () => {
  const rangeContent = `# M016: Test\n\n## Slices\n- [x] **S01: A** \`risk:low\` \`depends:[]\`\n- [x] **S02: B** \`risk:low\` \`depends:[]\`\n- [x] **S03: C** \`risk:low\` \`depends:[]\`\n- [x] **S04: D** \`risk:low\` \`depends:[]\`\n- [ ] **S05: E** \`risk:low\` \`depends:[S01-S04]\`\n  > After this: all done\n`;
  const slices = parseRoadmapSlices(rangeContent);
  assert.equal(slices.length, 5);
  assert.deepEqual(slices[4]?.depends, ["S01", "S02", "S03", "S04"]);
});

test("parseRoadmapSlices: comma-separated depends still works", () => {
  const commaContent = `# M001: Test\n\n## Slices\n- [ ] **S05: E** \`risk:low\` \`depends:[S01,S02,S03,S04]\`\n  > After this: done\n`;
  const slices = parseRoadmapSlices(commaContent);
  assert.deepEqual(slices[0]?.depends, ["S01", "S02", "S03", "S04"]);
});
