import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { relMilestoneFile, milestonesDir } from "./paths.js";
import { parseRoadmapSlices } from "./roadmap-slices.js";
import { extractMilestoneSeq, milestoneIdSort } from "./guided-flow.js";

const SLICE_DISPATCH_TYPES = new Set([
  "research-slice",
  "plan-slice",
  "replan-slice",
  "execute-task",
  "complete-slice",
]);

function readTrackedFileFromBranch(base: string, branch: string, relPath: string): string | null {
  try {
    return execSync(`git show ${branch}:${relPath}`, {
      cwd: base,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
    }).trim();
  } catch {
    return null;
  }
}

export function getPriorSliceCompletionBlocker(base: string, mainBranch: string, unitType: string, unitId: string): string | null {
  if (!SLICE_DISPATCH_TYPES.has(unitType)) return null;

  const [targetMid, targetSid] = unitId.split("/");
  if (!targetMid || !targetSid) return null;

  const targetSeq = extractMilestoneSeq(targetMid);
  if (targetSeq === 0) return null;

  // Scan actual milestone directories instead of iterating by number
  let milestoneIds: string[];
  try {
    milestoneIds = readdirSync(milestonesDir(base), { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const match = d.name.match(/^(M\d+(?:-[a-z0-9]{6})?)/);
        return match ? match[1] : null;
      })
      .filter((id): id is string => id !== null)
      .sort(milestoneIdSort)
      .filter(id => extractMilestoneSeq(id) <= targetSeq);
  } catch {
    return null;
  }

  for (const mid of milestoneIds) {
    const roadmapRel = relMilestoneFile(base, mid, "ROADMAP");
    if (!roadmapRel) continue;

    const roadmapContent = readTrackedFileFromBranch(base, mainBranch, roadmapRel);
    if (!roadmapContent) continue;

    const slices = parseRoadmapSlices(roadmapContent);
    if (mid !== targetMid) {
      const incomplete = slices.find(slice => !slice.done);
      if (incomplete) {
        return `Cannot dispatch ${unitType} ${unitId}: earlier slice ${mid}/${incomplete.id} is not complete on ${mainBranch}.`;
      }
      continue;
    }

    const targetIndex = slices.findIndex(slice => slice.id === targetSid);
    if (targetIndex === -1) return null;

    const incomplete = slices.slice(0, targetIndex).find(slice => !slice.done);
    if (incomplete) {
      return `Cannot dispatch ${unitType} ${unitId}: earlier slice ${targetMid}/${incomplete.id} is not complete on ${mainBranch}.`;
    }
  }

  return null;
}
