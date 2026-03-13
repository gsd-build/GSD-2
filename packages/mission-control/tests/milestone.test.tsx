/**
 * Milestone component tests (Phase 04-02 Task 2).
 *
 * Pattern: Direct function call on components + JSON.stringify inspection,
 * matching the approach used in sidebar.test.tsx.
 */
import { describe, expect, it } from "bun:test";
import { ProgressBar } from "../src/components/shared/ProgressBar";
import { MilestoneHeader } from "../src/components/milestone/MilestoneHeader";
import { PhaseRow } from "../src/components/milestone/PhaseRow";
import { CommittedHistory } from "../src/components/milestone/CommittedHistory";
import type { GSD2State, PhaseState } from "../src/server/types";

const mockGsd2State: GSD2State = {
  projectState: {
    gsd_state_version: "1.0",
    milestone: "v1.0",
    milestone_name: "Mission Control",
    status: "active",
    active_milestone: "M001",
    active_slice: "S01",
    active_task: "T01",
    auto_mode: false,
    cost: 0.50,
    tokens: 10000,
    last_updated: "",
    last_activity: "",
  },
  roadmap: {
    milestoneId: "M001",
    milestoneName: "Mission Control",
    slices: [
      {
        id: "S01",
        name: "Foundation",
        status: "in_progress",
        taskCount: 3,
        costEstimate: 0.20,
        branch: "gsd/M001/S01",
        dependencies: [],
      },
      {
        id: "S02",
        name: "UI Layer",
        status: "planned",
        taskCount: 5,
        costEstimate: 0.30,
        branch: "gsd/M001/S02",
        dependencies: [],
      },
    ],
  },
  activePlan: null,
  activeTask: null,
  decisions: null,
  preferences: {
    budget_ceiling: 1.00,
  },
  project: null,
  milestoneContext: null,
  needsMigration: false,
  slices: [
    {
      id: "S01",
      name: "Foundation",
      status: "in_progress",
      taskCount: 3,
      costEstimate: 0.20,
      branch: "gsd/M001/S01",
      dependencies: [],
    },
  ],
  uatFile: null,
  gitBranchCommits: 3,
  lastCommitMessage: "feat: initial setup",
};

function makePhase(overrides: Partial<PhaseState> = {}): PhaseState {
  return {
    number: 1,
    name: "Setup",
    status: "not_started",
    completedPlans: 0,
    plans: [],
    ...overrides,
  };
}

describe("ProgressBar", () => {
  it("renders correct width percentage", () => {
    const result = ProgressBar({ value: 75 });
    const json = JSON.stringify(result);
    expect(json).toContain("75%");
    expect(json).toContain("bg-cyan-accent");
  });

  it("clamps value to 0-100", () => {
    const over = ProgressBar({ value: 150 });
    const overJson = JSON.stringify(over);
    expect(overJson).toContain("100%");
    expect(overJson).not.toContain("150%");

    const under = ProgressBar({ value: -20 });
    const underJson = JSON.stringify(under);
    expect(underJson).toContain("0%");
    expect(underJson).not.toContain("-20%");
  });
});

describe("MilestoneHeader", () => {
  it("renders milestone name and total cost when given valid GSD2State", () => {
    const result = MilestoneHeader({ gsd2State: mockGsd2State });
    const json = JSON.stringify(result);
    expect(json).toContain("Mission Control");
    // Total cost of slices: 0.20 (S01 costEstimate)
    expect(json).toContain("total cost");
    // Budget ceiling bar rendered (value = 0.20/1.00 * 100 = 20)
    expect(json).toContain('"value":20');
    // Active slice shown in badge
    expect(json).toContain("S01");
  });

  it("renders placeholder/skeleton when gsd2State is null", () => {
    const result = MilestoneHeader({ gsd2State: null });
    const json = JSON.stringify(result);
    expect(json).toContain("animate-pulse");
    expect(json).not.toContain("Mission Control");
  });
});

describe("PhaseRow", () => {
  it("renders status icon, phase number, description, and progress fraction", () => {
    const phase = makePhase({
      number: 2,
      name: "Pipeline",
      status: "in_progress",
      completedPlans: 1,
      plans: [
        { phase: "02", plan: 1, wave: 1, requirements: [], autonomous: true, type: "execute", files_modified: [], depends_on: [] },
        { phase: "02", plan: 2, wave: 1, requirements: [], autonomous: true, type: "execute", files_modified: [], depends_on: [] },
      ],
    });
    const result = PhaseRow({ phase, description: "Data pipeline" });
    const json = JSON.stringify(result);
    // React serializes mixed children: ["Phase ",2] and [1,"/",2]
    expect(json).toContain('"Phase "');
    expect(json).toContain("Data pipeline");
    expect(json).toContain('1,"/",2');
    expect(json).toContain("text-status-warning");
    expect(json).toContain("animate-spin");
  });

  it("shows commit message area for completed phase", () => {
    const phase = makePhase({
      number: 1,
      status: "complete",
      completedPlans: 2,
      plans: [
        { phase: "01", plan: 1, wave: 1, requirements: [], autonomous: true, type: "execute", files_modified: [], depends_on: [] },
        { phase: "01", plan: 2, wave: 1, requirements: [], autonomous: true, type: "execute", files_modified: [], depends_on: [] },
      ],
    });
    const result = PhaseRow({ phase });
    const json = JSON.stringify(result);
    // React serializes: ["Phase ",1," complete"]
    expect(json).toContain('"Phase "');
    expect(json).toContain('" complete"');
    expect(json).toContain("text-status-success");
  });
});

describe("CommittedHistory", () => {
  it("renders completed phases only", () => {
    const phases: PhaseState[] = [
      makePhase({ number: 1, name: "Setup", status: "complete", completedPlans: 2 }),
      makePhase({ number: 2, name: "Pipeline", status: "in_progress", completedPlans: 1 }),
      makePhase({ number: 3, name: "UI", status: "not_started" }),
    ];
    const result = CommittedHistory({ phases });
    const json = JSON.stringify(result);
    expect(json).toContain("Committed History");
    expect(json).toContain("Setup");
    // React serializes: ["Phase ",1," complete"]
    expect(json).toContain('" complete"');
    expect(json).not.toContain("Pipeline");
    expect(json).not.toContain("UI");
  });

  it("renders nothing when no phases are complete", () => {
    const phases: PhaseState[] = [
      makePhase({ number: 1, status: "in_progress" }),
      makePhase({ number: 2, status: "not_started" }),
    ];
    const result = CommittedHistory({ phases });
    expect(result).toBeNull();
  });
});
