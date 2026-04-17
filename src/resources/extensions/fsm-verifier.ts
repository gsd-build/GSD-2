import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { Type } from "@sinclair/typebox";

interface FSMParams {
  states: string[];
  transitions: { from: string; to: string; event?: string }[];
  initial_state: string;
  final_states?: string[];
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "fsm_verify",
    label: "FSM Verifier",
    description: "Verify a finite state machine by checking state reachability, transition validity, and performing mutation-based assertions on transitions. Provide states, transitions, initial state, and optional final states.",
    parameters: Type.Object({
      states: Type.Array(Type.String(), { description: "List of all possible states in the FSM" }),
      transitions: Type.Array(Type.Object({
        from: Type.String({ description: "Source state" }),
        to: Type.String({ description: "Target state" }),
        event: Type.Optional(Type.String({ description: "Triggering event (optional)" }))
      }), { description: "List of valid transitions" }),
      initial_state: Type.String({ description: "The starting state" }),
      final_states: Type.Optional(Type.Array(Type.String(), { description: "States considered terminal (optional)" }))
    }),
    async execute(toolCallId: string, params: FSMParams, signal?: AbortSignal, onUpdate?: (update: any) => void, ctx?: any) {
      if (signal?.aborted) return { content: [{ type: "text", text: "FSM verification cancelled" }], details: {} };

      const { states, transitions, initial_state, final_states = [] } = params;

      // Build adjacency list for quick lookup
      const graph: Record<string, string[]> = {};
      states.forEach((state: string) => graph[state] = []);
      transitions.forEach((t: { from: string; to: string; event?: string }) => {
        if (graph[t.from]) graph[t.from].push(t.to);
      });

      // Check all states and transitions are valid
      const invalidStates = states.filter((s: string) => !graph.hasOwnProperty(s));
      if (invalidStates.length > 0) {
        return { content: [{ type: "text", text: `Invalid states defined: ${invalidStates.join(', ')}` }], details: {} };
      }

      // Check initial state exists
      if (!states.includes(initial_state)) {
        return { content: [{ type: "text", text: `Initial state '${initial_state}' not in states list` }], details: {} };
      }

      // Check final states exist
      const invalidFinals = final_states.filter((s: string) => !states.includes(s));
      if (invalidFinals.length > 0) {
        return { content: [{ type: "text", text: `Invalid final states: ${invalidFinals.join(', ')}` }], details: {} };
      }

      // Find reachable states via BFS from initial
      const reachable = new Set<string>();
      const queue = [initial_state];
      reachable.add(initial_state);
      while (queue.length > 0) {
        const current = queue.shift()!;
        graph[current].forEach(next => {
          if (!reachable.has(next)) {
            reachable.add(next);
            queue.push(next);
          }
        });
      }

      const unreachable = states.filter((s: string) => !reachable.has(s));
      if (unreachable.length > 0) {
        return { content: [{ type: "text", text: `Unreachable states: ${unreachable.join(', ')}` }], details: {} };
      }

      // Mutation-based verification: simulate random walks and assert transitions
      const mutations = 100; // Number of random simulations
      const maxSteps = 50;
      let passed = 0;
      let failed = 0;
      let errors: string[] = [];

      for (let i = 0; i < mutations; i++) {
        let current = initial_state;
        const path: string[] = [current];
        let steps = 0;

        while (steps < maxSteps && !final_states.includes(current)) {
          const possible = graph[current];
          if (possible.length === 0) {
            // Dead end
            if (!final_states.includes(current)) {
              errors.push(`Mutation ${i}: Dead end at '${current}' (path: ${path.join(' -> ')})`);
              failed++;
            } else {
              passed++;
            }
            break;
          }

          // Random transition
          const next = possible[Math.floor(Math.random() * possible.length)];
          if (!states.includes(next)) {
            errors.push(`Mutation ${i}: Invalid transition '${current}' -> '${next}' (path: ${path.join(' -> ')})`);
            failed++;
            break;
          }
          current = next;
          path.push(current);
          steps++;
        }

        if (steps >= maxSteps) {
          errors.push(`Mutation ${i}: Exceeded max steps (${maxSteps}) without reaching final state (path: ${path.join(' -> ')})`);
          failed++;
        } else if (!errors.length) {
          passed++;
        }
      }

      const result = `FSM Verification Complete:
- Total states: ${states.length}
- Total transitions: ${transitions.length}
- Reachable states: ${reachable.size}/${states.length}
- Mutations tested: ${mutations}
- Passed: ${passed}
- Failed: ${failed}`;

      let content = result;
      if (errors.length > 0) {
        content += `\n\nErrors:\n${errors.slice(0, 10).join('\n')}`; // Limit to first 10 errors
      }

      return { content: [{ type: "text", text: content }], details: {} };
    },
  });
}