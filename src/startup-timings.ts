const flag = (process.env.GSD_STARTUP_TIMING ?? process.env.PI_TIMING ?? "").toLowerCase();
const ENABLED = flag === "1" || flag === "true" || flag === "yes";

const timings: Array<{ label: string; ms: number }> = [];
let lastTime = Date.now();

export function markStartup(label: string): void {
  if (!ENABLED) return;
  const now = Date.now();
  timings.push({ label, ms: now - lastTime });
  lastTime = now;
}

export function printStartupTimings(): void {
  if (!ENABLED || timings.length === 0) return;
  const total = timings.reduce((sum, timing) => sum + timing.ms, 0);
  process.stderr.write("\n--- GSD Startup Timings ---\n");
  for (const timing of timings) {
    process.stderr.write(`  ${timing.label}: ${timing.ms}ms\n`);
  }
  process.stderr.write(`  TOTAL: ${total}ms\n`);
  process.stderr.write("----------------------------\n\n");
}
