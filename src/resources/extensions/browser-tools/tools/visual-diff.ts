import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { ToolDeps } from "../state.js";

/**
 * Visual regression diffing — compare current page screenshot against a stored baseline.
 */

const BASELINE_DIR = ".gsd/browser-baselines";

export function registerVisualDiffTools(pi: ExtensionAPI, deps: ToolDeps): void {
	pi.registerTool({
		name: "browser_visual_diff",
		label: "Browser Visual Diff",
		description:
			"Compare current page screenshot against a stored baseline pixel-by-pixel. " +
			"Returns similarity score (0–1), diff pixel count, and optionally generates a diff image highlighting changes. " +
			"On first run with no baseline, saves the current screenshot as the baseline. " +
			"Baselines are stored in .gsd/browser-baselines/ (gitignored, environment-specific).",
		parameters: Type.Object({
			name: Type.Optional(
				Type.String({
					description:
						"Baseline name (default: auto-generated from URL + viewport). " +
						"Use consistent names to compare the same view across runs.",
				}),
			),
			selector: Type.Optional(
				Type.String({
					description: "CSS selector to scope comparison to a specific element instead of full viewport.",
				}),
			),
			threshold: Type.Optional(
				Type.Number({
					description:
						"Pixel matching threshold 0–1 (default: 0.1). " +
						"Higher values are more tolerant of anti-aliasing and rendering differences.",
				}),
			),
			updateBaseline: Type.Optional(
				Type.Boolean({
					description: "If true, overwrite the existing baseline with the current screenshot (default: false).",
				}),
			),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				const { page: p } = await deps.ensureBrowser();
				const { mkdir, readFile, writeFile } = await import("node:fs/promises");
				const pathMod = await import("node:path");

				const baselineDir = pathMod.resolve(process.cwd(), BASELINE_DIR);
				await mkdir(baselineDir, { recursive: true });

				// Ensure .gitignore
				const gitignorePath = pathMod.join(baselineDir, ".gitignore");
				await writeFile(gitignorePath, "*\n!.gitignore\n").catch(() => { /* best-effort — .gitignore may already exist or dir may be read-only */ });

				// Generate baseline name
				const url = p.url();
				const viewport = p.viewportSize();
				const vpSuffix = viewport ? `${viewport.width}x${viewport.height}` : "unknown";
				const autoName = deps.sanitizeArtifactName(
					`${new URL(url).pathname.replace(/\//g, "-")}-${vpSuffix}`,
					`baseline-${vpSuffix}`,
				);
				const name = deps.sanitizeArtifactName(params.name ?? autoName, autoName);

				const baselinePath = pathMod.join(baselineDir, `${name}.png`);
				const diffPath = pathMod.join(baselineDir, `${name}-diff.png`);

				// Capture current screenshot as PNG (needed for pixel comparison)
				let currentBuffer: Buffer;
				if (params.selector) {
					const locator = p.locator(params.selector).first();
					currentBuffer = await locator.screenshot({ type: "png" });
				} else {
					currentBuffer = await p.screenshot({ type: "png", fullPage: false });
				}

				// Check if baseline exists
				let baselineBuffer: Buffer | null = null;
				try {
					baselineBuffer = await readFile(baselinePath) as Buffer;
				} catch {
					// No baseline yet
				}

				if (!baselineBuffer || params.updateBaseline) {
					// Save as new baseline
					await writeFile(baselinePath, currentBuffer);
					return {
						content: [{
							type: "text",
							text: baselineBuffer
								? `Baseline updated: ${baselinePath}\nSize: ${(currentBuffer.length / 1024).toFixed(1)} KB`
								: `Baseline created (first run): ${baselinePath}\nSize: ${(currentBuffer.length / 1024).toFixed(1)} KB\nRe-run to compare against this baseline.`,
						}],
						details: {
							baselinePath,
							baselineCreated: !baselineBuffer,
							baselineUpdated: !!baselineBuffer,
							sizeBytes: currentBuffer.length,
						},
					};
				}

				// Perform pixel comparison using sharp for PNG decoding
				const sharp = (await import("sharp")).default;

				const baselineMeta = await sharp(baselineBuffer).metadata();
				const currentMeta = await sharp(currentBuffer).metadata();

				const bWidth = baselineMeta.width ?? 0;
				const bHeight = baselineMeta.height ?? 0;
				const cWidth = currentMeta.width ?? 0;
				const cHeight = currentMeta.height ?? 0;

				// If dimensions differ, report mismatch
				if (bWidth !== cWidth || bHeight !== cHeight) {
					return {
						content: [{
							type: "text",
							text: `Dimension mismatch: baseline is ${bWidth}x${bHeight}, current is ${cWidth}x${cHeight}. Cannot compare.\nUse updateBaseline: true to reset.`,
						}],
						details: {
							match: false,
							dimensionMismatch: true,
							baselineDimensions: { width: bWidth, height: bHeight },
							currentDimensions: { width: cWidth, height: cHeight },
						},
					};
				}

				// Extract raw RGBA pixel data
				const baselineRaw = await sharp(baselineBuffer).ensureAlpha().raw().toBuffer();
				const currentRaw = await sharp(currentBuffer).ensureAlpha().raw().toBuffer();

				const width = bWidth;
				const height = bHeight;
				const totalPixels = width * height;
				const threshold = params.threshold ?? 0.1;

				// Simple pixel-by-pixel comparison (avoiding pixelmatch dependency)
				const diffData = Buffer.alloc(width * height * 4);
				let diffPixels = 0;
				const thresholdSq = threshold * threshold * 255 * 255 * 3;

				for (let i = 0; i < totalPixels; i++) {
					const offset = i * 4;
					const dr = baselineRaw[offset] - currentRaw[offset];
					const dg = baselineRaw[offset + 1] - currentRaw[offset + 1];
					const db = baselineRaw[offset + 2] - currentRaw[offset + 2];
					const distSq = dr * dr + dg * dg + db * db;

					if (distSq > thresholdSq) {
						diffPixels++;
						// Mark diff pixels as red
						diffData[offset] = 255;     // R
						diffData[offset + 1] = 0;   // G
						diffData[offset + 2] = 0;   // B
						diffData[offset + 3] = 255; // A
					} else {
						// Dim unchanged pixels
						diffData[offset] = currentRaw[offset] >> 1;
						diffData[offset + 1] = currentRaw[offset + 1] >> 1;
						diffData[offset + 2] = currentRaw[offset + 2] >> 1;
						diffData[offset + 3] = 255;
					}
				}

				const similarity = 1 - (diffPixels / totalPixels);
				const match = diffPixels === 0;

				// Save diff image
				await sharp(diffData, { raw: { width, height, channels: 4 } })
					.png()
					.toFile(diffPath);

				return {
					content: [{
						type: "text",
						text: match
							? `Visual diff: MATCH (100% similar)\nBaseline: ${baselinePath}`
							: `Visual diff: ${(similarity * 100).toFixed(2)}% similar\nDiff pixels: ${diffPixels} of ${totalPixels} (${((diffPixels / totalPixels) * 100).toFixed(2)}%)\nDiff image: ${diffPath}\nBaseline: ${baselinePath}`,
					}],
					details: {
						match,
						similarity,
						diffPixels,
						totalPixels,
						diffPercentage: (diffPixels / totalPixels) * 100,
						dimensions: { width, height },
						baselinePath,
						diffImagePath: match ? undefined : diffPath,
						threshold,
					},
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `Visual diff failed: ${err.message}` }],
					details: { error: err.message },
					isError: true,
				};
			}
		},
	});
}
