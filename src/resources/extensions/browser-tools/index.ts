/** browser-tools — pi extension: full browser interaction via Playwright. */
import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import type { ToolDeps } from "./state.js";
import { ensureBrowser, closeBrowser, getActivePage, getActiveTarget, getActivePageOrNull, attachPageListeners } from "./lifecycle.js";
import { captureCompactPageState, postActionSummary, constrainScreenshot, captureErrorScreenshot } from "./capture.js";
import { settleAfterActionAdaptive, ensureMutationCounter } from "./settle.js";
import { buildRefSnapshot, resolveRefTarget } from "./refs.js";
import * as u from "./utils.js";
import { registerNavigationTools } from "./tools/navigation.js";
import { registerScreenshotTools } from "./tools/screenshot.js";
import { registerInteractionTools } from "./tools/interaction.js";
import { registerInspectionTools } from "./tools/inspection.js";
import { registerSessionTools } from "./tools/session.js";
import { registerAssertionTools } from "./tools/assertions.js";
import { registerRefTools } from "./tools/refs.js";
import { registerWaitTools } from "./tools/wait.js";
import { registerPageTools } from "./tools/pages.js";
import { registerFormTools } from "./tools/forms.js";
import { registerIntentTools } from "./tools/intent.js";
import { registerPdfTools } from "./tools/pdf.js";
import { registerStatePersistenceTools } from "./tools/state-persistence.js";
import { registerNetworkMockTools } from "./tools/network-mock.js";
import { registerDeviceTools } from "./tools/device.js";
import { registerExtractTools } from "./tools/extract.js";
import { registerVisualDiffTools } from "./tools/visual-diff.js";
import { registerZoomTools } from "./tools/zoom.js";
import { registerCodegenTools } from "./tools/codegen.js";
import { registerActionCacheTools } from "./tools/action-cache.js";
import { registerInjectionDetectionTools } from "./tools/injection-detect.js";
import { registerFlowTools } from "./tools/verify-flow.js";

export default function (pi: ExtensionAPI) {
	pi.on("session_shutdown", async () => { await closeBrowser(); });
	const deps: ToolDeps = {
		ensureBrowser, closeBrowser, getActivePage, getActiveTarget, getActivePageOrNull, attachPageListeners,
		captureCompactPageState, postActionSummary, constrainScreenshot, captureErrorScreenshot,
		formatCompactStateSummary: u.formatCompactStateSummary, getRecentErrors: u.getRecentErrors,
		settleAfterActionAdaptive, ensureMutationCounter, buildRefSnapshot, resolveRefTarget,
		parseRef: u.parseRef, formatVersionedRef: u.formatVersionedRef, staleRefGuidance: u.staleRefGuidance,
		beginTrackedAction: u.beginTrackedAction, finishTrackedAction: u.finishTrackedAction,
		truncateText: u.truncateText, verificationFromChecks: u.verificationFromChecks,
		verificationLine: u.verificationLine, collectAssertionState: (p, checks, target?) => u.collectAssertionState(p, checks, captureCompactPageState, target),
		formatAssertionText: u.formatAssertionText, formatDiffText: u.formatDiffText,
		getUrlHash: u.getUrlHash,
		captureClickTargetState: u.captureClickTargetState, readInputLikeValue: u.readInputLikeValue,
		firstErrorLine: u.firstErrorLine, captureAccessibilityMarkdown: (selector?) => u.captureAccessibilityMarkdown(getActiveTarget(), selector),
		resolveAccessibilityScope: u.resolveAccessibilityScope,
		getLivePagesSnapshot: u.createGetLivePagesSnapshot(ensureBrowser),
		getSinceTimestamp: u.getSinceTimestamp, getConsoleEntriesSince: u.getConsoleEntriesSince,
		getNetworkEntriesSince: u.getNetworkEntriesSince, writeArtifactFile: u.writeArtifactFile,
		copyArtifactFile: u.copyArtifactFile, ensureSessionArtifactDir: u.ensureSessionArtifactDir,
		buildSessionArtifactPath: u.buildSessionArtifactPath, getSessionArtifactMetadata: u.getSessionArtifactMetadata,
		sanitizeArtifactName: u.sanitizeArtifactName, formatArtifactTimestamp: u.formatArtifactTimestamp,
	};
	registerNavigationTools(pi, deps);  registerScreenshotTools(pi, deps);
	registerInteractionTools(pi, deps); registerInspectionTools(pi, deps);
	registerSessionTools(pi, deps);     registerAssertionTools(pi, deps);
	registerRefTools(pi, deps);         registerWaitTools(pi, deps);
	registerPageTools(pi, deps);
	registerFormTools(pi, deps);
	registerIntentTools(pi, deps);
	registerPdfTools(pi, deps);
	registerStatePersistenceTools(pi, deps);
	registerNetworkMockTools(pi, deps);
	registerDeviceTools(pi, deps);
	registerExtractTools(pi, deps);
	registerVisualDiffTools(pi, deps);
	registerZoomTools(pi, deps);
	registerCodegenTools(pi, deps);
	registerActionCacheTools(pi, deps);
	registerInjectionDetectionTools(pi, deps);
	registerFlowTools(pi, deps);
}
