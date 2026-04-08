import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { Type } from "@sinclair/typebox";

interface FSMParams {
  states: string[];
  transitions: { from: string; to: string; event?: string }[];
  initial_state: string;
  final_states?: string[];
  title?: string;
  direction?: "TB" | "BT" | "LR" | "RL";
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "fsm_diagram",
    label: "FSM Diagram Generator",
    description: "Generate a Mermaid stateDiagram from an FSM definition. Creates visual diagrams showing states, transitions, and events for documentation and analysis.",
    parameters: Type.Object({
      states: Type.Array(Type.String(), { description: "List of all possible states in the FSM" }),
      transitions: Type.Array(Type.Object({
        from: Type.String({ description: "Source state" }),
        to: Type.String({ description: "Target state" }),
        event: Type.Optional(Type.String({ description: "Triggering event (optional)" }))
      }), { description: "List of valid transitions" }),
      initial_state: Type.String({ description: "The starting state" }),
      final_states: Type.Optional(Type.Array(Type.String(), { description: "States considered terminal (optional)" })),
      title: Type.Optional(Type.String({ description: "Optional diagram title" })),
      direction: Type.Optional(Type.Union([
        Type.Literal("TB"),
        Type.Literal("BT"),
        Type.Literal("LR"),
        Type.Literal("RL")
      ], { description: "Diagram layout direction (default: TB)" }))
    }),
    async execute(toolCallId: string, params: FSMParams, signal?: AbortSignal, onUpdate?: (update: any) => void, ctx?: any) {
      if (signal?.aborted) return { content: [{ type: "text", text: "FSM diagram generation cancelled" }], details: {} };

      const { states, transitions, initial_state, final_states = [], title, direction = "TB" } = params;

      // Validate inputs
      if (!states.includes(initial_state)) {
        return { content: [{ type: "text", text: `Initial state '${initial_state}' not in states list` }], details: {} };
      }

      const invalidFinals = final_states.filter(s => !states.includes(s));
      if (invalidFinals.length > 0) {
        return { content: [{ type: "text", text: `Invalid final states: ${invalidFinals.join(', ')}` }], details: {} };
      }

      // Generate Mermaid code
      const lines: string[] = [];

      // Header
      lines.push("```mermaid");
      lines.push("stateDiagram-v2");

      // Title
      if (title) {
        lines.push(`    title: ${title}`);
      }

      // Direction
      lines.push(`    direction ${direction}`);

      // States
      for (const state of states) {
        if (state === initial_state) {
          lines.push(`    [*] --> ${formatStateName(state)}`);
        }
        if (final_states.includes(state)) {
          lines.push(`    ${formatStateName(state)} --> [*]`);
        }
      }

      // Transitions
      for (const transition of transitions) {
        const from = formatStateName(transition.from);
        const to = formatStateName(transition.to);
        let arrow = `${from} --> ${to}`;
        if (transition.event) {
          arrow += ` : ${transition.event}`;
        }
        lines.push(`    ${arrow}`);
      }

      lines.push("```");

      const mermaidCode = lines.join("\n");

      return { content: [{ type: "text", text: mermaidCode }], details: {} };
    },
  });
}

function formatStateName(state: string): string {
  // Mermaid state names should be valid identifiers
  // Replace spaces and special chars with underscores
  return state.replace(/[^a-zA-Z0-9_]/g, "_");
}