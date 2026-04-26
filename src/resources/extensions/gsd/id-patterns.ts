/**
 * Shared milestone-ID and dispatch-prompt regex patterns.
 *
 * These patterns were previously inlined at multiple call sites and re-
 * implemented inside `regex-hardening.test.ts`. The local test copies
 * silently hid drift between sites (#4835, #4864) — fixes to one site
 * never broke the test because the test asserted against its own copy.
 *
 * Centralising them here lets every call site import the same
 * definition and lets `regex-hardening.test.ts` exercise the real
 * production regex.
 *
 * Boring-tech rule: this module is regex literals only. No helpers.
 */

/**
 * Captures a milestone ID at the start of a directory name (or filename).
 * Used by milestone-discovery readdir loops to extract the ID prefix
 * from entries that may have additional trailing tokens (e.g.,
 * `M001-CONTEXT.md` or runtime unit JSON paths).
 */
export const MILESTONE_ID_DIR_RE = /^(M\d+(?:-[a-z0-9]{6})?)/;

/**
 * Tests whether a string starts with a milestone ID prefix. Same shape
 * as MILESTONE_ID_DIR_RE but no capture group — used when the caller
 * only needs a boolean.
 */
export const MILESTONE_ID_PREFIX_RE = /^M\d+(?:-[a-z0-9]{6})?/;

/**
 * Strips a leading `M001: ` or `M001-abc123: ` (with optional non-colon
 * tokens between the ID and the colon) from a milestone title heading.
 * Used to render the human-readable name for display in summaries and
 * commit messages.
 */
export const MILESTONE_TITLE_STRIP_RE = /^M\d+(?:-[a-z0-9]{6})?[^:]*:\s*/;

/**
 * Matches the prompt emitted by `prompts/guided-execute-task.md`.
 * Captures: 1=taskId, 2=taskTitle, 3=sliceId, 4=milestoneId.
 */
export const EXECUTE_DISPATCH_RE =
  /Execute the next task:\s+(T\d+)\s+\("([^"]+)"\)\s+in slice\s+(S\d+)\s+of milestone\s+(M\d+(?:-[a-z0-9]{6})?)/i;

/**
 * Matches the prompt emitted by `prompts/guided-resume-task.md`.
 * Captures: 1=sliceId, 2=milestoneId.
 */
export const RESUME_DISPATCH_RE =
  /Resume interrupted work\.[\s\S]*?slice\s+(S\d+)\s+of milestone\s+(M\d+(?:-[a-z0-9]{6})?)/i;
