/**
 * GSD Queue Reorder UI
 *
 * Interactive TUI overlay for reordering pending milestones.
 * ↑/↓ directly moves the selected item. Enter confirms.
 * Conflicting depends_on entries are auto-removed on confirm.
 */

import type { ExtensionContext } from "@gsd/pi-coding-agent";
import { type Theme } from "@gsd/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, type TUI } from "@gsd/pi-tui";
import { makeUI, GLYPH } from "../shared/ui.js";
import { validateQueueOrder, type DependencyValidation } from "./queue-order.js";

export interface ReorderItem {
  id: string;
  title: string;
  dependsOn?: string[];
}

export interface ReorderResult {
  order: string[];
  /** depends_on entries to remove from CONTEXT.md files */
  depsToRemove: Array<{ milestone: string; dep: string }>;
}

/**
 * Show the queue reorder overlay.
 * Returns the new order + deps to remove, or null if cancelled.
 */
export async function showQueueReorder(
  ctx: ExtensionContext,
  completed: ReorderItem[],
  pending: ReorderItem[],
): Promise<ReorderResult | null> {
  if (!ctx.hasUI) return null;
  if (pending.length < 2) return null;

  return ctx.ui.custom<ReorderResult | null>((tui: TUI, theme: Theme, _kb, done) => {
    const items = [...pending];
    let cursor = 0;
    let cachedLines: string[] | undefined;
    let validation: DependencyValidation;

    // Mutable deps map — tracks removals during this session
    const liveDeps = new Map<string, string[]>();
    for (const item of [...completed, ...pending]) {
      if (item.dependsOn && item.dependsOn.length > 0) {
        liveDeps.set(item.id, [...item.dependsOn]);
      }
    }

    const removedDeps: Array<{ milestone: string; dep: string }> = [];
    const completedIds = new Set(completed.map(c => c.id));

    function revalidate() {
      validation = validateQueueOrder(items.map(i => i.id), liveDeps, completedIds);
    }

    revalidate();

    function refresh() {
      cachedLines = undefined;
      tui.requestRender();
    }

    function swapItems(fromIdx: number, toIdx: number) {
      if (toIdx < 0 || toIdx >= items.length) return;
      const [item] = items.splice(fromIdx, 1);
      items.splice(toIdx, 0, item);
      cursor = toIdx;
      revalidate();
      refresh();
    }

    function removeDep(milestone: string, dep: string) {
      const deps = liveDeps.get(milestone);
      if (!deps) return;
      const idx = deps.indexOf(dep);
      if (idx >= 0) {
        deps.splice(idx, 1);
        if (deps.length === 0) liveDeps.delete(milestone);
        removedDeps.push({ milestone, dep });
        const item = items.find(i => i.id === milestone);
        if (item?.dependsOn) {
          item.dependsOn = item.dependsOn.filter(d => d !== dep);
        }
        revalidate();
        refresh();
      }
    }

    function handleInput(data: string) {
      if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
        done(null);
        return;
      }

      // Confirm — auto-resolve would_block violations
      if (matchesKey(data, Key.enter)) {
        const wouldBlock = validation.violations.filter(v => v.type === 'would_block');
        for (const v of wouldBlock) {
          removeDep(v.milestone, v.dependsOn);
        }
        done({ order: items.map(i => i.id), depsToRemove: removedDeps });
        return;
      }

      // ↑/↓ — directly move the selected item
      if (matchesKey(data, Key.up)) {
        swapItems(cursor, cursor - 1);
        return;
      }
      if (matchesKey(data, Key.down)) {
        swapItems(cursor, cursor + 1);
        return;
      }

      // 'd' — manually remove a dep on the cursor item
      if (data === "d" || data === "D") {
        const item = items[cursor];
        const deps = liveDeps.get(item.id);
        if (deps) {
          const activeDep = deps.find(d => !completedIds.has(d));
          if (activeDep) removeDep(item.id, activeDep);
        }
        return;
      }
    }

    function render(width: number): string[] {
      if (cachedLines) return cachedLines;

      const ui = makeUI(theme, width);
      const lines: string[] = [];
      const push = (...rows: string[][]) => { for (const r of rows) lines.push(...r); };
      const add = (s: string) => truncateToWidth(s, width);

      push(ui.bar(), ui.blank(), ui.header("  Queue Reorder"), ui.blank());

      // Completed milestones (dimmed)
      if (completed.length > 0) {
        lines.push(add(theme.fg("dim", "  Completed:")));
        for (const m of completed) {
          const label = m.title && m.title !== m.id ? `${m.id}  ${m.title}` : m.id;
          lines.push(add(`    ${theme.fg("dim", `${GLYPH.statusDone} ${label}`)}`));
        }
        push(ui.blank());
      }

      // Pending milestones — directly movable
      lines.push(add(theme.fg("text", "  Queue:")));

      const violatedPairs = new Set(
        validation.violations.filter(v => v.type === 'would_block').map(v => `${v.milestone}:${v.dependsOn}`),
      );
      const redundantPairs = new Set(
        validation.redundant.map(r => `${r.milestone}:${r.dependsOn}`),
      );

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const isCursor = i === cursor;
        const num = i + 1;
        const label = item.title && item.title !== item.id ? `${item.id}  ${item.title}` : item.id;

        if (isCursor) {
          lines.push(add(`  ${theme.fg("accent", `${GLYPH.cursor} ${num}. ${label}`)}`));
        } else {
          lines.push(add(`    ${theme.fg("text", `${num}. ${label}`)}`));
        }

        // depends_on annotations
        const deps = liveDeps.get(item.id) ?? [];
        for (const dep of deps) {
          if (completedIds.has(dep)) continue;
          const pairKey = `${item.id}:${dep}`;
          if (violatedPairs.has(pairKey)) {
            lines.push(add(`       ${theme.fg("warning", `${GLYPH.statusWarning} depends_on: ${dep} — auto-removed on confirm`)}`));
          } else if (redundantPairs.has(pairKey)) {
            lines.push(add(`       ${theme.fg("dim", `↳ depends_on: ${dep} (redundant)`)}`));
          } else {
            lines.push(add(`       ${theme.fg("dim", `↳ depends_on: ${dep}`)}`));
          }
        }

        // Missing deps
        for (const v of validation.violations.filter(v => v.milestone === item.id && v.type === 'missing_dep')) {
          lines.push(add(`       ${theme.fg("error", `${GLYPH.statusWarning} depends_on: ${v.dependsOn} (does not exist)`)}`));
        }
      }

      // Removed deps feedback
      if (removedDeps.length > 0) {
        push(ui.blank());
        for (const r of removedDeps) {
          lines.push(add(`  ${theme.fg("success", `${GLYPH.statusDone} Removed: ${r.milestone} depends_on ${r.dep}`)}`));
        }
      }

      // Circular warning
      const circ = validation.violations.find(v => v.type === 'circular');
      if (circ) {
        push(ui.blank());
        lines.push(add(`  ${theme.fg("error", `${GLYPH.statusWarning} ${circ.message}`)}`));
      }

      push(ui.blank());

      // Hints — keep short to avoid truncation
      const hints: string[] = ["↑/↓ move"];
      const hasDeps = liveDeps.get(items[cursor]?.id)?.some(d => !completedIds.has(d));
      if (hasDeps) hints.push("d del dep");

      const wouldBlockCount = validation.violations.filter(v => v.type === 'would_block').length;
      if (wouldBlockCount > 0) {
        hints.push(`enter (fixes ${wouldBlockCount} dep)`);
      } else {
        hints.push("enter ok");
      }
      hints.push("esc");

      push(ui.hints(hints), ui.bar());

      cachedLines = lines;
      return lines;
    }

    return { render, invalidate: () => { cachedLines = undefined; }, handleInput };
  }, {
    overlay: true,
    overlayOptions: { width: "70%", minWidth: 50, maxHeight: "80%", anchor: "center" },
  });
}
