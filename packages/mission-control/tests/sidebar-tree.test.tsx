/**
 * Sidebar tree navigation tests (Phase 06.2-02 Task 1).
 *
 * Tests for useSidebarNav hook, SingleColumnView router,
 * and view component rendering.
 *
 * Pattern: Direct function call on components + JSON.stringify inspection,
 * matching the approach used in sidebar.test.tsx and layout.test.tsx.
 */
import { describe, expect, it } from "bun:test";
import { SingleColumnView } from "../src/components/layout/SingleColumnView";
import { ChatView } from "../src/components/views/ChatView";
import { MilestoneView } from "../src/components/views/MilestoneView";
import { SliceView } from "../src/components/views/SliceView";
import type { ViewType } from "../src/lib/view-types";

describe("useSidebarNav", () => {
  it("exports as a function", async () => {
    const mod = await import("../src/hooks/useSidebarNav");
    expect(typeof mod.useSidebarNav).toBe("function");
  });
});

describe("ViewType", () => {
  it("supports all expected view kinds", () => {
    const views: ViewType[] = [
      { kind: "chat" },
      { kind: "activity" },
      { kind: "milestone" },
      { kind: "milestone", milestoneId: "ms-1" },
      { kind: "slice", phaseId: "3" },
      { kind: "history" },
      { kind: "verify" },
    ];
    expect(views.length).toBe(7);
    expect(views[0].kind).toBe("chat");
    expect(views[4].kind).toBe("slice");
  });
});

describe("SingleColumnView", () => {
  const baseProps = {
    planningState: null,
    chatMessages: [],
    onChatSend: () => {},
    isChatProcessing: false,
    activities: [],
  };

  it("renders ChatView when kind is chat", () => {
    const result = SingleColumnView({
      ...baseProps,
      activeView: { kind: "chat" },
    });
    const json = JSON.stringify(result);
    // Should contain ChatView content with animation wrapper
    expect(json).toContain("animate-in");
    expect(json).toContain("fade-in");
    expect(json).toContain('"key":"chat"');
    expect(json).toContain("isChatProcessing");
  });

  it("renders MilestoneView when kind is milestone", () => {
    const result = SingleColumnView({
      ...baseProps,
      activeView: { kind: "milestone" },
    });
    const json = JSON.stringify(result);
    expect(json).toContain('"key":"milestone"');
    // MilestoneView is rendered as a child with gsd2State prop
    expect(json).toContain('"gsd2State":null');
  });

  it("renders SliceView when kind is slice", () => {
    const result = SingleColumnView({
      ...baseProps,
      activeView: { kind: "slice", phaseId: "3" },
    });
    const json = JSON.stringify(result);
    expect(json).toContain('"key":"slice"');
  });

  it("renders ActivityView for activity kind", () => {
    const result = SingleColumnView({
      ...baseProps,
      activeView: { kind: "activity" },
    });
    // ActivityView is a component with hooks, so direct call returns a React element
    expect(result).toBeDefined();
  });

  it("renders VerifyView for verify kind", () => {
    const result = SingleColumnView({
      ...baseProps,
      activeView: { kind: "verify" },
    });
    expect(result).toBeDefined();
  });

  it("renders HistoryView for history kind", () => {
    const result = SingleColumnView({
      ...baseProps,
      activeView: { kind: "history" },
    });
    expect(result).toBeDefined();
  });
});

describe("ChatView", () => {
  it("exports as a function component", () => {
    expect(typeof ChatView).toBe("function");
  });

  it("renders without planning state", () => {
    const result = ChatView({
      planningState: null,
      chatMessages: [],
      onChatSend: () => {},
      isChatProcessing: false,
    });
    const json = JSON.stringify(result);
    // Should render flex-col layout with task status and chat panel areas
    expect(json).toContain("flex flex-col h-full");
    expect(json).toContain("border-b border-navy-600 bg-navy-900/50");
    expect(json).toContain("flex-1 min-h-0");
  });
});

describe("MilestoneView", () => {
  it("exports as a function component", () => {
    expect(typeof MilestoneView).toBe("function");
  });

  it("renders loading state when gsd2State is null", () => {
    const result = MilestoneView({ gsd2State: null });
    const json = JSON.stringify(result);
    expect(json).toContain("Milestone");
  });
});

describe("SliceView", () => {
  it("exports as a function component", () => {
    expect(typeof SliceView).toBe("function");
  });

  it("renders loading state when planningState is null", () => {
    const result = SliceView({ planningState: null });
    const json = JSON.stringify(result);
    expect(json).toContain("Slice Detail");
  });
});
