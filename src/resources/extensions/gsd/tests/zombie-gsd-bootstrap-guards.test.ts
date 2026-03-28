import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createTestContext } from "./test-helpers.ts";

const { assertTrue, report } = createTestContext();

const guidedFlowSource = readFileSync(
  join(import.meta.dirname, "..", "guided-flow.ts"),
  "utf-8",
);
const autoStartSource = readFileSync(
  join(import.meta.dirname, "..", "auto-start.ts"),
  "utf-8",
);

assertTrue(
  guidedFlowSource.includes("hasProjectBootstrapArtifacts"),
  "guided-flow.ts should define a bootstrap-artifact guard for zombie .gsd state (#2942)",
);
assertTrue(
  guidedFlowSource.includes("detection.v2.hasPreferences || detection.v2.milestoneCount > 0"),
  "bootstrap-artifact guard should require preferences or real milestones (#2942)",
);
assertTrue(
  autoStartSource.includes('const milestonesPath = join(gsdDir, "milestones");'),
  "auto-start.ts should check milestones/ instead of raw .gsd existence (#2942)",
);
assertTrue(
  autoStartSource.includes("if (!existsSync(milestonesPath))"),
  "auto-start.ts should bootstrap the milestones/ directory when missing (#2942)",
);

report();
