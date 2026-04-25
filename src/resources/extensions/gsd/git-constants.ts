/**
 * Shared git constants used across git-service and native-git-bridge.
 */

/**
 * Parent process env vars that, if leaked into a git child process, can
 * silently redirect every operation to a different repo or index.
 *
 * Stripped from GIT_NO_PROMPT_ENV so a GSD invoked from inside a git hook,
 * a different worktree's terminal, or any context that pre-set these vars
 * cannot redirect GSD's git operations to the wrong target.
 * (Issue #4980 NEW-1)
 */
const LEAKING_GIT_ENV_VARS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_NAMESPACE",
] as const;

function buildSafeParentEnv(): NodeJS.ProcessEnv {
  const safe: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!LEAKING_GIT_ENV_VARS.includes(k as (typeof LEAKING_GIT_ENV_VARS)[number])) {
      safe[k] = v;
    }
  }
  return safe;
}

/** Env overlay that suppresses interactive git credential prompts and git-svn noise. */
export const GIT_NO_PROMPT_ENV = {
  ...buildSafeParentEnv(),
  GIT_TERMINAL_PROMPT: "0",
  GIT_ASKPASS: "",
  GIT_SVN_ID: "",
  LC_ALL: "C", // force English git output so stderr string checks work on all locales (#1997)
};
