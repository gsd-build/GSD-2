import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTO_TS_PATH = join(__dirname, "..", "auto.ts");
const source = readFileSync(AUTO_TS_PATH, "utf-8");

test("pauseAuto persists model snapshots in paused-session.json", () => {
  assert.ok(
    source.includes("autoModeStartModel: s.autoModeStartModel"),
    "pauseAuto must persist autoModeStartModel in paused-session.json",
  );
  assert.ok(
    source.includes("originalModelId: s.originalModelId"),
    "pauseAuto must persist originalModelId in paused-session.json",
  );
  assert.ok(
    source.includes("originalModelProvider: s.originalModelProvider"),
    "pauseAuto must persist originalModelProvider in paused-session.json",
  );
});

test("pauseAuto restores the user's original model while paused", () => {
  assert.ok(
    /paused-model restore failed/.test(source),
    "pauseAuto should attempt to restore the original model and log failures",
  );
  assert.ok(
    /await pi\.setModel\(original, \{ persist: false \}\)/.test(source),
    "pauseAuto must restore the original model with persist:false so paused interaction returns to the user's model",
  );
  assert.ok(
    /const ok = await pi\.setModel\(original, \{ persist: false \}\);[\s\S]{0,120}if \(!ok\)/.test(source),
    "pauseAuto should handle setModel returning false instead of silently ignoring restore failures",
  );
});

test("resume path stages metadata snapshots and applies them only on accepted resume", () => {
  assert.ok(
    source.includes("const applyRestoredModelSnapshot = () => {"),
    "startAuto should stage paused model snapshot restoration behind an apply helper",
  );
  assert.ok(
    source.includes("applyRestoredModelSnapshot();"),
    "startAuto should apply staged snapshots only in accepted resume branches",
  );

  const helperIdx = source.indexOf("const applyRestoredModelSnapshot = () => {");
  const pausedAcceptedIdx = source.indexOf("s.paused = true;", helperIdx);
  const applyIdx = source.indexOf("applyRestoredModelSnapshot();", pausedAcceptedIdx);
  assert.ok(
    helperIdx > -1 && pausedAcceptedIdx > helperIdx && applyIdx > pausedAcceptedIdx,
    "paused metadata snapshots should be applied after the resume branch has been accepted",
  );
});

test("resume path defers paused-session metadata deletion until lock acquisition", () => {
  assert.ok(
    source.includes("let pausedMetadataCleanupPath: string | null = null;"),
    "startAuto should track paused-session metadata cleanup separately",
  );
  assert.ok(
    source.includes("pausedMetadataCleanupPath = pausedPath;"),
    "accepted resume branches should mark paused metadata for deferred cleanup",
  );

  const lockIdx = source.indexOf("const resumeLock = acquireSessionLock(base);");
  const deferredCleanupIdx = source.indexOf("cleanupPausedMetadataAfterResumeLock(", lockIdx);
  assert.ok(
    lockIdx > -1 && deferredCleanupIdx > lockIdx,
    "paused-session metadata should only be cleaned up after acquireSessionLock succeeds",
  );
});

test("resume path derives paused metadata cleanup path from persisted metadata root", () => {
  assert.ok(
    /const pausedMetadataBase =\s*[\s\S]*meta\?\.originalBasePath[\s\S]*meta\?\.basePath[\s\S]*\|\| base;/.test(source),
    "startAuto should derive paused metadata path from persisted metadata roots before falling back to current base",
  );
  assert.ok(
    source.includes('const pausedPath = join(gsdRoot(pausedMetadataBase), "runtime", "paused-session.json");'),
    "startAuto should resolve paused-session cleanup using the derived metadata base",
  );
});

test("resume path keeps paused session transcript until recovery synthesis runs", () => {
  const synthIdx = source.indexOf("const recovery = synthesizeCrashRecovery(");
  const unlinkIdx = source.indexOf("unlinkSync(pausedSessionFile)");
  const nullIdx = source.indexOf("s.pausedSessionFile = null;", synthIdx);

  assert.ok(
    synthIdx > -1 && unlinkIdx > synthIdx && nullIdx > unlinkIdx,
    "paused session transcript should be synthesized before unlinking and clearing pausedSessionFile",
  );
  assert.equal(
    source.includes("unlinkSync(s.pausedSessionFile)"),
    false,
    "resume path should not unlink pausedSessionFile before recovery synthesis",
  );
});

test("user-initiated resume only backfills model snapshots when missing", () => {
  const resumeCtxBlockStart = source.indexOf('if ("newSession" in ctx && typeof (ctx as any).newSession === "function") {');
  const resumeCtxBlockEnd = source.indexOf("} else if (!s.cmdCtx)", resumeCtxBlockStart);
  assert.ok(resumeCtxBlockStart > -1 && resumeCtxBlockEnd > resumeCtxBlockStart);

  const resumeCtxBlock = source.slice(resumeCtxBlockStart, resumeCtxBlockEnd);
  assert.ok(
    resumeCtxBlock.includes("if (!s.autoModeStartModel)"),
    "resume must not clobber restored autoModeStartModel when it already exists",
  );
  assert.ok(
    resumeCtxBlock.includes("if (!s.originalModelProvider)"),
    "resume must not clobber restored originalModelProvider when it already exists",
  );
  assert.ok(
    resumeCtxBlock.includes("if (!s.originalModelId)"),
    "resume must not clobber restored originalModelId when it already exists",
  );
});
